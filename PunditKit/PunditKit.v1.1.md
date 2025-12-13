# PunditKit v1.1

*Alpha-seeking prediction market agent on Cloudflare. Research deeply. Trade only with genuine edge.*

---

## Philosophy

**The market is usually right.**

The price on a prediction market reflects the collective wisdom of thousands of participants with real money at stake. PunditKit's job is NOT to mechanically compare probability estimates—that's just gambling with extra steps.

**PunditKit seeks genuine alpha.** It only recommends trades when it can articulate a *specific information advantage* over the crowd:

- Breaking news the market hasn't priced in yet
- Analysis that reveals a flaw in consensus thinking
- Expertise that interprets information better than the crowd
- Timing advantages from faster research

**Default stance: NO TRADE.** The system must be convinced TO trade, not convinced NOT to trade.

---

## Quick Start

```bash
# 1. Clone and navigate
git clone https://github.com/dcarmitage/MOSSKits.git
cd MOSSKits/PunditKit/demo

# 2. Login to Cloudflare
npx wrangler login

# 3. Deploy with AI assistance
# Open in Claude Code or Cursor and say:
# "Deploy this to my Cloudflare account"
```

The AI agent will guide you through creating resources and deploying. Then open your portal URL and add API keys in Settings.

**Requirements:**
- Cloudflare account (free tier works)
- Claude API key (evaluation & orchestration)
- Gemini API key (deep research)

---

## What Changed in v1.1

| Area | v1.0 | v1.1 |
|------|------|------|
| **Market Discovery** | DOM scraping via Playwriter | Gamma API (structured, reliable) |
| **Research** | Single technique | Multi-technique (Deep Research, Quick Search, Analysis) |
| **Research Robustness** | Lost on crash | Resumable via stored interaction_id |
| **Evaluation Philosophy** | Mechanical edge comparison | Alpha-seeking (default NO TRADE) |
| **Trade Signal** | Edge > threshold | Explicit `recommend_trade` with thesis |
| **UI Pattern** | Separate views | Kanban pipeline (Watching → Researching → Evaluated → Traded) |
| **Polling** | Constant 5s | Smart (5s active, 30s idle) |
| **Data Model** | 9 separate tables | Consolidated with events + multi-outcome support |

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         YOUR CLOUDFLARE ACCOUNT                              │
│                                                                              │
│  ┌─────────────┐   ┌─────────────┐   ┌─────────────┐   ┌─────────────┐     │
│  │     D1      │   │     R2      │   │   Worker    │   │    Queue    │     │
│  │  Database   │   │  Artifacts  │   │    API      │   │  Research   │     │
│  │             │   │             │   │             │   │  (parallel) │     │
│  │ • markets   │   │ • reports   │   │ • REST API  │   │             │     │
│  │ • research  │   │ • screens   │   │ • Gamma     │   │ max_con: 10 │     │
│  │ • evals     │   │             │   │   proxy     │   │             │     │
│  │ • prompts   │   │             │   │             │   │             │     │
│  └──────┬──────┘   └──────┬──────┘   └──────┬──────┘   └──────┬──────┘     │
│         └──────────────────┴──────────────────┴──────────────────┘          │
│                                      │                                       │
│  ┌───────────────────────────────────┴───────────────────────────────────┐  │
│  │                         Pages (Portal UI)                              │  │
│  │   Kanban Pipeline: Watching → Researching → Evaluated → Traded        │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                    ┌─────────────────┼─────────────────┐
                    ▼                 ▼                 ▼
            ┌─────────────┐   ┌─────────────┐   ┌─────────────┐
            │   Gemini    │   │   Claude    │   │  Polymarket │
            │   Deep      │   │   Opus      │   │  Gamma API  │
            │  Research   │   │  (Eval)     │   │  (Markets)  │
            └─────────────┘   └─────────────┘   └─────────────┘
