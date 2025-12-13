import type { Market, ResearchPath, Evaluation, ResearchSource, RichEvaluationResult, ConfidenceLevel, Prompt } from '../types';
import {
  calculateScores,
  calculateCompositeScore,
  calculateEdge,
  calculateKellyPosition,
  generateScoringReasoning
} from '../scoring/evaluator';
import { logJournalEntry } from './chronicler';

/**
 * Analyst Agent
 * Evaluates research using rich structured prompt and 3-factor scoring system
 */

const DEFAULT_EVALUATION_MODEL = 'claude-opus-4-5-20251101';

export async function evaluateMarket(
  db: D1Database,
  claudeApiKey: string,
  market: Market,
  researchPaths: ResearchPath[]
): Promise<Evaluation> {
  const id = crypto.randomUUID();

  await logJournalEntry(db, 'analyst', 'evaluation_started', {
    marketId: market.id,
    researchPathCount: researchPaths.length
  }, undefined, market.id);

  // Get all sources for the research paths
  const pathIds = researchPaths.map(p => p.id);
  let sources: ResearchSource[] = [];

  if (pathIds.length > 0) {
    const placeholders = pathIds.map(() => '?').join(',');
    const result = await db.prepare(
      `SELECT * FROM research_sources WHERE research_path_id IN (${placeholders})`
    ).bind(...pathIds).all<ResearchSource>();
    sources = result.results;
  }

  // Get settings
  const maxPositionSetting = await db.prepare(
    'SELECT value FROM settings WHERE key = ?'
  ).bind('max_position_percent').first<{ value: string }>();
  const maxPositionPercent = maxPositionSetting ? parseFloat(maxPositionSetting.value) : 5;

  const minConfidenceSetting = await db.prepare(
    'SELECT value FROM settings WHERE key = ?'
  ).bind('min_confidence').first<{ value: string }>();
  const minConfidence = minConfidenceSetting ? parseInt(minConfidenceSetting.value) : 60;

  // Get active evaluation prompt (if any)
  const activePrompt = await db.prepare(
    `SELECT * FROM prompts WHERE stage = 'evaluation' AND is_active = TRUE LIMIT 1`
  ).first<Prompt>();

  // Get current market odds from outcome_prices
  let currentOdds = 0.5;
  try {
    const prices = JSON.parse(market.outcome_prices || '["0.5", "0.5"]');
    currentOdds = parseFloat(prices[0]) || 0.5;
  } catch {}

  // Use Claude to get rich evaluation
  const richEvaluation = await evaluateWithClaude(
    claudeApiKey,
    market,
    researchPaths,
    currentOdds,
    activePrompt
  );

  // Calculate scores (legacy system for backwards compatibility)
  const scores = calculateScores(
    researchPaths,
    sources,
    currentOdds,
    market.liquidity || 0,
    maxPositionPercent
  );

  const compositeScore = calculateCompositeScore(scores);
  const edge = calculateEdge(richEvaluation.probability, currentOdds);

  // Don't recommend trading when estimate is at calibration floor (5%) and market is below it
  // The 5% floor exists for calibration, not as a real probability estimate
  const isAtFloor = richEvaluation.probability <= 0.06; // At or near 5% floor
  const isAtCeiling = richEvaluation.probability >= 0.94; // At or near 95% ceiling
  const marketBelowFloor = currentOdds < 0.04; // Market is below ~4%
  const marketAboveCeiling = currentOdds > 0.96; // Market is above ~96%

  const isFloorCeilingCase = (isAtFloor && marketBelowFloor) || (isAtCeiling && marketAboveCeiling);

  // Primary signal: AI's recommend_trade decision based on alpha analysis
  // Secondary guards: floor/ceiling cases and Kelly criterion
  let recommendedPosition = 0;
  if (richEvaluation.recommend_trade && !isFloorCeilingCase) {
    recommendedPosition = calculateKellyPosition(
      edge,
      currentOdds,
      compositeScore,
      maxPositionPercent,
      minConfidence
    );
  }

  // Count facts and contradictions
  let factCount = 0;
  let contradictionCount = 0;
  for (const path of researchPaths) {
    if (path.key_facts) {
      try {
        factCount += JSON.parse(path.key_facts).length;
      } catch {}
    }
    if (path.contradictions) {
      try {
        contradictionCount += JSON.parse(path.contradictions).length;
      } catch {}
    }
  }

  const legacyReasoning = generateScoringReasoning(
    scores,
    compositeScore,
    edge,
    recommendedPosition,
    sources.length,
    factCount,
    contradictionCount
  );

  // Combine legacy and rich reasoning
  const fullReasoning = richEvaluation.reasoning || legacyReasoning;

  // Store evaluation with all fields
  await db.prepare(`
    INSERT INTO evaluations (
      id, market_id, source_authenticity, confidence_level, sizing_factor,
      composite_edge, estimated_probability, recommended_position, reasoning,
      research_path_ids, confidence, base_rate_estimate, base_rate_reasoning,
      key_factors_yes, key_factors_no, main_uncertainty, market_comparison,
      recommend_trade, trade_direction, information_advantage, market_inefficiency, trade_thesis,
      model, prompt_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    id,
    market.id,
    scores.sourceAuthenticity,
    scores.confidenceLevel,
    scores.sizingFactor,
    edge,
    richEvaluation.probability,
    recommendedPosition,
    fullReasoning,
    JSON.stringify(pathIds),
    richEvaluation.confidence,
    richEvaluation.base_rate?.estimate || null,
    richEvaluation.base_rate?.reasoning || null,
    JSON.stringify(richEvaluation.key_factors_yes || []),
    JSON.stringify(richEvaluation.key_factors_no || []),
    richEvaluation.main_uncertainty || null,
    richEvaluation.market_comparison || null,
    richEvaluation.recommend_trade ? 1 : 0,
    richEvaluation.trade_direction || null,
    richEvaluation.information_advantage || null,
    richEvaluation.market_inefficiency || null,
    richEvaluation.trade_thesis || null,
    activePrompt?.model || DEFAULT_EVALUATION_MODEL,
    activePrompt?.id || null
  ).run();

  await logJournalEntry(db, 'analyst', 'evaluation_completed', {
    evaluationId: id,
    sourceAuthenticity: scores.sourceAuthenticity,
    confidenceLevel: scores.confidenceLevel,
    sizingFactor: scores.sizingFactor,
    edge: edge,
    confidence: richEvaluation.confidence,
    recommendTrade: richEvaluation.recommend_trade,
    tradeDirection: richEvaluation.trade_direction,
    informationAdvantage: richEvaluation.information_advantage,
    recommendedPosition: recommendedPosition
  }, fullReasoning, market.id);

  const evaluation = await db.prepare(
    'SELECT * FROM evaluations WHERE id = ?'
  ).bind(id).first<Evaluation>();

  return evaluation!;
}

/**
 * Aggregate research reports into a formatted string
 */
function aggregateResearch(researchPaths: ResearchPath[]): string {
  if (researchPaths.length === 0) {
    return 'No research available.';
  }

  return researchPaths.map((path, idx) => {
    const techniqueLabel = path.technique || 'unknown';
    return `=== Research Report #${idx + 1} (${techniqueLabel}) ===\n${path.summary || 'No summary available.'}`;
  }).join('\n\n');
}

