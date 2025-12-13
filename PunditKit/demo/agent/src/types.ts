// Cloudflare bindings
export type Bindings = {
  DB: D1Database;
  ARTIFACTS: R2Bucket;
  RESEARCH_QUEUE: Queue<ResearchQueueMessage>;
};

// Queue message types
export interface ResearchQueueMessage {
  researchPathId: string;
  marketId: string;
  query: string;
  autoEvaluate?: boolean;
  technique?: ResearchTechnique;
  model?: string;
  promptId?: string | null;
}

// Database model types
export type MarketStatus = 'watching' | 'researching' | 'traded' | 'closed';
export type ResearchStatus = 'pending' | 'running' | 'completed' | 'failed';
export type TradeStatus = 'pending' | 'executed' | 'settled' | 'cancelled';
export type TradeDirection = 'yes' | 'no';
export type AgentType = 'scout' | 'researcher' | 'analyst' | 'trader' | 'chronicler' | 'system';
export type ArtifactType = 'screenshot' | 'research_report' | 'trade_receipt' | 'sdk';

// Event - Groups related markets under a parent event
export interface Event {
  id: string;
  slug: string;
  title: string;
  image: string | null;
  created_at: string;
  updated_at: string;
}

export interface Market {
  id: string;
  platform: string;

  // Gamma API identifiers
  gamma_id: string | null;
  condition_id: string | null;
  slug: string | null;
  event_id: string | null;

  // Core market data
  question: string;
  description: string | null;
  image: string | null;

  // Multi-outcome support (JSON arrays)
  outcomes: string;           // JSON array: '["Yes", "No"]'
  outcome_prices: string;     // JSON array: '["0.65", "0.35"]'

  // Volume and liquidity
  volume: number | null;
  volume_24hr: number | null;
  liquidity: number | null;

  // Price trends
  one_day_price_change: number | null;
  one_week_price_change: number | null;
  competitive: number | null;

  // Dates
  end_date: string | null;

  // Status and timestamps
  status: MarketStatus;
  last_synced: string;
  created_at: string;
  updated_at: string;
}

// Gamma API response type
export interface GammaMarket {
  id: string;
  question: string;
  conditionId: string;
  slug: string;
  description: string;
  outcomes: string;              // JSON string array: "[\"Yes\", \"No\"]"
  outcomePrices: string;         // JSON string array: "[\"0.65\", \"0.35\"]"
  image: string;
  endDate: string;
  volume: string;
  liquidity: string;
  volume24hr: number;
  oneDayPriceChange: number;
  oneWeekPriceChange: number;
  competitive: number;
  events: Array<{
    id: string;
    slug: string;
    title: string;
  }>;
}

// Research technique types
export type ResearchTechnique = 'deep_research' | 'quick_search' | 'analysis';

// Prompt stage types
export type PromptStage = 'research' | 'evaluation';

// Confidence level for evaluations (moved here for forward reference)
export type ConfidenceLevel = 'high' | 'medium' | 'low';

// Information advantage level for alpha-seeking evaluations
export type InformationAdvantage = 'none' | 'weak' | 'moderate' | 'strong';

// Prompt configuration for research and evaluation
export interface Prompt {
  id: string;
  stage: PromptStage;
  name: string;
  system_prompt: string | null;  // Only used for evaluation stage
  user_prompt: string;
  model: string;
  temperature: number;
  max_tokens: number;
  is_active: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

// Rich evaluation result from upgraded Claude prompt (alpha-seeking)
export interface RichEvaluationResult {
  probability: number;
  confidence: ConfidenceLevel;
  // Alpha-seeking fields
  recommend_trade: boolean;
  trade_direction: 'yes' | 'no' | null;
  information_advantage: InformationAdvantage;
  market_inefficiency: string | null;
  trade_thesis: string | null;
  // Analysis fields
  base_rate: {
    estimate: string;
    reasoning: string;
  };
  key_factors_yes: string[];
  key_factors_no: string[];
  main_uncertainty: string;
  market_comparison: string;
  reasoning: string;
}

export interface ResearchPath {
  id: string;
  market_id: string;
  gemini_interaction_id: string | null;
  query: string;
  status: ResearchStatus;
  summary: string | null;
  key_facts: string | null; // JSON array
  contradictions: string | null; // JSON array
  error_message: string | null;
  // Multi-model support
  model: string | null;
  prompt_id: string | null;
  technique: ResearchTechnique | null;
  duration_seconds: number | null;
  // Progress tracking for long-running research
  poll_count: number | null;
  last_polled_at: string | null;
  started_at: string | null;
  created_at: string;
  completed_at: string | null;
}

export interface ResearchSource {
  id: string;
  research_path_id: string;
  url: string;
  title: string | null;
  domain_authority: number | null;
  publish_date: string | null;
  relevance_score: number | null;
  created_at: string;
}

export interface Evaluation {
  id: string;
  market_id: string;
  source_authenticity: number | null;
  confidence_level: number | null;
  sizing_factor: number | null;
  composite_edge: number | null;