```

**Why this architecture:**
- **Gamma API** for market data (not scraping) — structured, reliable, includes volume/liquidity/description
- **Worker proxy** — avoids CORS, fetches from external APIs server-side
- **Queue with concurrency** — parallel research, resumable on crash
- **Single database** — D1 handles all structured data
- **Pages** — static frontend with smart polling

---

## Market Discovery

### Polymarket Gamma API

PunditKit uses Polymarket's official Gamma API instead of DOM scraping:

```
GET https://gamma-api.polymarket.com/markets?active=true&closed=false&limit=100
```

**Why Gamma API over scraping:**
- Structured JSON with all fields (question, description, resolution criteria)
- Volume, liquidity, price trends included
- Multi-outcome markets properly represented
- No CSS selector dependencies
- No broken data extraction

**IMPORTANT:** Browser can't call Gamma API directly (CORS). The Worker acts as proxy:

```
Portal → POST /markets/sync-from-gamma → Worker → Gamma API → D1
```

### Data Types

Gamma API returns numbers as strings. Always parse:

```typescript
// WRONG
const odds = market.outcomePrices[0];  // "0.65" (string!)

// RIGHT
const odds = parseFloat(market.outcomePrices[0]);  // 0.65
```

### Multi-Outcome Markets

Markets can have more than Yes/No. Store as JSON arrays:

```sql
outcomes TEXT NOT NULL DEFAULT '["Yes", "No"]'
outcome_prices TEXT NOT NULL DEFAULT '["0.5", "0.5"]'
```

Parse in frontend:
```typescript
const outcomes = JSON.parse(market.outcomes);        // ["4-6", "7-9", "10-12"]
const prices = JSON.parse(market.outcome_prices);    // ["0.15", "0.35", "0.30"]
```

---

## Research System

### Multi-Technique Research

Each market can have multiple research reports using different techniques:

| Technique | Model | Speed | Use Case |
|-----------|-------|-------|----------|
| `deep_research` | `deep-research-pro-preview-12-2025` | 2-5 min | Comprehensive autonomous research |
| `quick_search` | `gemini-3-pro-preview` | 10-30 sec | Fast first pass with Google grounding |
| `analysis` | `claude-opus-4-5-20251101` | 30-60 sec | Synthesize existing research |

**Workflow example:**
1. Queue Deep Research Pro (2-5 min)
2. While waiting, run Quick Search (30 sec)
3. Review quick results immediately
4. When Deep Research completes, review comprehensive report
5. Optionally run Claude Analysis to synthesize all findings

### Robust Deep Research

Deep Research can take minutes. If the Worker crashes, we need to resume:

**Create + Poll Pattern:**

```typescript
// Step 1: Create interaction, save ID immediately
const { interactionId } = await createDeepResearchInteraction(apiKey, query);

// Save to DB BEFORE polling (enables resume)
await db.prepare(`
  UPDATE research_paths SET gemini_interaction_id = ? WHERE id = ?
`).bind(interactionId, pathId).run();

// Step 2: Poll with progress callback
const result = await pollDeepResearchUntilComplete(apiKey, interactionId, async (pollCount) => {
  // Update progress in DB
  await db.prepare(`
    UPDATE research_paths SET poll_count = ?, last_polled_at = datetime('now') WHERE id = ?
  `).bind(pollCount, pathId).run();
});
```

**On Queue Retry (crash recovery):**

```typescript
// Check for existing interaction_id
const existing = await db.prepare(`
  SELECT gemini_interaction_id FROM research_paths WHERE id = ?
`).bind(pathId).first();

if (existing?.gemini_interaction_id) {
  // Resume polling existing interaction
  return pollDeepResearchUntilComplete(apiKey, existing.gemini_interaction_id);
} else {
  // Create new interaction
  const { interactionId } = await createDeepResearchInteraction(apiKey, query);
  // ... save and poll
}
```

### Parallel Research

Enable parallel research execution in `wrangler.toml`:

```toml
[[queues.consumers]]
queue = "pundit-research"
max_batch_size = 10
max_concurrency = 10  # Run up to 10 research jobs simultaneously
max_retries = 3
```

---

## Evaluation System

### Alpha-Seeking Philosophy

The old approach was mechanical:
```
IF estimated_probability > market_odds + threshold THEN recommend_trade
```

**This is wrong because:**
1. Markets are usually right
2. Small edge at extreme probabilities = high risk (buying at 3% means 97% chance of total loss)
3. No identification of WHY we know better

### New Evaluation Prompt

```
CORE PRINCIPLE: The market is usually right. The current price reflects the collective
wisdom of thousands of participants with real money at stake. You should ONLY recommend
trading when you have a SPECIFIC, ARTICULABLE reason to believe the market is wrong.

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

