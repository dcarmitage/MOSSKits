import type { Bindings, AgentType, JournalEntry, DailySnapshot } from '../types';

/**
 * Chronicler Agent
 * Responsible for logging all agent activity and generating daily snapshots
 */

export async function logJournalEntry(
  db: D1Database,
  agent: AgentType,
  action: string,
  context?: Record<string, unknown>,
  reasoning?: string,
  marketId?: string
): Promise<string> {
  const id = crypto.randomUUID();

  await db.prepare(`
    INSERT INTO journal_entries (id, agent, action, reasoning, context, market_id)
    VALUES (?, ?, ?, ?, ?, ?)
  `).bind(
    id,
    agent,
    action,
    reasoning || null,
    context ? JSON.stringify(context) : null,
    marketId || null
  ).run();

  return id;
}

export async function getJournalEntries(
  db: D1Database,
  options: {
    limit?: number;
    offset?: number;
    agent?: AgentType;
    marketId?: string;
    since?: string;
  } = {}
): Promise<JournalEntry[]> {
  const { limit = 50, offset = 0, agent, marketId, since } = options;

  let query = 'SELECT * FROM journal_entries WHERE 1=1';
  const params: (string | number)[] = [];

  if (agent) {
    query += ' AND agent = ?';
    params.push(agent);
  }

  if (marketId) {
    query += ' AND market_id = ?';
    params.push(marketId);
  }

  if (since) {
    query += ' AND timestamp >= ?';
    params.push(since);
  }

  query += ' ORDER BY timestamp DESC LIMIT ? OFFSET ?';
  params.push(limit, offset);

  const result = await db.prepare(query).bind(...params).all<JournalEntry>();
  return result.results;
}

export async function generateDailySnapshot(
  db: D1Database,
  claudeApiKey?: string
): Promise<DailySnapshot> {
  const today = new Date().toISOString().split('T')[0];
  const id = crypto.randomUUID();

  // Get today's journal entries
  const journalResult = await db.prepare(`
    SELECT * FROM journal_entries
    WHERE date(timestamp) = ?
    ORDER BY timestamp
  `).bind(today).all<JournalEntry>();

  // Calculate metrics
  const marketsScanned = await db.prepare(`
    SELECT COUNT(DISTINCT market_id) as count FROM journal_entries
    WHERE agent = 'scout' AND date(timestamp) = ?
  `).bind(today).first<{ count: number }>();

  const researchCompleted = await db.prepare(`
    SELECT COUNT(*) as count FROM research_paths
    WHERE status = 'completed' AND date(completed_at) = ?
  `).bind(today).first<{ count: number }>();

  const tradesResult = await db.prepare(`
    SELECT COUNT(*) as count, COALESCE(SUM(pnl), 0) as total_pnl FROM trades
    WHERE status IN ('executed', 'settled') AND date(executed_at) = ?
  `).bind(today).first<{ count: number; total_pnl: number }>();

  // Generate summary
  let summary = `Daily snapshot for ${today}: `;
  summary += `${marketsScanned?.count || 0} markets scanned, `;
  summary += `${researchCompleted?.count || 0} research paths completed, `;
  summary += `${tradesResult?.count || 0} trades executed`;

  if (tradesResult?.total_pnl) {
    const pnlSign = tradesResult.total_pnl >= 0 ? '+' : '';
    summary += `, P&L: ${pnlSign}$${tradesResult.total_pnl.toFixed(2)}`;
  }

  // If Claude API key is available, generate AI summary
  if (claudeApiKey && journalResult.results.length > 0) {
    try {
      const aiSummary = await generateAISummary(claudeApiKey, journalResult.results);
      summary = aiSummary;
    } catch (error) {
      console.error('Failed to generate AI summary:', error);
    }
  }

  // Upsert snapshot
  await db.prepare(`
    INSERT INTO daily_snapshots (id, date, summary, full_journal, markets_scanned, research_completed, trades_executed, total_pnl)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(date) DO UPDATE SET
      summary = excluded.summary,
      full_journal = excluded.full_journal,
      markets_scanned = excluded.markets_scanned,
      research_completed = excluded.research_completed,
      trades_executed = excluded.trades_executed,
      total_pnl = excluded.total_pnl
  `).bind(
    id,
    today,
    summary,
    JSON.stringify(journalResult.results),
    marketsScanned?.count || 0,
    researchCompleted?.count || 0,
    tradesResult?.count || 0,
    tradesResult?.total_pnl || 0
  ).run();

  // Log the snapshot generation
  await logJournalEntry(db, 'chronicler', 'snapshot_generated', {
    date: today,
    marketsScanned: marketsScanned?.count || 0,
    researchCompleted: researchCompleted?.count || 0,
    tradesExecuted: tradesResult?.count || 0,
    totalPnl: tradesResult?.total_pnl || 0
  });

  // Fetch and return the snapshot
  const snapshot = await db.prepare(`
    SELECT * FROM daily_snapshots WHERE date = ?
  `).bind(today).first<DailySnapshot>();

  return snapshot!;
}

export async function getDailySnapshot(
  db: D1Database,
  date: string
): Promise<DailySnapshot | null> {
  const snapshot = await db.prepare(`
    SELECT * FROM daily_snapshots WHERE date = ?
  `).bind(date).first<DailySnapshot>();

  return snapshot || null;
}

export async function listDailySnapshots(
  db: D1Database,
  limit: number = 30
): Promise<DailySnapshot[]> {
  const result = await db.prepare(`
    SELECT * FROM daily_snapshots
    ORDER BY date DESC
    LIMIT ?
  `).bind(limit).all<DailySnapshot>();

  return result.results;
}

async function generateAISummary(
  apiKey: string,
  entries: JournalEntry[]
): Promise<string> {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 500,
      system: `You are a trading journal summarizer. Generate a concise daily summary of prediction market trading activity.
Focus on: key decisions, research findings, trade outcomes, and notable patterns.
Be specific with numbers and outcomes. Keep it under 3 sentences.`,
      messages: [{
        role: 'user',
        content: `Summarize today's activity:\n${JSON.stringify(entries, null, 2)}`
      }]
    })
  });

  if (!response.ok) {
    throw new Error(`Claude API error: ${response.status}`);
  }

  const result = await response.json() as { content: Array<{ text: string }> };
  return result.content[0].text;
}