/**
 * Rich evaluation using Claude with structured JSON output
 */
async function evaluateWithClaude(
  apiKey: string,
  market: Market,
  researchPaths: ResearchPath[],
  currentOdds: number,
  activePrompt?: Prompt | null
): Promise<RichEvaluationResult> {
  const researchSummary = aggregateResearch(researchPaths);

  // Default prompts (can be overridden by active prompt from DB)
  const defaultSystemPrompt = `You are an expert prediction market trader looking for GENUINE ALPHA - opportunities where you have an information advantage over the market.

CORE PRINCIPLE: The market is usually right. The current price reflects the collective wisdom of thousands of participants with real money at stake. You should ONLY recommend trading when you have a SPECIFIC, ARTICULABLE reason to believe the market is wrong.

DEFAULT STANCE: NO TRADE. You must be convinced TO trade, not convinced NOT to trade.

WHAT COUNTS AS ALPHA:
- Information the market hasn't priced in yet (breaking news, obscure sources)
- Analysis that reveals a flaw in consensus thinking
- Expertise that lets you interpret information better than the crowd
- Timing advantages (you know something before it's widely known)

WHAT DOES NOT COUNT AS ALPHA:
- Your probability estimate being slightly different from the market
- "I think X is more/less likely" without specific evidence
- Disagreeing with the market just because your model outputs a different number
- Gut feelings or vague intuitions

RISK AWARENESS:
- Buying YES at 3% means losing 100% of stake if wrong
- Small-probability events are hardest to predict accurately
- Markets near extremes (0-10% or 90-100%) require EXTRAORDINARY evidence to bet against

OUTPUT: Respond with a JSON object. Default recommend_trade to false unless you have genuine alpha.`;

  const defaultUserPrompt = `MARKET: {market_question}
RESOLUTION DATE: {end_date}
CURRENT MARKET ODDS: {current_odds}% YES / {inverse_odds}% NO
VOLUME: ${'{volume}'} (higher = more efficient market)

=== RESEARCH FINDINGS ===
{research_summary}

ANALYSIS TASK:
1. First, ASSUME THE MARKET IS CORRECT at {current_odds}% YES
2. Ask yourself: "What would I need to believe to disagree with this?"
3. Does the research provide that evidence? Be honest and specific.
4. Only recommend a trade if you can articulate a SPECIFIC market inefficiency

Your response MUST be valid JSON:
{
  "probability": 0.XX,
  "confidence": "high" | "medium" | "low",
  "recommend_trade": true | false,
  "trade_direction": "yes" | "no" | null,
  "information_advantage": "none" | "weak" | "moderate" | "strong",
  "market_inefficiency": "Specific reason the market is wrong, or null if agreeing with market",
  "trade_thesis": "If recommending trade: clear 1-sentence thesis. If not: null",
  "base_rate": {
    "estimate": "XX%",
    "reasoning": "Brief explanation of historical precedent"
  },
  "key_factors_yes": ["Factor 1", "Factor 2", "Factor 3"],
  "key_factors_no": ["Factor 1", "Factor 2", "Factor 3"],
  "main_uncertainty": "The biggest unknown",
  "market_comparison": "Why the market is [correct/incorrect] at {current_odds}%",
  "reasoning": "Full reasoning paragraph"
}

IMPORTANT:
- recommend_trade should be FALSE unless you have genuine alpha
- information_advantage of "none" or "weak" should mean recommend_trade is false
- For markets <10% or >90%, require information_advantage of "strong" to recommend trading against the consensus`;

  // Use active prompt if available, otherwise defaults
  const systemPrompt = activePrompt?.system_prompt || defaultSystemPrompt;
  let userPrompt = activePrompt?.user_prompt || defaultUserPrompt;

  // Interpolate variables
  const oddsPercent = Math.round(currentOdds * 100);
  userPrompt = userPrompt
    .replace(/{market_question}/g, market.question)
    .replace(/{current_odds}/g, oddsPercent.toString())
    .replace(/{inverse_odds}/g, (100 - oddsPercent).toString())
    .replace(/{end_date}/g, market.end_date || 'Unknown')
    .replace(/{research_summary}/g, researchSummary)
    .replace(/{volume}/g, market.volume?.toString() || '0')
    .replace(/{liquidity}/g, market.liquidity?.toString() || '0');

  const model = activePrompt?.model || DEFAULT_EVALUATION_MODEL;
  const temperature = activePrompt?.temperature ?? 0.2;
  const maxTokens = activePrompt?.max_tokens ?? 2048;

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      temperature,
      system: systemPrompt,
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

  const textContent = result.content[0].text;

  // Parse the structured JSON response
  try {
    const jsonMatch = textContent.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]) as RichEvaluationResult;

      // Validate and clamp probability
      const probability = Math.max(0.05, Math.min(0.95, parsed.probability || 0.5));

      // Validate confidence level
      const validConfidence: ConfidenceLevel[] = ['high', 'medium', 'low'];
      const confidence: ConfidenceLevel = validConfidence.includes(parsed.confidence)
        ? parsed.confidence
        : 'medium';

      // Validate information advantage
      const validAdvantage = ['none', 'weak', 'moderate', 'strong'] as const;
      type InfoAdvantage = typeof validAdvantage[number];
      const information_advantage: InfoAdvantage = validAdvantage.includes(parsed.information_advantage as InfoAdvantage)
        ? parsed.information_advantage as InfoAdvantage
        : 'none';

      // Validate trade direction
      const trade_direction = parsed.trade_direction === 'yes' || parsed.trade_direction === 'no'
        ? parsed.trade_direction
        : null;

      return {
        probability,
        confidence,
        // Alpha-seeking fields
        recommend_trade: parsed.recommend_trade === true,
        trade_direction,
        information_advantage,
        market_inefficiency: parsed.market_inefficiency || null,
        trade_thesis: parsed.trade_thesis || null,
        // Analysis fields
        base_rate: parsed.base_rate || { estimate: 'Unknown', reasoning: '' },
        key_factors_yes: Array.isArray(parsed.key_factors_yes) ? parsed.key_factors_yes : [],
        key_factors_no: Array.isArray(parsed.key_factors_no) ? parsed.key_factors_no : [],
        main_uncertainty: parsed.main_uncertainty || '',
        market_comparison: parsed.market_comparison || '',
        reasoning: parsed.reasoning || textContent
      };
    }
  } catch (e) {
    console.error('Failed to parse rich evaluation JSON:', e);
  }

  // Fallback: try to extract just a probability
  const numMatch = textContent.match(/0\.\d+/);
  const fallbackProbability = numMatch ? parseFloat(numMatch[0]) : currentOdds;

  return {
    probability: Math.max(0.05, Math.min(0.95, fallbackProbability)),
    confidence: 'medium',
    recommend_trade: false,
    trade_direction: null,
    information_advantage: 'none',
    market_inefficiency: null,
    trade_thesis: null,
    base_rate: { estimate: 'Unknown', reasoning: '' },
    key_factors_yes: [],
    key_factors_no: [],
    main_uncertainty: '',
    market_comparison: '',
    reasoning: textContent
  };
}