RISK AWARENESS:
- Buying YES at 3% means losing 100% of stake if wrong
- Markets near extremes (0-10% or 90-100%) require EXTRAORDINARY evidence
```

### Evaluation Output

The evaluation returns structured JSON with explicit trade recommendation:

```json
{
  "probability": 0.25,
  "confidence": "medium",
  "recommend_trade": false,
  "trade_direction": null,
  "information_advantage": "weak",
  "market_inefficiency": null,
  "trade_thesis": null,
  "base_rate": {
    "estimate": "15%",
    "reasoning": "Historical ceasefire success rate in similar conflicts"
  },
  "key_factors_yes": [
    "Trump admin pushing for deal",
    "Ukraine war fatigue growing",
    "Economic pressure on Russia"
  ],
  "key_factors_no": [
    "Putin shows no flexibility",
    "Territory disputes unresolved",
    "No ceasefire mechanism exists"
  ],
  "main_uncertainty": "Whether Trump can actually influence Putin",
  "market_comparison": "Market correctly prices low probability given historical precedent",
  "reasoning": "Full analysis paragraph..."
}
```

### New Evaluation Fields

| Field | Type | Description |
|-------|------|-------------|
| `recommend_trade` | boolean | Primary signal: should we trade? |
| `trade_direction` | 'yes' \| 'no' \| null | Which side to buy |
| `information_advantage` | 'none' \| 'weak' \| 'moderate' \| 'strong' | Edge over the crowd |
| `market_inefficiency` | string \| null | Why the market is wrong |
| `trade_thesis` | string \| null | Clear 1-sentence rationale |

### Position Sizing

Position is only calculated when `recommend_trade === true`:

```typescript
let recommendedPosition = 0;

// Only calculate position if AI recommends trading
if (richEvaluation.recommend_trade && !isFloorCeilingCase) {
  recommendedPosition = calculateKellyPosition(
    edge,
    currentOdds,
    compositeScore,
    maxPositionPercent,
    minConfidence
  );
}
```

### Floor/Ceiling Detection

Don't trade when probability is at calibration bounds:

```typescript
// Model outputs 5-95% for calibration, not as real estimates at extremes
const isAtFloor = probability <= 0.06;    // At or near 5% floor
const isAtCeiling = probability >= 0.94;  // At or near 95% ceiling
const marketBelowFloor = currentOdds < 0.04;
const marketAboveCeiling = currentOdds > 0.96;

