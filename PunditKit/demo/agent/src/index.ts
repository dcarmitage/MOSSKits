import { Hono } from 'hono';
import { cors } from 'hono/cors';
import type {
  Bindings,
  ResearchQueueMessage,
  Market,
  MarketWithDetails,
  ResearchPath,
  ResearchPathWithSources,
  ResearchSource,
  Evaluation,
  Trade,
  JournalEntry,
  DailySnapshot,
  Settings,
  Prompt,
  PromptStage,
  ResearchTechnique
} from './types';
import {
  logJournalEntry,
  getJournalEntries,
  generateDailySnapshot,
  getDailySnapshot,
  listDailySnapshots
} from './agents/chronicler';
import {
  executeResearch,
  executeDeepResearch,
  createDeepResearchInteraction,
  pollDeepResearchUntilComplete
} from './agents/researcher';
import { evaluateMarket } from './agents/analyst';
import { executeTrade } from './agents/trader';
// Note: Scout scanning now happens in Portal via Playwriter (browser-side)

const app = new Hono<{ Bindings: Bindings }>();

// CORS middleware
app.use('*', cors({
  origin: '*',
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type'],
}));

// =============================================================================
// Health & Settings
// =============================================================================

app.get('/health', (c) => {
  return c.json({
    status: 'ok',
    version: '1.0.0',
    service: 'pundit-agent'
  });
});

app.get('/settings', async (c) => {
  const result = await c.env.DB.prepare(
    'SELECT key, value FROM settings'
  ).all<{ key: string; value: string }>();

  const settings: Record<string, string> = {};
  for (const row of result.results) {
    // Mask API keys
    if (row.key.includes('api_key')) {
      settings[row.key] = row.value ? '********' + row.value.slice(-4) : '';
    } else {
      settings[row.key] = row.value;
    }
  }

  return c.json(settings);
});

app.post('/settings', async (c) => {
  const body = await c.req.json<Settings>();

  for (const [key, value] of Object.entries(body)) {
    if (value !== undefined && value !== null) {
      // Don't overwrite with masked values
      if (typeof value === 'string' && value.startsWith('********')) {
        continue;
      }

      await c.env.DB.prepare(`
        INSERT INTO settings (key, value, updated_at)
        VALUES (?, ?, datetime('now'))
        ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
      `).bind(key, String(value)).run();
    }
  }

  await logJournalEntry(c.env.DB, 'system', 'settings_updated', {
    keys: Object.keys(body)
  });

  return c.json({ success: true });
});

// Helper to get a setting
async function getSetting(db: D1Database, key: string): Promise<string | null> {
  const result = await db.prepare(
    'SELECT value FROM settings WHERE key = ?'
  ).bind(key).first<{ value: string }>();
  return result?.value || null;
}

// Helper to get active prompt for a stage
async function getActivePrompt(db: D1Database, stage: PromptStage): Promise<Prompt | null> {
  const result = await db.prepare(
    'SELECT * FROM prompts WHERE stage = ? AND is_active = TRUE'
  ).bind(stage).first<Prompt>();
  return result || null;
}

// =============================================================================
// Prompts
// =============================================================================

// List all prompts (optionally filter by stage)
app.get('/prompts', async (c) => {
  const stage = c.req.query('stage') as PromptStage | undefined;

  let query = 'SELECT * FROM prompts';
  const params: string[] = [];

  if (stage) {
    query += ' WHERE stage = ?';
    params.push(stage);
  }

  query += ' ORDER BY is_active DESC, updated_at DESC';

  const result = await c.env.DB.prepare(query).bind(...params).all<Prompt>();
  return c.json(result.results);
});

// Get single prompt
app.get('/prompts/:id', async (c) => {
  const id = c.req.param('id');

  const prompt = await c.env.DB.prepare(
    'SELECT * FROM prompts WHERE id = ?'
  ).bind(id).first<Prompt>();

  if (!prompt) {
    return c.json({ error: 'Prompt not found' }, 404);
  }

  return c.json(prompt);
});

