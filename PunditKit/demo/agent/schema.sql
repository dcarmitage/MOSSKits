-- PunditKit D1 Schema - Phoenix Rebuild
-- Enhanced for full Polymarket data with multi-outcome support

-- Settings table for API keys and configuration (preserved)
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT DEFAULT (datetime('now'))
);

-- Events table - Groups related markets under a parent event
CREATE TABLE IF NOT EXISTS events (
  id TEXT PRIMARY KEY,                    -- Gamma event ID
  slug TEXT NOT NULL UNIQUE,              -- URL slug for linking
  title TEXT NOT NULL,                    -- Parent event title
  image TEXT,                             -- Event image URL
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- Markets table - Enhanced with full Gamma API data
CREATE TABLE IF NOT EXISTS markets (
  id TEXT PRIMARY KEY,
  platform TEXT NOT NULL DEFAULT 'polymarket',

  -- Gamma API identifiers
  gamma_id TEXT,                          -- Gamma market ID (e.g., "516710")
  condition_id TEXT UNIQUE,               -- Blockchain condition ID (primary external key)
  slug TEXT,                              -- Market slug for URLs

  -- Event relationship
  event_id TEXT REFERENCES events(id),    -- Parent event grouping

  -- Core market data
  question TEXT NOT NULL,
  description TEXT,                       -- Full market description / resolution criteria
  image TEXT,                             -- Market-specific image URL

  -- Multi-outcome support (JSON arrays)
  outcomes TEXT NOT NULL DEFAULT '["Yes", "No"]',      -- JSON array of outcome names
  outcome_prices TEXT NOT NULL DEFAULT '["0.5", "0.5"]', -- JSON array of prices (strings)

  -- Volume and liquidity
  volume REAL DEFAULT 0,                  -- Total volume in USD
  volume_24hr REAL DEFAULT 0,             -- 24-hour volume
  liquidity REAL DEFAULT 0,               -- Current liquidity

  -- Price trends
  one_day_price_change REAL,              -- 24hr price change (-1 to 1)
  one_week_price_change REAL,             -- 7d price change (-1 to 1)

  -- Competitiveness score (how contested the market is)
  competitive REAL,                       -- 0-1 score from Gamma

  -- Dates
  end_date TEXT,                          -- Market end/resolution date

  -- PunditKit workflow status
  status TEXT DEFAULT 'watching' CHECK (status IN ('watching', 'researching', 'traded', 'closed')),

  -- Timestamps
  last_synced TEXT DEFAULT (datetime('now')),
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- Prompts table - Stores versioned prompts with model selection and production control
CREATE TABLE IF NOT EXISTS prompts (
  id TEXT PRIMARY KEY,
  stage TEXT NOT NULL CHECK (stage IN ('research', 'evaluation')),  -- Which pipeline stage
  name TEXT NOT NULL,                     -- Human readable name, e.g. "Balanced Research v2"
  system_prompt TEXT,                     -- System message (evaluation only, NULL for research)
  user_prompt TEXT NOT NULL,              -- User message template (or full prompt for research)
  model TEXT NOT NULL,                    -- Model identifier
  temperature REAL DEFAULT 0.2,           -- Model temperature (evaluation only)
  max_tokens INTEGER DEFAULT 2048,        -- Max output tokens (evaluation only)
  is_active BOOLEAN DEFAULT FALSE,        -- Is this the production prompt for this stage?
  notes TEXT,                             -- Performance observations, what changed
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- Ensure only one active prompt per stage
CREATE UNIQUE INDEX IF NOT EXISTS idx_prompts_active_stage
ON prompts(stage) WHERE is_active = TRUE;

-- Index for quick lookup by stage
CREATE INDEX IF NOT EXISTS idx_prompts_stage ON prompts(stage);

-- Research paths table (supports multiple research reports per market)
CREATE TABLE IF NOT EXISTS research_paths (
  id TEXT PRIMARY KEY,
  market_id TEXT NOT NULL REFERENCES markets(id) ON DELETE CASCADE,
  gemini_interaction_id TEXT,              -- Stored immediately after creation for resumability
  query TEXT NOT NULL,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'completed', 'failed')),
  summary TEXT,
  key_facts TEXT,
  contradictions TEXT,
  error_message TEXT,
  -- Multi-model support
  model TEXT,                              -- Model ID used (e.g., 'deep-research-pro-preview-12-2025')
  prompt_id TEXT REFERENCES prompts(id),   -- Which prompt configuration was used
  technique TEXT CHECK (technique IN ('deep_research', 'quick_search', 'analysis')),  -- Research technique type
  duration_seconds INTEGER,                -- How long the research took
  -- Progress tracking for long-running research
  poll_count INTEGER DEFAULT 0,            -- Number of times we've polled for results
  last_polled_at TEXT,                     -- When we last checked status
  started_at TEXT,                         -- When research actually started running
  created_at TEXT DEFAULT (datetime('now')),
  completed_at TEXT
);

-- Research sources table
CREATE TABLE IF NOT EXISTS research_sources (
  id TEXT PRIMARY KEY,
  research_path_id TEXT NOT NULL REFERENCES research_paths(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  title TEXT,
  domain_authority INTEGER,
  publish_date TEXT,
  relevance_score REAL,
  created_at TEXT DEFAULT (datetime('now'))
);

-- Evaluations table - Updated for multi-outcome support and rich analysis
CREATE TABLE IF NOT EXISTS evaluations (
  id TEXT PRIMARY KEY,
  market_id TEXT NOT NULL REFERENCES markets(id) ON DELETE CASCADE,

  -- Scoring components (legacy, kept for backwards compatibility)
  source_authenticity INTEGER CHECK (source_authenticity >= 0 AND source_authenticity <= 100),
  confidence_level INTEGER CHECK (confidence_level >= 0 AND confidence_level <= 100),
  sizing_factor INTEGER CHECK (sizing_factor >= 0 AND sizing_factor <= 100),
  composite_edge REAL,

  -- Multi-outcome support
  estimated_probabilities TEXT,           -- JSON: {"Yes": 0.65, "No": 0.35} or {"4-6": 0.15, ...}
  recommended_outcomes TEXT,              -- JSON: [{"outcome": "Yes", "position": 0.1}]

  -- Legacy binary fields (for backward compatibility)
  estimated_probability REAL,
  recommended_position REAL,

  reasoning TEXT,
  research_path_ids TEXT,

  -- New rich evaluation fields (from upgraded prompt)
  confidence TEXT CHECK (confidence IN ('high', 'medium', 'low')),  -- Analyst confidence level
  base_rate_estimate TEXT,                -- e.g., "15%"
  base_rate_reasoning TEXT,               -- Explanation of historical precedent
  key_factors_yes TEXT,                   -- JSON array of factors supporting YES
  key_factors_no TEXT,                    -- JSON array of factors supporting NO
  main_uncertainty TEXT,                  -- Biggest unknown that could change everything
  market_comparison TEXT,                 -- Why agree/disagree with market odds

  -- Alpha-seeking fields (from upgraded prompt)
  recommend_trade BOOLEAN DEFAULT FALSE,  -- Should we trade this market?
  trade_direction TEXT,                   -- 'yes' or 'no' or null
  information_advantage TEXT CHECK (information_advantage IN ('none', 'weak', 'moderate', 'strong')),
  market_inefficiency TEXT,               -- Why the market is wrong (if it is)
  trade_thesis TEXT,                      -- Clear 1-sentence thesis if recommending trade

  -- Model tracking
  model TEXT,                             -- Model ID used for evaluation
  prompt_id TEXT REFERENCES prompts(id),  -- Which prompt was used

  evaluated_at TEXT DEFAULT (datetime('now'))
);

-- Trades table - Updated for multi-outcome support
CREATE TABLE IF NOT EXISTS trades (
  id TEXT PRIMARY KEY,
  market_id TEXT NOT NULL REFERENCES markets(id) ON DELETE CASCADE,
  evaluation_id TEXT REFERENCES evaluations(id),

  -- Trade details (outcome-based)
  outcome TEXT NOT NULL,                  -- Outcome name (e.g., "Yes", "7-9")
  outcome_index INTEGER,                  -- Index in outcomes array
  size REAL NOT NULL,
  entry_price REAL NOT NULL,
  exit_price REAL,

  -- Legacy fields
  direction TEXT,                         -- 'yes' or 'no' for binary markets
  entry_odds REAL,                        -- Alias for entry_price
  exit_odds REAL,                         -- Alias for exit_price

  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'executed', 'settled', 'cancelled')),
  pnl REAL,
  tx_hash TEXT,
  executed_at TEXT,
  settled_at TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

-- Journal entries table
CREATE TABLE IF NOT EXISTS journal_entries (
  id TEXT PRIMARY KEY,
  agent TEXT NOT NULL CHECK (agent IN ('scout', 'researcher', 'analyst', 'trader', 'chronicler', 'system')),
  action TEXT NOT NULL,
  reasoning TEXT,
  context TEXT,
  market_id TEXT REFERENCES markets(id),
  timestamp TEXT DEFAULT (datetime('now'))
);

-- Daily snapshots table
CREATE TABLE IF NOT EXISTS daily_snapshots (
  id TEXT PRIMARY KEY,
  date TEXT NOT NULL UNIQUE,
  summary TEXT,
  full_journal TEXT,
  markets_scanned INTEGER DEFAULT 0,
  research_completed INTEGER DEFAULT 0,
  trades_executed INTEGER DEFAULT 0,
  total_pnl REAL DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);

-- Artifacts table (for R2 references)
CREATE TABLE IF NOT EXISTS artifacts (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL CHECK (type IN ('screenshot', 'research_report', 'trade_receipt', 'sdk')),
  r2_key TEXT NOT NULL,
  related_id TEXT,
  related_type TEXT,
  metadata TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_events_slug ON events(slug);
CREATE INDEX IF NOT EXISTS idx_markets_status ON markets(status);
CREATE INDEX IF NOT EXISTS idx_markets_platform ON markets(platform);
CREATE INDEX IF NOT EXISTS idx_markets_end_date ON markets(end_date);
CREATE INDEX IF NOT EXISTS idx_markets_event_id ON markets(event_id);
CREATE INDEX IF NOT EXISTS idx_markets_condition_id ON markets(condition_id);
CREATE INDEX IF NOT EXISTS idx_markets_volume ON markets(volume);
CREATE INDEX IF NOT EXISTS idx_markets_competitive ON markets(competitive);
CREATE INDEX IF NOT EXISTS idx_research_paths_market_id ON research_paths(market_id);
CREATE INDEX IF NOT EXISTS idx_research_paths_status ON research_paths(status);
CREATE INDEX IF NOT EXISTS idx_research_sources_path_id ON research_sources(research_path_id);
CREATE INDEX IF NOT EXISTS idx_evaluations_market_id ON evaluations(market_id);
CREATE INDEX IF NOT EXISTS idx_trades_market_id ON trades(market_id);
CREATE INDEX IF NOT EXISTS idx_trades_status ON trades(status);
CREATE INDEX IF NOT EXISTS idx_journal_entries_agent ON journal_entries(agent);
CREATE INDEX IF NOT EXISTS idx_journal_entries_timestamp ON journal_entries(timestamp);
CREATE INDEX IF NOT EXISTS idx_journal_entries_market_id ON journal_entries(market_id);
CREATE INDEX IF NOT EXISTS idx_daily_snapshots_date ON daily_snapshots(date);
CREATE INDEX IF NOT EXISTS idx_artifacts_related ON artifacts(related_id, related_type);
