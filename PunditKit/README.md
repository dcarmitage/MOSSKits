# PunditKit Demo

Autonomous prediction market trading agent on Cloudflare.

## Quick Start

```bash
# 1. Login to Cloudflare
npx wrangler login

# 2. Deploy everything
./deploy.sh
```

That's it. Open your portal URL and add your API keys in Settings.

## Requirements

- Cloudflare account (free tier works)
- Claude API key ([console.anthropic.com](https://console.anthropic.com))
- Gemini API key ([ai.google.dev](https://ai.google.dev))
- [Playwriter extension](https://chromewebstore.google.com/detail/playwriter-mcp/jfeammnjpkecdekppnclgkkffahnhfhe) for market scanning

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

## Agent System

| Agent | Role |
|-------|------|
| **Scout** | Market discovery via Playwriter |
| **Researcher** | Gemini Deep Research investigation |
| **Analyst** | 3-factor scoring & edge calculation |
| **Trader** | Position sizing & execution |
| **Chronicler** | Logging & daily snapshots |

## Scoring System

```
Source Authenticity (40%) + Confidence Level (35%) + Sizing Factor (25%)
                    ↓
            Composite Score
                    ↓
        Kelly Criterion → Recommended Position
```

## Local Development

```bash
# Agent (Worker)
cd demo/agent
npm install
npm run dev

# Portal (React)
cd demo/portal
npm install
npm run dev
```

## Manual Deployment

```bash
# Create Cloudflare resources
npx wrangler d1 create pundit-db
npx wrangler r2 bucket create pundit-artifacts
npx wrangler queues create pundit-research

# Deploy Agent
cd demo/agent
npm install
npx wrangler d1 execute pundit-db --remote --file=./schema.sql
npx wrangler deploy

# Deploy Portal
cd ../portal
npm install
npm run build
npx wrangler pages project create pundit-hq --production-branch=main
npx wrangler pages deploy dist --project-name=pundit-hq
```

## API Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/health` | GET | Health check |
| `/settings` | GET/POST | API keys (masked), risk params |
| `/markets` | GET | List markets |
| `/markets/:id` | GET | Market with research & evals |
| `/markets/scan` | POST | Trigger Scout |
| `/research/spawn` | POST | Queue Gemini research |
| `/evaluations/run` | POST | Trigger Analyst |
| `/trades/execute` | POST | Execute trade |
| `/journal` | GET | Activity feed |
| `/snapshots/:date` | GET | Daily snapshot |

## Project Structure

```
PunditKit/
├── PunditKit.md         # Specification
├── README.md            # This file
├── deploy.sh            # One-click deploy
└── demo/
    ├── agent/           # Cloudflare Worker
    │   ├── src/
    │   │   ├── index.ts          # API + queue consumer
    │   │   ├── types.ts          # TypeScript types
    │   │   ├── agents/           # Agent implementations
    │   │   └── scoring/          # 3-factor evaluator
    │   ├── schema.sql            # D1 schema
    │   └── wrangler.toml         # Worker config
    └── portal/          # React Dashboard
        ├── src/
        │   ├── App.tsx           # All views
        │   └── globals.css       # Fey-inspired theme
        └── tailwind.config.js    # Custom colors
```

## License

MIT
