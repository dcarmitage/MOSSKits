# MOSS PunditKit

*Autonomous prediction market agent on Cloudflare. Research, score, trade.*

## Quick Start

```bash
# 1. Clone the repo
git clone https://github.com/dcarmitage/MOSSKits.git
cd MOSSKits

# 2. Login to Cloudflare
npx wrangler login

# 3. Deploy
./deploy.sh
```

That's it. Open your portal URL and add your API keys in Settings.

**Requirements:**
- Cloudflare account (free tier works)
- Claude API key (orchestration & analysis)
- Gemini API key (deep research)
- [Playwriter extension](https://chromewebstore.google.com/detail/playwriter-mcp/jfeammnjpkecdekppnclgkkffahnhfhe) installed
- Wallet credentials (trade execution)

---

## What is Pundit?

An autonomous trading agent for prediction markets—built on Cloudflare. Pundit scans markets for information edges, conducts parallel deep research, scores findings, and executes trades with full transparency into its reasoning.

**You control everything.** Your research lives in your D1 database. Your trade history lives on your infrastructure. Complete audit trail of every decision.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     YOUR CLOUDFLARE ACCOUNT                     │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐        │
│  │    R2    │  │    D1    │  │  Worker  │  │  Queue   │        │
│  │artifacts │  │ research │  │  agent   │  │ parallel │        │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └────┬─────┘        │
│       └─────────────┴─────────────┴─────────────┘               │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │           PLAYWRITER (Browser Extension MCP)             │   │
│  │   Market navigation · Network traces · Trade execution   │   │
│  └──────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

**Storage:** R2 (screenshots, artifacts) + D1 (markets, research, trades, journals)  
**Compute:** Workers (orchestration) + Queue (parallel research)  
**Browser:** Playwriter MCP (market access, trade execution)  
**AI:** Claude for orchestration, Gemini Deep Research for investigation

---

## Playwriter Integration

Pundit uses [Playwriter](https://github.com/remorses/playwriter)—a browser extension MCP that's superior to traditional Playwright:

**Why Playwriter:**
- **Browser extension** — Works in your existing Chrome, not a separate instance
- **Single `execute` tool** — Full Playwright API via code snippets, 90% less context
- **Network tracing** — Capture trade flows, reverse engineer private APIs, generate SDKs
- **Bypass detection** — Disconnect extension to pass automation checks, reconnect to continue
- **Your extensions** — Keep ad blockers, password managers, existing session state

**Setup:**
1. Install [Playwriter extension](https://chromewebstore.google.com/detail/playwriter-mcp/jfeammnjpkecdekppnclgkkffahnhfhe)
2. Click extension icon on tabs you want to control (turns green)
3. MCP connects via localhost WebSocket

**SDK Generation Flow:**
```
1. Scout navigates to Polymarket
2. Playwriter tracks network requests during trade flow
3. Network traces fed to LLM
4. LLM generates typed SDK for that market's API
5. Trader uses SDK for faster, direct execution
```

---

## Gemini Deep Research

Pundit uses [Gemini Deep Research](https://ai.google.dev/gemini-api/docs/deep-research)—an autonomous research agent that plans, searches, reads, and synthesizes.

**Key Details:**
- **Agent:** `deep-research-pro-preview-12-2025`
- **Process:** Plan → Search → Read → Iterate → Output (minutes, not seconds)
- **Execution:** Async via `background=True`, poll for results or stream
- **Output:** Detailed reports with citations

**Integration:**
```python
from google import genai

client = genai.Client()

# Start research (async)
interaction = client.interactions.create(
    input="Research factors affecting [market question]",
    agent='deep-research-pro-preview-12-2025',
    background=True,
    stream=True,
    agent_config={"type": "deep-research", "thinking_summaries": "auto"}
)

# Stream results
for chunk in interaction:
    if chunk.event_type == "content.delta":
        process_research_update(chunk)
```

---

## Agent System

| Agent | Role | Tools |
|-------|------|-------|
| **Scout** | Market discovery | Playwriter `execute` |
| **Researcher** | Deep investigation | Gemini Deep Research API |
| **Analyst** | Scoring & edge calc | Claude |
| **Trader** | Position & execution | Playwriter + Wallet |
| **Chronicler** | Logging & snapshots | D1 |

**Flow:** Scout → Researcher → Analyst → Trader (all logged by Chronicler)

---

## Processing Pipeline

1. **Discover** → Scout navigates markets via Playwriter, identifies opportunities
2. **Research** → Researcher spawns Gemini Deep Research queries (async, parallel)
3. **Score** → Analyst evaluates research against scoring factors
4. **Decide** → Analyst aggregates scores, calculates edge and position size
5. **Execute** → Trader uses Playwriter to interact with wallet, sign and place trades
6. **Log** → Chronicler captures all reasoning, produces daily digest

---

## Scoring System

### Core Factors (v1)

| Factor | Weight | Measures |
|--------|--------|----------|
| **Source Authenticity** | 40% | Primary vs secondary, domain authority, recency, corroboration |
| **Confidence Level** | 35% | Evidence convergence, contradiction detection, completeness |
| **Bet Sizing** | 25% | Kelly criterion, bankroll %, liquidity constraints |

**Output:** Composite edge estimate + recommended position size

### Evaluation Output

```
Source Authenticity:  78/100  (7 primary sources, high domain authority)
Confidence Level:     65/100  (moderate convergence, 1 contradiction)
Sizing Factor:        72/100  (good liquidity, within risk limits)
─────────────────────────────────────────────────────────────────
COMPOSITE EDGE: +11.2%    RECOMMENDED POSITION: 1.8% bankroll
```

---

## Data Model

```
Market
├── id, platform, question, current_odds, volume, liquidity
├── close_date, status (watching|researching|traded|closed)
├── generated_sdk         → SDK from network traces (if available)
└── last_scanned

ResearchPath
├── id, market_id, gemini_interaction_id
├── status (pending|running|completed|failed)
├── sources[] → url, title, domain_authority, publish_date
├── findings → summary, key_facts[], contradictions[]
└── created_at

Evaluation
├── id, market_id, research_paths[]
├── scores → source_authenticity, confidence_level, sizing_factor
├── composite_edge, recommended_position, reasoning
└── evaluated_at

Trade
├── id, market_id, evaluation_id
├── direction (yes|no), size, entry_odds
├── status (pending|executed|settled), pnl
└── executed_at, settled_at

JournalEntry
├── id, agent, action, reasoning, context
└── timestamp

DailySnapshot
├── id, date, summary, full_journal
└── markets_scanned, research_completed, trades_executed, total_pnl
```

---

## API Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/health` | GET | Health check |
| `/markets` | GET | List tracked markets |
| `/markets/:id` | GET | Get market with research |
| `/markets/scan` | POST | Trigger market scan |
| `/research` | GET | List research paths |
| `/research/spawn` | POST | Start Gemini Deep Research |
| `/evaluations` | GET | List evaluations |
| `/evaluations/:id` | GET | Get evaluation with reasoning |
| `/trades` | GET | List trades |
| `/trades/execute` | POST | Execute a trade |
| `/journal` | GET | Get journal entries |
| `/snapshots/:date` | GET | Get snapshot for date |
| `/settings` | GET/POST | Get or save settings |

---

## Journaling System

### Real-Time Logging

```
[14:23:07] SCOUT      Scanning Polymarket via Playwriter
[14:23:12] SCOUT      Found 3 markets with potential edge
[14:24:01] RESEARCHER Starting Gemini Deep Research (interaction_abc123)
[14:28:45] RESEARCHER Research complete: 12 sources, cited report ready
[14:29:02] ANALYST    Evaluating: Auth 78, Conf 65, Size 72
[14:29:18] ANALYST    Edge: +11.2%, recommended: 1.8% bankroll
[14:29:52] TRADER     Executed YES @ 0.42 ($180) via Playwriter
```

### Daily Snapshot

End of day, Chronicler produces a digest covering: trades executed, research highlights, open positions, P&L summary, and system notes.

---

## Portal Layout (Future HQ Dashboard)

```
┌─────────────────────────────────────────────────────────────────┐
│ ● ● ●    Pundit HQ                                    ⚙    📊  │
├──────────┬──────────────────────────────────────────────────────┤
│ Markets  │  📈 Market question here                            │
│  └ Watch │     Edge: +12% | Position: 2.1% | Live              │
│  └ Active│  📈 Another market                                  │
│  └ Closed│     Researching...                    [████░░]      │
│ Research │──────────────────────────────────────────────────────│
│ Trades   │  DAILY P&L: +$127.40                                │
│ Journal  │  Win Rate: 64% | Avg Edge: 9.2%                     │
└──────────┴──────────────────────────────────────────────────────┘
Use Shadcn.
```

---

## Privacy & Control

**On your infrastructure:**
- All market data, research, trade history, journals (D1)
- Screenshots and artifacts (R2)
- API keys stored encrypted (D1)

**Third-party processing:**
- Research queries → Gemini Deep Research (investigation only)
- Analysis prompts → Claude (reasoning only)
- Browser actions → Playwriter runs locally in your Chrome

---

## Configuration

### Settings Panel

- **Claude API Key** — [console.anthropic.com](https://console.anthropic.com)
- **Gemini API Key** — [ai.google.dev](https://ai.google.dev)
- **Playwriter** — Install extension, click icon on market tabs
- **Wallet Config** — Platform credentials for trade execution
- **Risk Parameters** — Max position size, daily limits

### Risk Controls

```yaml
max_position_percent: 5.0      # Max % of bankroll per trade
max_daily_trades: 10           # Circuit breaker
min_edge_threshold: 0.05       # Don't trade below 5% edge
min_confidence: 60             # Minimum confidence score
platforms: [polymarket, kalshi]
```

---

## Development

```bash
# Install dependencies
cd agent && npm install
cd ../portal && npm install

# Run locally
cd agent && npm run dev      # Agent
cd portal && npm run dev     # Portal (separate terminal)
```

### Project Structure

```
MOSSKits/PunditKit/
├── PunditKit.md         # This spec
├── README.md            # Quick start guide
├── deploy.sh            # One-click deploy script
├── agent/
│   ├── src/
│   │   ├── index.ts     # Orchestration worker
│   │   ├── agents/      # scout, researcher, analyst, trader, chronicler
│   │   └── scoring/     # evaluator.ts
│   ├── schema.sql       # D1 database schema
│   └── wrangler.toml
└── portal/
    ├── src/             # React app
    └── package.json
```

---

## Deploy Your Own

### Option 1: Deploy Script
```bash
./deploy.sh
```

### Option 2: Manual
```bash
# Create Cloudflare resources
npx wrangler d1 create pundit-db
npx wrangler r2 bucket create pundit-artifacts
npx wrangler queues create pundit-research

# Deploy
cd agent && npm install
npx wrangler d1 execute pundit-db --remote --file=./schema.sql
npx wrangler deploy

cd ../portal && npm install && npm run build
npx wrangler pages project create pundit-hq --production-branch=main
npx wrangler pages deploy dist --project-name=pundit-hq
```

---

## Roadmap

**Current Phase: Infrastructure**
- [x] Agent architecture
- [x] Playwriter MCP integration (network tracing, SDK generation)
- [x] Gemini Deep Research integration (async, streaming)
- [x] 3-factor scoring system
- [x] Journaling system + daily snapshots

**Next: Optimization**
- [ ] Parameter tuning for scoring factors
- [ ] Backtesting framework
- [ ] Auto-generated market SDKs from network traces

**Future: HQ Dashboard**
- [ ] Real-time monitoring & eval system
- [ ] Manual override controls
- [ ] Alert system

---

## License

MIT — Use it however you want.

---

## Contributing

PRs welcome. Please open an issue first for major changes.

---

*Your edge. Your research. Your trades.*