// If estimate is at floor AND market is below floor, no meaningful signal
if ((isAtFloor && marketBelowFloor) || (isAtCeiling && marketAboveCeiling)) {
  recommendedPosition = 0;
}
```

---

## Data Model

### Consolidated Schema

```sql
-- Events: Group related markets
CREATE TABLE events (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  image TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- Markets: Full Gamma API data with multi-outcome support
CREATE TABLE markets (
  id TEXT PRIMARY KEY,
  platform TEXT NOT NULL DEFAULT 'polymarket',

  -- Gamma identifiers
  gamma_id TEXT,
  condition_id TEXT UNIQUE,
  slug TEXT,
  event_id TEXT REFERENCES events(id),

  -- Core data
  question TEXT NOT NULL,
  description TEXT,
  image TEXT,

  -- Multi-outcome (JSON arrays)
  outcomes TEXT NOT NULL DEFAULT '["Yes", "No"]',
  outcome_prices TEXT NOT NULL DEFAULT '["0.5", "0.5"]',

  -- Volume & liquidity
  volume REAL DEFAULT 0,
  volume_24hr REAL DEFAULT 0,
  liquidity REAL DEFAULT 0,

  -- Price trends
  one_day_price_change REAL,
  one_week_price_change REAL,
  competitive REAL,

  -- Dates & status
  end_date TEXT,
  status TEXT DEFAULT 'watching',
  last_synced TEXT DEFAULT (datetime('now')),
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- Research paths: Multiple reports per market
CREATE TABLE research_paths (
  id TEXT PRIMARY KEY,
  market_id TEXT NOT NULL REFERENCES markets(id),
  gemini_interaction_id TEXT,  -- Stored immediately for resume
  query TEXT NOT NULL,
  status TEXT DEFAULT 'pending',
  summary TEXT,
  key_facts TEXT,              -- JSON array
  contradictions TEXT,         -- JSON array
  error_message TEXT,

  -- Multi-model support
  model TEXT,
  prompt_id TEXT REFERENCES prompts(id),
  technique TEXT,              -- 'deep_research' | 'quick_search' | 'analysis'
  duration_seconds INTEGER,

  -- Progress tracking
  poll_count INTEGER DEFAULT 0,
  last_polled_at TEXT,
  started_at TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  completed_at TEXT
);

-- Research sources
CREATE TABLE research_sources (
  id TEXT PRIMARY KEY,
  research_path_id TEXT NOT NULL REFERENCES research_paths(id),
  url TEXT NOT NULL,
  title TEXT,
  domain_authority INTEGER,
  publish_date TEXT,
  relevance_score REAL,
  created_at TEXT DEFAULT (datetime('now'))
);

-- Evaluations: Alpha-seeking with full context
CREATE TABLE evaluations (
  id TEXT PRIMARY KEY,
  market_id TEXT NOT NULL REFERENCES markets(id),

  -- Legacy scoring (for backwards compatibility)
  source_authenticity INTEGER,
  confidence_level INTEGER,
  sizing_factor INTEGER,
  composite_edge REAL,
  estimated_probability REAL,
  recommended_position REAL,

  -- Full reasoning
  reasoning TEXT,
  research_path_ids TEXT,      -- JSON array

  -- Rich evaluation fields
  confidence TEXT,             -- 'high' | 'medium' | 'low'
  base_rate_estimate TEXT,
  base_rate_reasoning TEXT,
  key_factors_yes TEXT,        -- JSON array
  key_factors_no TEXT,         -- JSON array
  main_uncertainty TEXT,
  market_comparison TEXT,

  -- Alpha-seeking fields
  recommend_trade BOOLEAN DEFAULT FALSE,
  trade_direction TEXT,        -- 'yes' | 'no'
  information_advantage TEXT,  -- 'none' | 'weak' | 'moderate' | 'strong'
  market_inefficiency TEXT,
  trade_thesis TEXT,

  -- Model tracking
  model TEXT,
  prompt_id TEXT REFERENCES prompts(id),

  evaluated_at TEXT DEFAULT (datetime('now'))
);

-- Prompts: Experimentation and versioning
CREATE TABLE prompts (
  id TEXT PRIMARY KEY,
  stage TEXT NOT NULL,         -- 'research' | 'evaluation'
  name TEXT NOT NULL,
  system_prompt TEXT,          -- For evaluation stage
  user_prompt TEXT NOT NULL,
  model TEXT NOT NULL,
  temperature REAL DEFAULT 0.2,
  max_tokens INTEGER DEFAULT 2048,
  is_active BOOLEAN DEFAULT FALSE,
  notes TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- Trades
CREATE TABLE trades (
  id TEXT PRIMARY KEY,
  market_id TEXT NOT NULL REFERENCES markets(id),
  evaluation_id TEXT REFERENCES evaluations(id),
  outcome TEXT NOT NULL,
  outcome_index INTEGER,
  size REAL NOT NULL,
  entry_price REAL NOT NULL,
  exit_price REAL,
  direction TEXT,
  status TEXT DEFAULT 'pending',
  pnl REAL,
  tx_hash TEXT,
  executed_at TEXT,
  settled_at TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

-- Journal entries
CREATE TABLE journal_entries (
  id TEXT PRIMARY KEY,
  agent TEXT NOT NULL,
  action TEXT NOT NULL,
  reasoning TEXT,
  context TEXT,                -- JSON
  market_id TEXT REFERENCES markets(id),
  timestamp TEXT DEFAULT (datetime('now'))
);

-- Settings
CREATE TABLE settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT DEFAULT (datetime('now'))
);
```

---

## UI/UX

### Kanban Pipeline

Markets flow through stages. **One view, four tabs:**

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  WATCHING (47)  │  RESEARCHING (3)  │  EVALUATED (12)  │  TRADED (5)        │
├─────────────────────────────────────────────────────────────────────────────┤
```

| Tab | Shows | Actions |
|-----|-------|---------|
| **Watching** | Fresh synced markets | [Research] [Research + Evaluate] |
| **Researching** | Research in progress | Progress indicator, [Evaluate] when done |
| **Evaluated** | Has evaluation | Trade recommendation, [Log Trade] |
| **Traded** | Trade executed | Entry price, current price, P&L |

### Evaluated Card (Alpha-Seeking Display)

**When NOT recommending trade:**
```
┌─────────────────────────────────────────────────────────────────────────┐
│  ⏸ NO TRADE                           No Edge Info Advantage            │
│  Russia x Ukraine ceasefire in 2025?                                    │
│  polymarket • 5 minutes ago                                             │
├─────────────────────────────────────────────────────────────────────────┤
│  Market Assessment                                                      │
│  "Market correctly prices low probability given Putin's inflexibility"  │
├─────────────────────────────────────────────────────────────────────────┤
│  Market    Our Est    Edge      Base Rate    Position                   │
│    2%        5%      +3.0%        ~5%           —                       │
└─────────────────────────────────────────────────────────────────────────┘
```

**When recommending trade:**
```
┌─────────────────────────────────────────────────────────────────────────┐
│  📈 TRADE: BUY YES                  Moderate Info Advantage    [Log]    │
│  Will Trump talk to Xi before Jan 1?                                    │
│  polymarket • 12 minutes ago                                            │
├─────────────────────────────────────────────────────────────────────────┤
│  Trade Thesis                                                           │
│  "Breaking: WH source confirms call scheduled for Dec 28"               │
│  Market inefficiency: News not widely circulated yet                    │
├─────────────────────────────────────────────────────────────────────────┤
│  Market    Our Est    Edge      Base Rate    Position                   │
│   45%        72%     +27.0%       ~60%         2.5%                     │
│                                               $250                      │
├─────────────────────────────────────────────────────────────────────────┤
│  ✓ Why YES                        ✗ Why NO                              │
│  • WH source confirmation         • No official announcement            │
│  • Pattern of Dec diplomacy       • Trade tensions ongoing              │
├─────────────────────────────────────────────────────────────────────────┤
│  ⚠ Main Uncertainty: Whether WH source is reliable                      │
├─────────────────────────────────────────────────────────────────────────┤
│  ▶ Full Reasoning                                                       │
│  ▶ Research Used (2 reports)                                            │
└─────────────────────────────────────────────────────────────────────────┘
```

### Smart Polling

Don't waste requests when idle:

```typescript
const hasActiveResearch = researchPaths.some(r =>
  r.status === 'running' || r.status === 'pending'
);
const pollInterval = hasActiveResearch ? 5000 : 30000;  // 5s vs 30s

useEffect(() => {
  const interval = setInterval(fetchData, pollInterval);
  return () => clearInterval(interval);
}, [fetchData, pollInterval]);
```

### Markdown Rendering

Research summaries and reasoning should render as markdown:

```tsx
import ReactMarkdown from 'react-markdown';

<div className="prose prose-sm prose-invert">
  <ReactMarkdown>{evaluation.reasoning}</ReactMarkdown>
</div>
```

---

## API Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/health` | GET | Health check |
| `/markets` | GET | List markets (filter by status) |
| `/markets/:id` | GET | Get market with research & evals |
| `/markets/sync-from-gamma` | POST | Sync from Polymarket Gamma API |
| `/events` | GET | List events with market counts |
| `/events/:id` | GET | Get event with all markets |
| `/research` | GET | List research paths |
| `/research/spawn` | POST | Start research (queued) |
| `/evaluations` | GET | List evaluations |
| `/evaluations/:id` | GET | Get evaluation with full context |
| `/trades` | GET | List trades |
| `/trades` | POST | Log a trade |
| `/journal` | GET | Get journal entries |
| `/settings` | GET/POST | Get or save settings |
| `/prompts` | GET | List prompts |
| `/prompts/:id` | GET/PUT/DELETE | CRUD prompt |
| `/prompts/:id/activate` | POST | Set as production prompt |

---

## Configuration

### Settings

```yaml
# API Keys
claude_api_key: sk-ant-...
gemini_api_key: AIza...

# Risk Parameters
max_position_percent: 5.0    # Max % of bankroll per trade
bankroll: 10000              # Total trading capital
min_confidence: 60           # Minimum confidence score

# Platforms
platforms: [polymarket]
```

### Prompt Playground

Experiment with prompts before deploying to production:

1. Create new prompt with model selection
2. Test against real markets
3. Compare outputs
4. Set as production when satisfied

Each evaluation stores which prompt was used (`prompt_id`), enabling analysis of prompt performance over time.

---

## Deployment

### Agent-Guided Deployment

The recommended approach is to let an AI agent guide deployment:

```bash
# Open in Claude Code or Cursor
cd MOSSKits/PunditKit/demo

# Tell the agent:
"Deploy this PunditKit to my Cloudflare account.
Guide me through any authentication or resource creation needed."
```

The agent will:
1. Check Cloudflare authentication
2. Create D1 database, R2 bucket, Queue
3. Apply schema migrations
4. Deploy Worker and Pages
5. Report deployment URLs

### Manual Deployment

```bash
# 1. Create resources
npx wrangler d1 create pundit-db
npx wrangler r2 bucket create pundit-artifacts
npx wrangler queues create pundit-research

# 2. Update wrangler.toml with database_id

# 3. Deploy agent
cd agent
npm install
npx wrangler d1 execute pundit-db --remote --file=./schema.sql
npx wrangler deploy

# 4. Deploy portal
cd ../portal
npm install && npm run build
npx wrangler pages deploy dist --project-name=pundit-hq
```

---

## Project Structure

```
PunditKit/
├── PunditKit.md              # This spec (v1.1)
├── working-docs/             # Session logs, learnings
│   └── 2025-12-11-session.md
└── demo/
    ├── agent/
    │   ├── src/
    │   │   ├── index.ts      # Worker API + Queue consumer
    │   │   ├── types.ts      # TypeScript interfaces
    │   │   ├── agents/
    │   │   │   ├── researcher.ts  # Multi-technique research
    │   │   │   ├── analyst.ts     # Alpha-seeking evaluation
    │   │   │   └── chronicler.ts  # Journaling
    │   │   └── scoring/
    │   │       └── evaluator.ts   # Position sizing
    │   ├── schema.sql        # D1 schema
    │   └── wrangler.toml     # Cloudflare config
    └── portal/
        ├── src/
        │   └── App.tsx       # Kanban pipeline UI
        └── package.json
```

---

## Future Work

1. **WebSockets** — Replace polling with real-time updates
2. **Research Quality Scoring** — Rate research reports for aggregation weighting
3. **Selective Aggregation** — Choose which research reports to include in evaluation
4. **Deep Scan** — Click into markets for full description + comments
5. **Intermediate Progress** — Show Deep Research steps as they happen
6. **Prompt A/B Testing** — Compare prompt performance in Playground
7. **Trade Execution** — Integrate Playwriter MCP for automated trading

---

## Lessons Learned

### 1. API-First Over Scraping
DOM scraping is fragile. Polymarket's Gamma API provides structured, typed data with volume, liquidity, and description—data not easily scraped.

### 2. CORS Requires Server Proxy
Browser can't call third-party APIs directly. Worker fetches from Gamma API; Portal calls Worker.

### 3. Save State for Resumability
Long-running operations (Deep Research) must save state immediately. Interaction IDs enable crash recovery.

### 4. The Market Is Usually Right
Mechanical edge comparison ("my estimate vs market") is not alpha. Only trade when you can articulate a specific information advantage.

### 5. Clear Signals Over Dense Data
The key question after evaluation: "Do I trade or not?" Make this obvious. Hide complexity in collapsible sections.

### 6. Iterate on Real Data
The spec evolved through building. Document learnings in working-docs for future reference.

---

## License

MIT — Use it however you want.

---

*Seek alpha. Articulate your edge. Trade with conviction or don't trade at all.*
