# MOSS CloudKit

**Self-hosted iCloud on Cloudflare.**

Upload audio → Get transcripts → AI summaries → Smart search.

All on your own infrastructure.

## Quick Start

```bash
# Login to Cloudflare
npx wrangler login

# Deploy
./deploy.sh
```

Open your portal URL → Settings → Add API keys → Done.

## Requirements

| Service | Purpose | Get it |
|---------|---------|--------|
| Cloudflare | Infrastructure | [cloudflare.com](https://cloudflare.com) (free tier works) |
| Deepgram | Transcription | [deepgram.com](https://deepgram.com) |
| Claude | AI processing | [console.anthropic.com](https://console.anthropic.com) |

## Structure

```
CloudKit/
├── api/                 # Hono backend on Workers
│   ├── src/index.ts     # API + Queue consumer
│   ├── schema.sql       # D1 database schema
│   └── wrangler.toml    # Worker config
├── portal/              # React frontend on Pages
│   ├── src/App.tsx      # Main app
│   └── src/styles.css   # Design system
├── patches/             # Design assets
│   └── THEME.png        # Color palette & typography
├── deploy.sh            # One-click deploy
└── CloudKit.md          # Full specification
```

## What Gets Created

| Resource | Name | Purpose |
|----------|------|---------|
| D1 | cloudkit-db | Metadata, transcripts, entities |
| R2 | cloudkit-files | Audio file storage |
| Queue | cloudkit-processing | Async processing |
| Worker | cloudkit-api | Backend API |
| Pages | cloudkit-portal | Frontend UI |

## Development

```bash
# API (localhost:8787)
cd api && npm install && npm run dev

# Portal (localhost:5173)
cd portal && npm install && npm run dev
```

## API Endpoints

| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/health` | Health check |
| POST | `/upload` | Upload audio |
| GET | `/recordings` | List recordings |
| GET | `/recordings/:id` | Get recording details |
| DELETE | `/recordings/:id` | Delete recording |
| GET | `/entities` | List entities |
| GET | `/search?q=` | Search everything |
| POST | `/ask` | Ask AI assistant |
| GET/POST | `/settings` | Manage settings |

## Design System

See [patches/THEME.png](./patches/THEME.png)

| Color | Hex | Usage |
|-------|-----|-------|
| Black | `#040404` | Primary text |
| Dark Gray | `#242424` | Secondary text |
| Medium Gray | `#575757` | Muted text |
| Light Gray | `#E9E8E7` | Backgrounds |
| Green | `#B6E18C` | Accent |

**Font:** TWK Lausanne

## Docs

Full specification: [CloudKit.md](./CloudKit.md)

---

*Your cloud. Your data. Your rules.*

---

<sub>This README is based on [CloudKit.md](./CloudKit.md)</sub>