// Create new prompt
app.post('/prompts', async (c) => {
  const body = await c.req.json<Partial<Prompt>>();

  if (!body.stage || !body.name || !body.user_prompt || !body.model) {
    return c.json({ error: 'stage, name, user_prompt, and model are required' }, 400);
  }

  const id = crypto.randomUUID();

  await c.env.DB.prepare(`
    INSERT INTO prompts (id, stage, name, system_prompt, user_prompt, model, temperature, max_tokens, is_active, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    id,
    body.stage,
    body.name,
    body.system_prompt || null,
    body.user_prompt,
    body.model,
    body.temperature ?? 0.2,
    body.max_tokens ?? 2048,
    body.is_active ?? false,
    body.notes || null
  ).run();

  await logJournalEntry(c.env.DB, 'system', 'prompt_created', {
    promptId: id,
    stage: body.stage,
    name: body.name,
    model: body.model
  });

  const prompt = await c.env.DB.prepare(
    'SELECT * FROM prompts WHERE id = ?'
  ).bind(id).first<Prompt>();

  return c.json(prompt, 201);
});

// Update prompt
app.put('/prompts/:id', async (c) => {
  const id = c.req.param('id');
  const body = await c.req.json<Partial<Prompt>>();

  const existing = await c.env.DB.prepare(
    'SELECT * FROM prompts WHERE id = ?'
  ).bind(id).first<Prompt>();

  if (!existing) {
    return c.json({ error: 'Prompt not found' }, 404);
  }

  await c.env.DB.prepare(`
    UPDATE prompts SET
      name = COALESCE(?, name),
      system_prompt = COALESCE(?, system_prompt),
      user_prompt = COALESCE(?, user_prompt),
      model = COALESCE(?, model),
      temperature = COALESCE(?, temperature),
      max_tokens = COALESCE(?, max_tokens),
      notes = COALESCE(?, notes),
      updated_at = datetime('now')
    WHERE id = ?
  `).bind(
    body.name || null,
    body.system_prompt !== undefined ? body.system_prompt : null,
    body.user_prompt || null,
    body.model || null,
    body.temperature ?? null,
    body.max_tokens ?? null,
    body.notes !== undefined ? body.notes : null,
    id
  ).run();

  const prompt = await c.env.DB.prepare(
    'SELECT * FROM prompts WHERE id = ?'
  ).bind(id).first<Prompt>();

  return c.json(prompt);
});

// Delete prompt (can't delete if active)
app.delete('/prompts/:id', async (c) => {
  const id = c.req.param('id');

  const existing = await c.env.DB.prepare(
    'SELECT * FROM prompts WHERE id = ?'
  ).bind(id).first<Prompt>();

  if (!existing) {
    return c.json({ error: 'Prompt not found' }, 404);
  }

  if (existing.is_active) {
    return c.json({ error: 'Cannot delete active prompt. Set another prompt as active first.' }, 400);
  }

  await c.env.DB.prepare('DELETE FROM prompts WHERE id = ?').bind(id).run();

  await logJournalEntry(c.env.DB, 'system', 'prompt_deleted', {
    promptId: id,
    stage: existing.stage,
    name: existing.name
  });

  return c.json({ success: true });
});

// Set prompt as active (deactivates other prompts in same stage)
app.post('/prompts/:id/activate', async (c) => {
  const id = c.req.param('id');

  const prompt = await c.env.DB.prepare(
    'SELECT * FROM prompts WHERE id = ?'
  ).bind(id).first<Prompt>();

  if (!prompt) {
    return c.json({ error: 'Prompt not found' }, 404);
  }

  // Deactivate all other prompts in same stage
  await c.env.DB.prepare(
    'UPDATE prompts SET is_active = FALSE, updated_at = datetime(\'now\') WHERE stage = ? AND id != ?'
  ).bind(prompt.stage, id).run();

  // Activate this prompt
  await c.env.DB.prepare(
    'UPDATE prompts SET is_active = TRUE, updated_at = datetime(\'now\') WHERE id = ?'
  ).bind(id).run();

  await logJournalEntry(c.env.DB, 'system', 'prompt_activated', {
    promptId: id,
    stage: prompt.stage,
    name: prompt.name
  });

  const updated = await c.env.DB.prepare(
    'SELECT * FROM prompts WHERE id = ?'
  ).bind(id).first<Prompt>();

  return c.json(updated);
});

// Seed default prompts (call once to initialize)
app.post('/prompts/seed', async (c) => {
  // Check if prompts already exist
  const existing = await c.env.DB.prepare('SELECT COUNT(*) as count FROM prompts').first<{ count: number }>();
  if (existing && existing.count > 0) {
    return c.json({ message: 'Prompts already seeded', count: existing.count });
  }

  // Default Research Prompt - Deep Research Pro
  const researchPromptId = crypto.randomUUID();
  const researchPrompt = `You are researching a prediction market question to estimate the probability of the outcome.

MARKET QUESTION: {market_question}
CURRENT MARKET ODDS: {current_odds}% YES / {100 - current_odds}% NO
RESOLUTION DATE: {end_date}

Research goal: Find information that could affect the probability of this outcome.

Focus your investigation on:
1. Recent news and developments (last 30 days especially)
2. Historical precedents and base rates
3. Expert opinions and official statements
4. Key dates, deadlines, or catalysts
5. Contrarian evidence - what could make the market wrong?

Provide granular source attribution for each claim.

Structure your report:
1. EXECUTIVE SUMMARY (2-3 paragraphs)
2. KEY FACTORS SUPPORTING YES (bulleted, with dates/numbers)
3. KEY FACTORS SUPPORTING NO (bulleted, with dates/numbers)
4. CONTRADICTIONS & UNCERTAINTIES
5. SOURCE LIST (URL, title, publish date, relevance)

Be calibrated. If evidence is weak or conflicting, say so explicitly.`;

  await c.env.DB.prepare(`
    INSERT INTO prompts (id, stage, name, system_prompt, user_prompt, model, temperature, max_tokens, is_active, notes)
    VALUES (?, 'research', 'Balanced Research v1', NULL, ?, 'deep-research-pro-preview-12-2025', 0.2, 4096, TRUE, 'Default research prompt for Deep Research Pro')
  `).bind(researchPromptId, researchPrompt).run();

  // Default Evaluation Prompt - Claude Opus 4.5
  const evalPromptId = crypto.randomUUID();
  const evalSystemPrompt = `You are an expert prediction market analyst. Your job is to estimate probabilities for binary outcomes based on research evidence.

CALIBRATION IS CRITICAL:
- When you say 70%, the outcome should happen ~70% of the time
- Avoid overconfidence - rarely go below 10% or above 90% without overwhelming evidence
- Account for unknown unknowns - surprising things happen

ANALYSIS FRAMEWORK:
Before estimating, explicitly work through:
1. BASE RATE: What's the historical frequency of similar events?
2. EVIDENCE STRENGTH: How reliable, recent, and comprehensive is the research?
3. MARKET SIGNAL: The market reflects collective wisdom. Why might it be right? Why wrong?
4. KEY UNCERTAINTIES: What unknown factors could dramatically swing the outcome?

OUTPUT: Respond with a JSON object containing your structured analysis.`;

  const evalUserPrompt = `MARKET: {market_question}
RESOLUTION DATE: {end_date}
CURRENT MARKET ODDS: {current_odds}% YES / {100 - current_odds}% NO

=== RESEARCH FINDINGS ===
{research_summary}

Analyze this market. Think step by step, then provide your probability estimate.

Your response MUST be valid JSON with this structure:
{
  "probability": 0.XX,
  "confidence": "high" | "medium" | "low",
  "base_rate": {
    "estimate": "XX%",
    "reasoning": "Brief explanation of historical precedent"
  },
  "key_factors_yes": [
    "Most important factor supporting YES",
    "Second factor",
    "Third factor"
  ],
  "key_factors_no": [
    "Most important factor supporting NO",
    "Second factor",
    "Third factor"
  ],
  "main_uncertainty": "The biggest unknown that could change everything",
  "market_comparison": "Why I [agree/disagree] with the {current_odds}% market odds - [specific reasoning]",
  "reasoning": "Full reasoning paragraph synthesizing the above"
}

Remember: probability must be between 0.05 and 0.95. Extreme probabilities require extreme evidence.`;

  await c.env.DB.prepare(`
    INSERT INTO prompts (id, stage, name, system_prompt, user_prompt, model, temperature, max_tokens, is_active, notes)
    VALUES (?, 'evaluation', 'Calibrated Analyst v1', ?, ?, 'claude-opus-4-5-20251101', 0.2, 2048, TRUE, 'Default evaluation prompt for Claude Opus 4.5 with structured output')
  `).bind(evalPromptId, evalSystemPrompt, evalUserPrompt).run();

  // Quick Research Prompt - Gemini 3 Pro
  const quickResearchId = crypto.randomUUID();
  const quickResearchPrompt = `Quick research scan for prediction market:

MARKET: {market_question}
ODDS: {current_odds}% YES
END DATE: {end_date}

Find the most recent and relevant news/developments that could affect this outcome.

Focus on:
- Breaking news from last 7 days
- Official announcements
- Key upcoming events/dates

Keep it concise. Cite sources with URLs.`;

  await c.env.DB.prepare(`
    INSERT INTO prompts (id, stage, name, system_prompt, user_prompt, model, temperature, max_tokens, is_active, notes)
    VALUES (?, 'research', 'Quick Scan v1', NULL, ?, 'gemini-3-pro-preview', 0.2, 2048, FALSE, 'Fast research prompt for Gemini 3 Pro quick scans')
  `).bind(quickResearchId, quickResearchPrompt).run();

  await logJournalEntry(c.env.DB, 'system', 'prompts_seeded', {
    researchPromptId,
    evalPromptId,
    quickResearchId
  });

  return c.json({
    success: true,
    prompts: {
      research: researchPromptId,
      evaluation: evalPromptId,
      quickResearch: quickResearchId
    }
  }, 201);
});

// =============================================================================
// Events
// =============================================================================

app.get('/events', async (c) => {
  const limit = parseInt(c.req.query('limit') || '100');

  const result = await c.env.DB.prepare(`
    SELECT e.*,
      (SELECT COUNT(*) FROM markets WHERE event_id = e.id) as market_count
    FROM events e
    ORDER BY e.updated_at DESC
    LIMIT ?
  `).bind(limit).all();

  return c.json(result.results);
});

app.get('/events/:id', async (c) => {
  const id = c.req.param('id');

  const event = await c.env.DB.prepare(
    'SELECT * FROM events WHERE id = ?'
  ).bind(id).first();

  if (!event) {
    return c.json({ error: 'Event not found' }, 404);
  }

  // Get all markets for this event
  const markets = await c.env.DB.prepare(
    'SELECT * FROM markets WHERE event_id = ? ORDER BY volume DESC'
  ).bind(id).all<Market>();

  return c.json({
    ...event,
    markets: markets.results
  });
});

// =============================================================================
// Markets
// =============================================================================

app.get('/markets', async (c) => {
  const status = c.req.query('status');
  const platform = c.req.query('platform');
  const limit = parseInt(c.req.query('limit') || '50');
  const offset = parseInt(c.req.query('offset') || '0');

  let query = 'SELECT * FROM markets WHERE 1=1';
  const params: (string | number)[] = [];

  if (status) {
    query += ' AND status = ?';
    params.push(status);
  }

  if (platform) {
    query += ' AND platform = ?';
    params.push(platform);
  }

  query += ' ORDER BY updated_at DESC LIMIT ? OFFSET ?';
  params.push(limit, offset);

  const result = await c.env.DB.prepare(query).bind(...params).all<Market>();
  return c.json(result.results);
});

app.get('/markets/:id', async (c) => {
  const id = c.req.param('id');

  const market = await c.env.DB.prepare(
    'SELECT * FROM markets WHERE id = ?'
  ).bind(id).first<Market>();

  if (!market) {
    return c.json({ error: 'Market not found' }, 404);
  }

  // Get related data
  const [researchPaths, evaluations, trades] = await Promise.all([
    c.env.DB.prepare(
      'SELECT * FROM research_paths WHERE market_id = ? ORDER BY created_at DESC'
    ).bind(id).all<ResearchPath>(),
    c.env.DB.prepare(
      'SELECT * FROM evaluations WHERE market_id = ? ORDER BY evaluated_at DESC'
    ).bind(id).all<Evaluation>(),
    c.env.DB.prepare(
      'SELECT * FROM trades WHERE market_id = ? ORDER BY created_at DESC'
    ).bind(id).all<Trade>()
  ]);

  const response: MarketWithDetails = {
    ...market,
    research_paths: researchPaths.results,
    evaluations: evaluations.results,
    trades: trades.results
  };

  return c.json(response);
});

app.post('/markets', async (c) => {
  const body = await c.req.json<Partial<Market>>();

  if (!body.platform || !body.question) {
    return c.json({ error: 'platform and question are required' }, 400);
  }

  const id = crypto.randomUUID();

  await c.env.DB.prepare(`
    INSERT INTO markets (id, platform, external_id, question, current_odds_yes, current_odds_no, volume, liquidity, close_date, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    id,
    body.platform,
    body.external_id || null,
    body.question,
    body.current_odds_yes || null,
    body.current_odds_no || null,
    body.volume || null,
    body.liquidity || null,
    body.close_date || null,
    body.status || 'watching'
  ).run();

  await logJournalEntry(c.env.DB, 'system', 'market_created', {
    platform: body.platform,
    question: body.question
  }, undefined, id);

  const market = await c.env.DB.prepare(
    'SELECT * FROM markets WHERE id = ?'
  ).bind(id).first<Market>();

  return c.json(market, 201);
});

app.put('/markets/:id', async (c) => {
  const id = c.req.param('id');
  const body = await c.req.json<Partial<Market>>();

  const existing = await c.env.DB.prepare(
    'SELECT * FROM markets WHERE id = ?'
  ).bind(id).first<Market>();

  if (!existing) {
    return c.json({ error: 'Market not found' }, 404);
  }

  await c.env.DB.prepare(`
    UPDATE markets SET
      platform = COALESCE(?, platform),
      external_id = COALESCE(?, external_id),
      question = COALESCE(?, question),
      current_odds_yes = COALESCE(?, current_odds_yes),
      current_odds_no = COALESCE(?, current_odds_no),
      volume = COALESCE(?, volume),
      liquidity = COALESCE(?, liquidity),
      close_date = COALESCE(?, close_date),
      status = COALESCE(?, status),
      updated_at = datetime('now')
    WHERE id = ?
  `).bind(
    body.platform || null,
    body.external_id || null,
    body.question || null,
    body.current_odds_yes || null,
    body.current_odds_no || null,
    body.volume || null,
    body.liquidity || null,
    body.close_date || null,
    body.status || null,
    id
  ).run();

  const market = await c.env.DB.prepare(
    'SELECT * FROM markets WHERE id = ?'
  ).bind(id).first<Market>();

  return c.json(market);
});

app.delete('/markets/:id', async (c) => {
  const id = c.req.param('id');

  await c.env.DB.prepare('DELETE FROM markets WHERE id = ?').bind(id).run();

  return c.json({ success: true });
});

// Accept scanned markets from Portal (Portal calls Playwriter locally)
app.post('/markets/scan', async (c) => {
  try {
    const body = await c.req.json<{
      markets?: Array<{
        platform: string;
        externalId: string;
        url: string;
        question: string;
        currentOdds: { yes: number; no: number };
        volume: number;
        liquidity: number;
        closeDate: string;
      }>;
    }>();

    const markets = body.markets || [];

    await logJournalEntry(c.env.DB, 'scout', 'scan_received', {
      marketsCount: markets.length,
      source: 'portal_playwriter'
    });

    let created = 0;
    let updated = 0;
    for (const market of markets) {
      try {
        // Check if market already exists by external_id
        const existing = await c.env.DB.prepare(
          'SELECT id FROM markets WHERE external_id = ?'
        ).bind(market.externalId).first();

        if (existing) {
          // Update existing market
          await c.env.DB.prepare(`
            UPDATE markets SET
              url = ?,
              current_odds_yes = ?,
              current_odds_no = ?,
              volume = ?,
              liquidity = ?,
              updated_at = datetime('now')
            WHERE external_id = ?
          `).bind(
            market.url || null,
            market.currentOdds?.yes ?? 0.5,
            market.currentOdds?.no ?? 0.5,
            market.volume ?? 0,
            market.liquidity ?? 0,
            market.externalId
          ).run();
          updated++;
        } else {
          // Insert new market
          const id = crypto.randomUUID();
          await c.env.DB.prepare(`
            INSERT INTO markets (id, platform, external_id, url, question, current_odds_yes, current_odds_no, volume, liquidity, close_date, status)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'watching')
          `).bind(
            id,
            market.platform || 'polymarket',
            market.externalId,
            market.url || null,
            market.question,
            market.currentOdds?.yes ?? 0.5,
            market.currentOdds?.no ?? 0.5,
            market.volume ?? 0,
            market.liquidity ?? 0,
            market.closeDate || null
          ).run();
          created++;
        }
      } catch (marketErr) {
        console.error('Error processing market:', market.externalId, marketErr);
      }
    }

    await logJournalEntry(c.env.DB, 'scout', 'scan_completed', {
      marketsCreated: created,
      marketsUpdated: updated,
      totalReceived: markets.length
    });

    return c.json({
      success: true,
      marketsFound: markets.length,
      marketsCreated: created,
      marketsUpdated: updated
    });
  } catch (err) {
    console.error('Scan error:', err);
    return c.json({ error: 'Failed to process scanned markets', details: String(err) }, 500);
  }
});

// Fetch and sync markets from Gamma API (Worker-side to avoid CORS)
app.post('/markets/sync-from-gamma', async (c) => {
  try {
    // Fetch from Gamma API (no CORS issues from Worker)
    const gammaResponse = await fetch(
      'https://gamma-api.polymarket.com/markets?active=true&closed=false&limit=100'
    );

    if (!gammaResponse.ok) {
      return c.json({ error: `Gamma API error: ${gammaResponse.status}` }, 500);
    }

    // Full Gamma API response type
    const gammaMarkets = await gammaResponse.json() as Array<{
      id?: string;
      conditionId?: string;
      slug?: string;
      question?: string;
      description?: string;
      image?: string;
      outcomes?: string;           // JSON string: "[\"Yes\", \"No\"]"
      outcomePrices?: string;      // JSON string: "[\"0.65\", \"0.35\"]"
      volume?: string;
      volume24hr?: number;
      liquidity?: string;
      oneDayPriceChange?: number;
      oneWeekPriceChange?: number;
      competitive?: number;
      endDate?: string;
      events?: Array<{
        id?: string;
        slug?: string;
        title?: string;
      }>;
    }>;

    await logJournalEntry(c.env.DB, 'scout', 'gamma_sync_started', {
      marketsCount: gammaMarkets.length,
      source: 'gamma_api'
    });

    let eventsCreated = 0;
    let marketsCreated = 0;
    let marketsUpdated = 0;

    for (const m of gammaMarkets) {
      try {
        const conditionId = m.conditionId || '';
        if (!conditionId || !m.question) continue;

        // 1. Upsert parent event first
        let eventId: string | null = null;
        if (m.events && m.events.length > 0 && m.events[0].id) {
          const event = m.events[0];
          eventId = event.id || null;

          if (eventId && event.slug && event.title) {
            const existingEvent = await c.env.DB.prepare(
              'SELECT id FROM events WHERE id = ?'
            ).bind(eventId).first();

            if (!existingEvent) {
              await c.env.DB.prepare(`
                INSERT INTO events (id, slug, title)
                VALUES (?, ?, ?)
              `).bind(eventId, event.slug, event.title).run();
              eventsCreated++;
            } else {
              await c.env.DB.prepare(`
                UPDATE events SET slug = ?, title = ?, updated_at = datetime('now')
                WHERE id = ?
              `).bind(event.slug, event.title, eventId).run();
            }
          }
        }

        // 2. Process market with full data
        // outcomes and outcomePrices come as JSON strings from API
        const outcomes = m.outcomes || '["Yes", "No"]';
        const outcomePrices = m.outcomePrices || '["0.5", "0.5"]';

        const existing = await c.env.DB.prepare(
          'SELECT id FROM markets WHERE condition_id = ?'
        ).bind(conditionId).first();

        if (existing) {
          await c.env.DB.prepare(`
            UPDATE markets SET
              gamma_id = ?,
              slug = ?,
              event_id = ?,
              question = ?,
              description = ?,
              image = ?,
              outcomes = ?,
              outcome_prices = ?,
              volume = ?,
              volume_24hr = ?,
              liquidity = ?,
              one_day_price_change = ?,
              one_week_price_change = ?,
              competitive = ?,
              end_date = ?,
              last_synced = datetime('now'),
              updated_at = datetime('now')
            WHERE condition_id = ?
          `).bind(
            m.id || null,
            m.slug || null,
            eventId,
            m.question,
            m.description || null,
            m.image || null,
            outcomes,
            outcomePrices,
            parseFloat(m.volume || '0'),
            m.volume24hr || 0,
            parseFloat(m.liquidity || '0'),
            m.oneDayPriceChange || null,
            m.oneWeekPriceChange || null,
            m.competitive || null,
            m.endDate || null,
            conditionId
          ).run();
          marketsUpdated++;
        } else {
          const id = crypto.randomUUID();
          await c.env.DB.prepare(`
            INSERT INTO markets (
              id, platform, gamma_id, condition_id, slug, event_id,
              question, description, image, outcomes, outcome_prices,
              volume, volume_24hr, liquidity,
              one_day_price_change, one_week_price_change, competitive,
              end_date, status
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'watching')
          `).bind(
            id,
            'polymarket',
            m.id || null,
            conditionId,
            m.slug || null,
            eventId,
            m.question,
            m.description || null,
            m.image || null,
            outcomes,
            outcomePrices,
            parseFloat(m.volume || '0'),
            m.volume24hr || 0,
            parseFloat(m.liquidity || '0'),
            m.oneDayPriceChange || null,
            m.oneWeekPriceChange || null,
            m.competitive || null,
            m.endDate || null
          ).run();
          marketsCreated++;
        }
      } catch (marketErr) {
        console.error('Error syncing market:', m.slug, marketErr);
      }
    }

    await logJournalEntry(c.env.DB, 'scout', 'gamma_sync_completed', {
      eventsCreated,
      marketsCreated,
      marketsUpdated,
      totalReceived: gammaMarkets.length
    });

    return c.json({
      success: true,
      events_created: eventsCreated,
      markets_created: marketsCreated,
      markets_updated: marketsUpdated,
      total: gammaMarkets.length
    });
  } catch (err) {
    console.error('Gamma sync error:', err);
    return c.json({ error: 'Failed to sync from Gamma API', details: String(err) }, 500);
  }
});

// Sync markets from Portal (legacy - Portal sends pre-fetched data)
app.post('/markets/sync', async (c) => {
  try {
    const body = await c.req.json<{
      markets: Array<{
        platform: string;
        externalId: string;
        url: string;
        question: string;
        description: string;
        currentOdds: { yes: number; no: number };
        volume: number;
        liquidity: number;
        closeDate: string | null;
      }>;
    }>();

    const markets = body.markets || [];

    await logJournalEntry(c.env.DB, 'scout', 'sync_started', {
      marketsCount: markets.length,
      source: 'gamma_api'
    });

    let created = 0;
    let updated = 0;

    for (const market of markets) {
      try {
        // Check if market exists by external_id (conditionId from Gamma API)
        const existing = await c.env.DB.prepare(
          'SELECT id FROM markets WHERE external_id = ?'
        ).bind(market.externalId).first();

        if (existing) {
          // Update existing market with fresh data
          await c.env.DB.prepare(`
            UPDATE markets SET
              url = ?,
              question = ?,
              description = ?,
              current_odds_yes = ?,
              current_odds_no = ?,
              volume = ?,
              liquidity = ?,
              close_date = ?,
              updated_at = datetime('now')
            WHERE external_id = ?
          `).bind(
            market.url,
            market.question,
            market.description,
            market.currentOdds.yes,
            market.currentOdds.no,
            market.volume,
            market.liquidity,
            market.closeDate,
            market.externalId
          ).run();
          updated++;
        } else {
          // Insert new market
          const id = crypto.randomUUID();
          await c.env.DB.prepare(`
            INSERT INTO markets (id, platform, external_id, url, question, description,
              current_odds_yes, current_odds_no, volume, liquidity, close_date, status)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'watching')
          `).bind(
            id,
            market.platform,
            market.externalId,
            market.url,
            market.question,
            market.description,
            market.currentOdds.yes,
            market.currentOdds.no,
            market.volume,
            market.liquidity,
            market.closeDate
          ).run();
          created++;
        }
      } catch (marketErr) {
        console.error('Error syncing market:', market.externalId, marketErr);
      }
    }

    await logJournalEntry(c.env.DB, 'scout', 'sync_completed', {
      marketsCreated: created,
      marketsUpdated: updated,
      totalReceived: markets.length
    });

    return c.json({
      success: true,
      created,
      updated,
      total: markets.length
    });
  } catch (err) {
    console.error('Sync error:', err);
    return c.json({ error: 'Failed to sync markets', details: String(err) }, 500);
  }
});

// Deep scan endpoint - stores rich market data (description, resolution criteria)
app.post('/markets/:id/deep-scan', async (c) => {
  try {
    const { id } = c.req.param();
    const body = await c.req.json<{
      description?: string;
      resolutionCriteria?: string;
    }>();

    // Check if market exists
    const market = await c.env.DB.prepare(
      'SELECT id, question FROM markets WHERE id = ?'
    ).bind(id).first();

    if (!market) {
      return c.json({ error: 'Market not found' }, 404);
    }

    // Update market with rich data
    await c.env.DB.prepare(`
      UPDATE markets SET
        description = ?,
        resolution_criteria = ?,
        updated_at = datetime('now')
      WHERE id = ?
    `).bind(
      body.description || null,
      body.resolutionCriteria || null,
      id
    ).run();

    await logJournalEntry(c.env.DB, 'scout', 'deep_scan_completed',
      `Extracted rich data for market: ${(market as { question: string }).question?.slice(0, 50)}...`,
      { market_id: id, hasDescription: !!body.description, hasResolution: !!body.resolutionCriteria }
    );

    return c.json({ success: true });
  } catch (err) {
    console.error('Deep scan error:', err);
    return c.json({ error: 'Failed to save deep scan data', details: String(err) }, 500);
  }
});

// =============================================================================
// Research
// =============================================================================

app.get('/research', async (c) => {
  const marketId = c.req.query('market_id');
  const status = c.req.query('status');
  const limit = parseInt(c.req.query('limit') || '50');

  let query = 'SELECT * FROM research_paths WHERE 1=1';
  const params: (string | number)[] = [];

  if (marketId) {
    query += ' AND market_id = ?';
    params.push(marketId);
  }

  if (status) {
    query += ' AND status = ?';
    params.push(status);
  }

  query += ' ORDER BY created_at DESC LIMIT ?';
  params.push(limit);

  const result = await c.env.DB.prepare(query).bind(...params).all<ResearchPath>();
  return c.json(result.results);
});

app.get('/research/:id', async (c) => {
  const id = c.req.param('id');

  const researchPath = await c.env.DB.prepare(
    'SELECT * FROM research_paths WHERE id = ?'
  ).bind(id).first<ResearchPath>();

  if (!researchPath) {
    return c.json({ error: 'Research path not found' }, 404);
  }

  const sources = await c.env.DB.prepare(
    'SELECT * FROM research_sources WHERE research_path_id = ? ORDER BY relevance_score DESC'
  ).bind(id).all<ResearchSource>();

  const response: ResearchPathWithSources = {
    ...researchPath,
    sources: sources.results
  };

  return c.json(response);
});

// Cleanup stuck research paths (mark old pending/running as failed)
app.post('/research/cleanup', async (c) => {
  const body = await c.req.json<{ force?: boolean }>().catch(() => ({}));

  // If force=true, clean ALL stuck. Otherwise, only older than 10 minutes.
  const query = body.force
    ? `UPDATE research_paths
       SET status = 'failed', error_message = 'Cleaned up: stuck in pending/running state'
       WHERE status IN ('pending', 'running')`
    : `UPDATE research_paths
       SET status = 'failed', error_message = 'Cleaned up: stuck in pending/running state'
       WHERE status IN ('pending', 'running')
       AND datetime(created_at) < datetime('now', '-10 minutes')`;

  const result = await c.env.DB.prepare(query).run();

  await logJournalEntry(c.env.DB, 'system', 'research_cleanup', {
    updatedCount: result.meta.changes,
    force: body.force || false
  });

  return c.json({
    success: true,
    cleaned: result.meta.changes
  });
});

app.post('/research/spawn', async (c) => {
  console.log('[Spawn] Research spawn called');

  const body = await c.req.json<{
    market_id: string;
    query?: string;
    auto_evaluate?: boolean;
    technique?: ResearchTechnique;
    prompt_id?: string;
  }>();

  console.log('[Spawn] Request body:', JSON.stringify(body));

  if (!body.market_id) {
    console.log('[Spawn] ERROR: market_id missing');
    return c.json({ error: 'market_id is required' }, 400);
  }

  // Get the market
  const market = await c.env.DB.prepare(
    'SELECT * FROM markets WHERE id = ?'
  ).bind(body.market_id).first<Market>();

  if (!market) {
    return c.json({ error: 'Market not found' }, 404);
  }

  // Default technique
  const technique: ResearchTechnique = body.technique || 'deep_research';

  // Get prompt - use specified, or active research prompt, or fall back to defaults
  let prompt: Prompt | null = null;
  let model: string;
  let query: string;

  if (body.prompt_id) {
    prompt = await c.env.DB.prepare('SELECT * FROM prompts WHERE id = ?')
      .bind(body.prompt_id).first<Prompt>();
  }

  if (!prompt) {
    prompt = await getActivePrompt(c.env.DB, 'research');
  }

  // Parse market prices
  let currentOdds = 50;
  try {
    const prices = JSON.parse(market.outcome_prices || '["0.5", "0.5"]');
    currentOdds = Math.round(parseFloat(prices[0]) * 100);
  } catch {}

  // Model is determined by technique, NOT by prompt
  // This ensures the right API is used for each technique
  model = technique === 'deep_research'
    ? 'deep-research-pro-preview-12-2025'
    : technique === 'quick_search'
      ? 'gemini-3-pro-preview'
      : 'claude-opus-4-5-20251101';

  if (prompt) {
    // Use prompt text but NOT prompt model (technique determines model)
    query = prompt.user_prompt
      .replace(/{market_question}/g, market.question)
      .replace(/{current_odds}/g, String(currentOdds))
      .replace(/{end_date}/g, market.end_date || 'Not specified')
      .replace(/{volume}/g, String(market.volume || 0))
      .replace(/{liquidity}/g, String(market.liquidity || 0));
  } else {
    query = body.query || `Research factors that could affect the outcome of: "${market.question}"

Focus on:
1. Recent news and developments
2. Historical precedents
3. Expert opinions and analysis
4. Key dates and deadlines
5. Potential catalysts or risks`;
  }

  // Check for required API key based on technique
  if (technique === 'deep_research' || technique === 'quick_search') {
    const geminiApiKey = await getSetting(c.env.DB, 'gemini_api_key');
    if (!geminiApiKey) {
      return c.json({ error: 'Gemini API key not configured' }, 400);
    }
  } else if (technique === 'analysis') {
    const claudeApiKey = await getSetting(c.env.DB, 'claude_api_key');
    if (!claudeApiKey) {
      return c.json({ error: 'Claude API key not configured' }, 400);
    }
  }

  const id = crypto.randomUUID();

  // Create research path with new fields
  await c.env.DB.prepare(`
    INSERT INTO research_paths (id, market_id, query, status, model, prompt_id, technique)
    VALUES (?, ?, ?, 'pending', ?, ?, ?)
  `).bind(
    id,
    body.market_id,
    query,
    model,
    prompt?.id || null,
    technique
  ).run();

  // Update market status
  await c.env.DB.prepare(`
    UPDATE markets SET status = 'researching', updated_at = datetime('now')
    WHERE id = ?
  `).bind(body.market_id).run();

  // Queue the research with technique info
  console.log('[Spawn] Sending to queue:', { researchPathId: id, technique, model });

  try {
    await c.env.RESEARCH_QUEUE.send({
      researchPathId: id,
      marketId: body.market_id,
      query,
      autoEvaluate: body.auto_evaluate || false,
      technique,
      model,
      promptId: prompt?.id || null
    });
    console.log('[Spawn] Queue send SUCCESS');
  } catch (queueError) {
    console.error('[Spawn] Queue send FAILED:', queueError);
    throw queueError;
  }

  await logJournalEntry(c.env.DB, 'researcher', 'research_queued', {
    researchPathId: id,
    technique,
    model,
    promptId: prompt?.id,
    autoEvaluate: body.auto_evaluate
  }, undefined, body.market_id);

  return c.json({
    id,
    status: 'pending',
    technique,
    model,
    message: 'Research queued'
  }, 201);
});

// =============================================================================
// Evaluations
// =============================================================================

app.get('/evaluations', async (c) => {
  const marketId = c.req.query('market_id');
  const limit = parseInt(c.req.query('limit') || '50');

  let query = 'SELECT * FROM evaluations WHERE 1=1';
  const params: (string | number)[] = [];

  if (marketId) {
    query += ' AND market_id = ?';
    params.push(marketId);
  }

  query += ' ORDER BY evaluated_at DESC LIMIT ?';
  params.push(limit);

  const result = await c.env.DB.prepare(query).bind(...params).all<Evaluation>();
  return c.json(result.results);
});

app.get('/evaluations/:id', async (c) => {
  const id = c.req.param('id');

  const evaluation = await c.env.DB.prepare(
    'SELECT * FROM evaluations WHERE id = ?'
  ).bind(id).first<Evaluation>();

  if (!evaluation) {
    return c.json({ error: 'Evaluation not found' }, 404);
  }

  // Get related market and research paths
  const market = await c.env.DB.prepare(
    'SELECT * FROM markets WHERE id = ?'
  ).bind(evaluation.market_id).first<Market>();

  let researchPaths: ResearchPath[] = [];
  if (evaluation.research_path_ids) {
    const pathIds = JSON.parse(evaluation.research_path_ids) as string[];
    if (pathIds.length > 0) {
      const placeholders = pathIds.map(() => '?').join(',');
      const result = await c.env.DB.prepare(
        `SELECT * FROM research_paths WHERE id IN (${placeholders})`
      ).bind(...pathIds).all<ResearchPath>();
      researchPaths = result.results;
    }
  }

  return c.json({
    ...evaluation,
    market,
    research_paths: researchPaths
  });
});

app.post('/evaluations/run', async (c) => {
  const body = await c.req.json<{ market_id: string; research_path_ids?: string[] }>();

  if (!body.market_id) {
    return c.json({ error: 'market_id is required' }, 400);
  }

  const claudeApiKey = await getSetting(c.env.DB, 'claude_api_key');
  if (!claudeApiKey) {
    return c.json({ error: 'Claude API key not configured' }, 400);
  }

  const market = await c.env.DB.prepare(
    'SELECT * FROM markets WHERE id = ?'
  ).bind(body.market_id).first<Market>();

  if (!market) {
    return c.json({ error: 'Market not found' }, 404);
  }

  // Get research paths
  let researchPaths: ResearchPath[] = [];
  if (body.research_path_ids && body.research_path_ids.length > 0) {
    const placeholders = body.research_path_ids.map(() => '?').join(',');
    const result = await c.env.DB.prepare(
      `SELECT * FROM research_paths WHERE id IN (${placeholders}) AND status = 'completed'`
    ).bind(...body.research_path_ids).all<ResearchPath>();
    researchPaths = result.results;
  } else {
    // Get all completed research for this market
    const result = await c.env.DB.prepare(
      `SELECT * FROM research_paths WHERE market_id = ? AND status = 'completed'`
    ).bind(body.market_id).all<ResearchPath>();
    researchPaths = result.results;
  }

  if (researchPaths.length === 0) {
    return c.json({ error: 'No completed research found for this market' }, 400);
  }

  try {
    const result = await evaluateMarket(
      c.env.DB,
      claudeApiKey,
      market,
      researchPaths
    );

    return c.json(result, 201);
  } catch (error) {
    return c.json({
      error: 'Evaluation failed',
      message: error instanceof Error ? error.message : 'Unknown error'
    }, 500);
  }
});

// =============================================================================
// Trades
// =============================================================================

app.get('/trades', async (c) => {
  const marketId = c.req.query('market_id');
  const status = c.req.query('status');
  const limit = parseInt(c.req.query('limit') || '50');

  let query = 'SELECT * FROM trades WHERE 1=1';
  const params: (string | number)[] = [];

  if (marketId) {
    query += ' AND market_id = ?';
    params.push(marketId);
  }

  if (status) {
    query += ' AND status = ?';
    params.push(status);
  }

  query += ' ORDER BY created_at DESC LIMIT ?';
  params.push(limit);

  const result = await c.env.DB.prepare(query).bind(...params).all<Trade>();
  return c.json(result.results);
});

app.get('/trades/:id', async (c) => {
  const id = c.req.param('id');

  const trade = await c.env.DB.prepare(
    'SELECT * FROM trades WHERE id = ?'
  ).bind(id).first<Trade>();

  if (!trade) {
    return c.json({ error: 'Trade not found' }, 404);
  }

  return c.json(trade);
});

app.post('/trades/execute', async (c) => {
  const body = await c.req.json<{
    market_id: string;
    evaluation_id?: string;
    direction: 'yes' | 'no';
    size: number;
    entry_odds: number;
  }>();

  if (!body.market_id || !body.direction || !body.size || !body.entry_odds) {
    return c.json({ error: 'market_id, direction, size, and entry_odds are required' }, 400);
  }

  const playwriterUrl = await getSetting(c.env.DB, 'playwriter_url');

  try {
    const result = await executeTrade(
      c.env.DB,
      playwriterUrl,
      body.market_id,
      body.evaluation_id || null,
      body.direction,
      body.size,
      body.entry_odds
    );

    return c.json(result, 201);
  } catch (error) {
    return c.json({
      error: 'Trade execution failed',
      message: error instanceof Error ? error.message : 'Unknown error'
    }, 500);
  }
});

app.put('/trades/:id/settle', async (c) => {
  const id = c.req.param('id');
  const body = await c.req.json<{ exit_odds: number; pnl: number }>();

  await c.env.DB.prepare(`
    UPDATE trades SET
      status = 'settled',
      exit_odds = ?,
      pnl = ?,
      settled_at = datetime('now')
    WHERE id = ?
  `).bind(body.exit_odds, body.pnl, id).run();

  const trade = await c.env.DB.prepare(
    'SELECT * FROM trades WHERE id = ?'
  ).bind(id).first<Trade>();

  await logJournalEntry(c.env.DB, 'trader', 'trade_settled', {
    tradeId: id,
    pnl: body.pnl
  }, undefined, trade?.market_id || undefined);

  return c.json(trade);
});

// =============================================================================
// Journal & Snapshots
// =============================================================================

app.get('/journal', async (c) => {
  const agent = c.req.query('agent');
  const marketId = c.req.query('market_id');
  const since = c.req.query('since');
  const limit = parseInt(c.req.query('limit') || '50');
  const offset = parseInt(c.req.query('offset') || '0');

  const entries = await getJournalEntries(c.env.DB, {
    limit,
    offset,
    agent: agent as any,
    marketId,
    since
  });

  return c.json(entries);
});

app.get('/snapshots', async (c) => {
  const limit = parseInt(c.req.query('limit') || '30');
  const snapshots = await listDailySnapshots(c.env.DB, limit);
  return c.json(snapshots);
});

app.get('/snapshots/:date', async (c) => {
  const date = c.req.param('date');
  const snapshot = await getDailySnapshot(c.env.DB, date);

  if (!snapshot) {
    return c.json({ error: 'Snapshot not found' }, 404);
  }

  return c.json(snapshot);
});

app.post('/snapshots/generate', async (c) => {
  const claudeApiKey = await getSetting(c.env.DB, 'claude_api_key');

  try {
    const snapshot = await generateDailySnapshot(c.env.DB, claudeApiKey || undefined);
    return c.json(snapshot, 201);
  } catch (error) {
    return c.json({
      error: 'Snapshot generation failed',
      message: error instanceof Error ? error.message : 'Unknown error'
    }, 500);
  }
});

// =============================================================================
// Playground Testing
// =============================================================================

// Test a prompt against a market (for playground experimentation)
app.post('/playground/test', async (c) => {
  const body = await c.req.json<{
    stage: PromptStage;
    prompt_id?: string;
    market_id: string;
    // For ad-hoc testing without saving prompt
    system_prompt?: string;
    user_prompt?: string;
    model?: string;
    temperature?: number;
    max_tokens?: number;
  }>();

  if (!body.stage || !body.market_id) {
    return c.json({ error: 'stage and market_id are required' }, 400);
  }

  // Get market
  const market = await c.env.DB.prepare(
    'SELECT * FROM markets WHERE id = ?'
  ).bind(body.market_id).first<Market>();

  if (!market) {
    return c.json({ error: 'Market not found' }, 404);
  }

  // Parse market prices
  let currentOdds = 50;
  try {
    const prices = JSON.parse(market.outcome_prices || '["0.5", "0.5"]');
    currentOdds = Math.round(parseFloat(prices[0]) * 100);
  } catch {}

  // Get prompt (from ID or use ad-hoc values)
  let prompt: Prompt | null = null;
  if (body.prompt_id) {
    prompt = await c.env.DB.prepare('SELECT * FROM prompts WHERE id = ?')
      .bind(body.prompt_id).first<Prompt>();
  }

  // Determine final values
  const systemPrompt = body.system_prompt ?? prompt?.system_prompt ?? null;
  const userPromptTemplate = body.user_prompt ?? prompt?.user_prompt;
  const model = body.model ?? prompt?.model;
  const temperature = body.temperature ?? prompt?.temperature ?? 0.2;
  const maxTokens = body.max_tokens ?? prompt?.max_tokens ?? 2048;

  if (!userPromptTemplate || !model) {
    return c.json({ error: 'user_prompt and model are required (provide directly or via prompt_id)' }, 400);
  }

  if (body.stage === 'research') {
    // Test research prompt
    const geminiApiKey = await getSetting(c.env.DB, 'gemini_api_key');
    if (!geminiApiKey) {
      return c.json({ error: 'Gemini API key not configured' }, 400);
    }

    // Interpolate variables
    const query = userPromptTemplate
      .replace(/{market_question}/g, market.question)
      .replace(/{current_odds}/g, String(currentOdds))
      .replace(/{end_date}/g, market.end_date || 'Not specified')
      .replace(/{volume}/g, String(market.volume || 0))
      .replace(/{liquidity}/g, String(market.liquidity || 0));

    // Determine technique based on model
    let technique: ResearchTechnique = 'deep_research';
    if (model.includes('gemini-3') || model.includes('gemini-2.0-flash')) {
      technique = 'quick_search';
    }

    try {
      const startTime = Date.now();
      const result = await executeResearch(technique, geminiApiKey, query, model);
      const durationSeconds = Math.round((Date.now() - startTime) / 1000);

      return c.json({
        success: true,
        technique,
        model,
        durationSeconds,
        output: result.summary,
        sources: result.sources,
        keyFacts: result.keyFacts
      });
    } catch (error) {
      return c.json({
        success: false,
        error: error instanceof Error ? error.message : 'Research failed'
      }, 500);
    }
  } else {
    // Test evaluation prompt
    const claudeApiKey = await getSetting(c.env.DB, 'claude_api_key');
    if (!claudeApiKey) {
      return c.json({ error: 'Claude API key not configured' }, 400);
    }

    // Get completed research for this market
    const researchPaths = await c.env.DB.prepare(
      'SELECT * FROM research_paths WHERE market_id = ? AND status = ?'
    ).bind(body.market_id, 'completed').all<ResearchPath>();

    if (researchPaths.results.length === 0) {
      return c.json({ error: 'No completed research found for this market. Run research first.' }, 400);
    }

    // Aggregate research summaries
    let researchSummary = '';
    for (const research of researchPaths.results) {
      if (research.summary) {
        researchSummary += `=== Research Report #${researchPaths.results.indexOf(research) + 1} (${research.technique || 'deep_research'}) ===\n`;
        researchSummary += research.summary;
        researchSummary += '\n\n';
      }
    }

    // Interpolate variables
    const userPrompt = userPromptTemplate
      .replace(/{market_question}/g, market.question)
      .replace(/{current_odds}/g, String(currentOdds))
      .replace(/{end_date}/g, market.end_date || 'Not specified')
      .replace(/{volume}/g, String(market.volume || 0))
      .replace(/{liquidity}/g, String(market.liquidity || 0))
      .replace(/{research_summary}/g, researchSummary);

    try {
      const startTime = Date.now();
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': claudeApiKey,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
          model,
          max_tokens: maxTokens,
          system: systemPrompt || undefined,
          messages: [{
            role: 'user',
            content: userPrompt
          }]
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Claude API error: ${response.status} - ${errorText}`);
      }

      const result = await response.json() as {
        content: Array<{ type: string; text: string }>;
      };

      const durationSeconds = Math.round((Date.now() - startTime) / 1000);
      const output = result.content[0].text;

      // Try to parse as JSON for structured output
      let parsed = null;
      try {
        const jsonMatch = output.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          parsed = JSON.parse(jsonMatch[0]);
        }
      } catch {}

      return c.json({
        success: true,
        model,
        durationSeconds,
        output,
        parsed,
        researchReportsUsed: researchPaths.results.length
      });
    } catch (error) {
      return c.json({
        success: false,
        error: error instanceof Error ? error.message : 'Evaluation failed'
      }, 500);
    }
  }
});

// =============================================================================
// Queue Consumer
// =============================================================================

async function processResearchQueue(
  batch: MessageBatch<ResearchQueueMessage>,
  env: Bindings
): Promise<void> {
  console.log(`[Queue] Processing batch of ${batch.messages.length} messages`);

  // Process all messages in parallel for better throughput
  await Promise.all(batch.messages.map(async (message) => {
    const { researchPathId, marketId, query, autoEvaluate, technique, model } = message.body;
    const researchTechnique: ResearchTechnique = technique || 'deep_research';
    const startTime = Date.now();

    console.log(`[Queue] Processing message:`, { researchPathId, technique: researchTechnique, model });

    try {
      // Load existing research_path to check for resume case
      const existingPath = await env.DB.prepare(
        'SELECT gemini_interaction_id, status FROM research_paths WHERE id = ?'
      ).bind(researchPathId).first<{ gemini_interaction_id: string | null; status: string }>();

      // Skip if already completed (idempotency)
      if (existingPath?.status === 'completed') {
        console.log(`[Queue] Research ${researchPathId} already completed, skipping`);
        message.ack();
        return;
      }

      // Update status to running with started_at timestamp
      await env.DB.prepare(`
        UPDATE research_paths SET status = 'running', started_at = datetime('now') WHERE id = ?
      `).bind(researchPathId).run();
      console.log(`[Queue] Updated status to running for ${researchPathId}`);

      await logJournalEntry(env.DB, 'researcher', 'research_started', {
        researchPathId,
        technique: researchTechnique,
        model,
        isResume: !!existingPath?.gemini_interaction_id
      }, undefined, marketId);

      // Get appropriate API key based on technique
      let apiKey: string | null = null;
      if (researchTechnique === 'analysis') {
        apiKey = await getSetting(env.DB, 'claude_api_key');
        if (!apiKey) {
          throw new Error('Claude API key not configured');
        }
      } else {
        apiKey = await getSetting(env.DB, 'gemini_api_key');
        if (!apiKey) {
          throw new Error('Gemini API key not configured');
        }
      }

      let result;

      // Special handling for deep_research to support resume
      if (researchTechnique === 'deep_research') {
        let interactionId = existingPath?.gemini_interaction_id;

        // If no existing interaction, create one and save ID immediately
        if (!interactionId) {
          console.log(`[Queue] Creating new Deep Research interaction for ${researchPathId}`);
          const interaction = await createDeepResearchInteraction(apiKey, query);
          interactionId = interaction.interactionId;

          // Save interaction ID immediately - this is the key for resumability
          await env.DB.prepare(`
            UPDATE research_paths SET gemini_interaction_id = ? WHERE id = ?
          `).bind(interactionId, researchPathId).run();
          console.log(`[Queue] Saved interaction ID ${interactionId} for ${researchPathId}`);
        } else {
          console.log(`[Queue] Resuming existing interaction ${interactionId} for ${researchPathId}`);
        }

        // Progress callback to update DB during polling
        const onProgress = async (pollCount: number) => {
          await env.DB.prepare(`
            UPDATE research_paths SET poll_count = ?, last_polled_at = datetime('now') WHERE id = ?
          `).bind(pollCount, researchPathId).run();
        };

        // Poll until complete (or resume polling if we crashed mid-poll)
        result = await pollDeepResearchUntilComplete(apiKey, interactionId, onProgress);
      } else {
        // For quick_search and analysis, use the existing executeResearch flow
        let existingResearch: ResearchPath[] = [];
        if (researchTechnique === 'analysis') {
          const existingResult = await env.DB.prepare(
            'SELECT * FROM research_paths WHERE market_id = ? AND status = ? AND id != ?'
          ).bind(marketId, 'completed', researchPathId).all<ResearchPath>();
          existingResearch = existingResult.results;
        }

        result = await executeResearch(
          researchTechnique,
          apiKey,
          query,
          model,
          existingResearch
        );
      }

      // Store sources
      for (const source of result.sources) {
        const sourceId = crypto.randomUUID();
        await env.DB.prepare(`
          INSERT INTO research_sources (id, research_path_id, url, title, domain_authority, publish_date, relevance_score)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `).bind(
          sourceId,
          researchPathId,
          source.url,
          source.title,
          source.domainAuthority,
          source.publishDate,
          source.relevanceScore
        ).run();
      }

      // Calculate duration from actual start time (handles resume case correctly)
      const researchRecord = await env.DB.prepare(
        'SELECT started_at FROM research_paths WHERE id = ?'
      ).bind(researchPathId).first<{ started_at: string | null }>();

      let durationSeconds: number;
      if (researchRecord?.started_at) {
        const startedAt = new Date(researchRecord.started_at + 'Z');
        durationSeconds = Math.round((Date.now() - startedAt.getTime()) / 1000);
      } else {
        durationSeconds = Math.round((Date.now() - startTime) / 1000);
      }

      // Update research path with results
      await env.DB.prepare(`
        UPDATE research_paths SET
          status = 'completed',
          summary = ?,
          key_facts = ?,
          contradictions = ?,
          duration_seconds = ?,
          completed_at = datetime('now')
        WHERE id = ?
      `).bind(
        result.summary,
        JSON.stringify(result.keyFacts),
        JSON.stringify(result.contradictions),
        durationSeconds,
        researchPathId
      ).run();

      await logJournalEntry(env.DB, 'researcher', 'research_completed', {
        researchPathId,
        technique: researchTechnique,
        sourceCount: result.sources.length,
        keyFactCount: result.keyFacts.length,
        durationSeconds
      }, result.summary.substring(0, 200), marketId);

      // Auto-evaluate if requested
      if (autoEvaluate) {
        await logJournalEntry(env.DB, 'analyst', 'auto_evaluation_started', {
          marketId,
          researchPathId
        }, undefined, marketId);

        try {
          // Get market and completed research paths
          const market = await env.DB.prepare(
            'SELECT * FROM markets WHERE id = ?'
          ).bind(marketId).first<Market>();

          const researchPaths = await env.DB.prepare(
            'SELECT * FROM research_paths WHERE market_id = ? AND status = ?'
          ).bind(marketId, 'completed').all<ResearchPath>();

          if (market && researchPaths.results.length > 0) {
            const claudeApiKey = await getSetting(env.DB, 'claude_api_key');
            if (claudeApiKey) {
              const evaluation = await evaluateMarket(env.DB, claudeApiKey, market, researchPaths.results);
              await logJournalEntry(env.DB, 'analyst', 'auto_evaluation_completed', {
                evaluationId: evaluation.id,
                edge: evaluation.composite_edge,
                recommendedPosition: evaluation.recommended_position
              }, `Edge: ${((evaluation.composite_edge || 0) * 100).toFixed(1)}%`, marketId);
            }
          }
        } catch (evalError) {
          await logJournalEntry(env.DB, 'analyst', 'auto_evaluation_failed', {
            error: evalError instanceof Error ? evalError.message : 'Unknown error'
          }, undefined, marketId);
        }
      }

      message.ack();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      await env.DB.prepare(`
        UPDATE research_paths SET status = 'failed', error_message = ? WHERE id = ?
      `).bind(errorMessage, researchPathId).run();

      await logJournalEntry(env.DB, 'researcher', 'research_failed', {
        researchPathId,
        error: errorMessage
      }, undefined, marketId);

      // Don't retry - ack the message
      message.ack();
    }
  }));
}

// =============================================================================
// Export
// =============================================================================

export default {
  fetch: app.fetch,
  queue: processResearchQueue
};