  // Multi-outcome support
  estimated_probabilities: string | null;  // JSON: {"Yes": 0.65, "No": 0.35}
  recommended_outcomes: string | null;     // JSON: [{"outcome": "Yes", "position": 0.1}]

  // Legacy binary fields
  estimated_probability: number | null;
  recommended_position: number | null;

  reasoning: string | null;
  research_path_ids: string | null; // JSON array

  // Rich evaluation fields (from upgraded prompt)
  confidence: ConfidenceLevel | null;       // Analyst confidence level
  base_rate_estimate: string | null;        // e.g., "15%"
  base_rate_reasoning: string | null;       // Explanation of historical precedent
  key_factors_yes: string | null;           // JSON array of factors supporting YES
  key_factors_no: string | null;            // JSON array of factors supporting NO
  main_uncertainty: string | null;          // Biggest unknown
  market_comparison: string | null;         // Why agree/disagree with market odds

  // Alpha-seeking fields
  recommend_trade: boolean | null;          // Should we trade this market?
  trade_direction: 'yes' | 'no' | null;     // Which direction if trading
  information_advantage: InformationAdvantage | null;  // How much edge over the crowd
  market_inefficiency: string | null;       // Why the market is wrong (if it is)
  trade_thesis: string | null;              // Clear 1-sentence thesis if recommending trade

  // Model tracking
  model: string | null;
  prompt_id: string | null;

  evaluated_at: string;
}

export interface Trade {
  id: string;
  market_id: string;
  evaluation_id: string | null;

  // Multi-outcome support
  outcome: string;              // Outcome name (e.g., "Yes", "7-9")
  outcome_index: number | null; // Index in outcomes array
  size: number;
  entry_price: number;
  exit_price: number | null;

  // Legacy fields
  direction: TradeDirection | null;
  entry_odds: number | null;
  exit_odds: number | null;

  status: TradeStatus;
  pnl: number | null;
  tx_hash: string | null;
  executed_at: string | null;
  settled_at: string | null;
  created_at: string;
}

export interface JournalEntry {
  id: string;
  agent: AgentType;
  action: string;
  reasoning: string | null;
  context: string | null; // JSON object
  market_id: string | null;
  timestamp: string;
}

export interface DailySnapshot {
  id: string;
  date: string;
  summary: string | null;
  full_journal: string | null; // JSON array
  markets_scanned: number;
  research_completed: number;
  trades_executed: number;
  total_pnl: number;
  created_at: string;
}

export interface Artifact {
  id: string;
  type: ArtifactType;
  r2_key: string;
  related_id: string | null;
  related_type: string | null;
  metadata: string | null; // JSON object
  created_at: string;
}

// API response types
export interface MarketWithDetails extends Market {
  research_paths?: ResearchPath[];
  evaluations?: Evaluation[];
  trades?: Trade[];
}

export interface ResearchPathWithSources extends ResearchPath {
  sources?: ResearchSource[];
}

export interface EvaluationWithContext extends Evaluation {
  market?: Market;
  research_paths?: ResearchPath[];
}

// Settings types
export interface Settings {
  claude_api_key?: string;
  gemini_api_key?: string;
  playwriter_url?: string;
  max_position_percent?: string;
  max_daily_trades?: string;
  min_edge_threshold?: string;
  min_confidence?: string;
  platforms?: string; // JSON array
  bankroll?: string;
}

// Scoring types
export interface ScoreComponents {
  sourceAuthenticity: number; // 0-100, weight 40%
  confidenceLevel: number;    // 0-100, weight 35%
  sizingFactor: number;       // 0-100, weight 25%
}

export interface ScoringResult {
  scores: ScoreComponents;
  compositeScore: number;
  estimatedProbability: number;
  edge: number;
  recommendedPosition: number;
  reasoning: string;
}

// Gemini Deep Research types
export interface GeminiResearchResult {
  summary: string;
  keyFacts: string[];
  contradictions: string[];
  sources: Array<{
    url: string;
    title: string;
    domainAuthority: number;
    publishDate: string | null;
    relevanceScore: number;
  }>;
}

// Claude API types
export interface ClaudeMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface ClaudeResponse {
  content: Array<{
    type: 'text';
    text: string;
  }>;
}

// Playwriter MCP types
export interface PlaywriterExecuteRequest {
  code: string;
  tabId?: number;
}

export interface PlaywriterExecuteResponse {
  success: boolean;
  result?: unknown;
  error?: string;
  networkTraces?: Array<{
    url: string;
    method: string;
    requestHeaders: Record<string, string>;
    requestBody?: string;
    responseStatus: number;
    responseHeaders: Record<string, string>;
    responseBody?: string;
  }>;
}
