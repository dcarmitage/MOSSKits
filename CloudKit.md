# MOSS CloudKit

*Self-hosted iCloud on Cloudflare. Your data, your infrastructure.*

## Quick Start

```bash
# 1. Clone this repo
git clone https://github.com/anthropics/moss-cloudkit.git
cd moss-cloudkit

# 2. Login to Cloudflare
npx wrangler login

# 3. Deploy
./deploy.sh
```

That's it. Open your portal URL and add your API keys in Settings.

**Requirements:**
- Cloudflare account (free tier works)
- Deepgram API key (transcription)
- Claude API key (AI processing)

---

## What is MOSS CloudKit?

An open-source, self-hosted alternative to iCloud—built entirely on Cloudflare's infrastructure. Upload audio recordings, get automatic transcriptions, AI-powered summaries, and a smart agent that can search and answer questions about your content.

**You own everything.** Your files live in your R2 bucket. Your data lives in your D1 database. Nothing is stored on our servers.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     YOUR CLOUDFLARE ACCOUNT                     │
│                                                                 │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐        │
│  │    R2    │  │    D1    │  │  Worker  │  │  Queue   │        │
│  │  files   │  │ metadata │  │   API    │  │  async   │        │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └────┬─────┘        │
│       └─────────────┴─────────────┴─────────────┘               │
│                            │                                    │
│  ┌─────────────────────────┴───────────────────────────────┐   │
│  │                     PORTAL (Pages)                       │   │
│  │                                                          │   │
│  │   iCloud-style file browser + AI assistant chat panel    │   │
│  │                                                          │   │
│  └──────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

**Storage:** R2 (files) + D1 (metadata, transcripts, entities)
**Compute:** Workers (API) + Queue (async processing)
**Frontend:** Pages (React portal)
**AI:** Claude for extraction & reasoning, Deepgram for transcription

---

## Features

### Portal
- **iCloud-style interface** — Clean, minimal file browser
- **Drag & drop uploads** — Just drop audio files
- **Real-time processing status** — Watch transcription → extraction → completion
- **Entity extraction** — Automatically identifies people, places, ideas
- **AI chat panel** — Ask questions about your recordings

### Processing Pipeline
1. **Upload** → File stored in R2
2. **Transcribe** → Deepgram converts audio to text with speaker diarization
3. **Extract** → Claude identifies entities (people, places, things, patterns)
4. **Compile** → Claude generates title, summary, key moments
5. **Done** → Everything searchable and queryable

### AI Assistant
Ask questions like:
- "What did Maria say about the project timeline?"
- "Summarize my conversations from last week"
- "Who have I mentioned most frequently?"

The assistant searches your recordings and responds with citations.

---

## Data Model

```
Recording
├── id
├── filename
├── audio_key          → file in R2
├── duration_seconds
├── speaker_count
├── status             → uploading | processing | completed | failed
├── processing_phase   → transcribing | extracting | compiling
│
├── transcript
│   ├── full_text
│   └── segments[]
│       ├── speaker
│       ├── text
│       ├── start_ms
│       └── end_ms
│
└── memory
    ├── title
    ├── summary
    └── moments[]
        ├── quote
        ├── context
        └── significance

Entity
├── id
├── name
├── type               → person | place | thing | pattern | era | phrase
├── portrait           → AI-generated description
├── confidence         → emerging | developing | established
├── mentions[]
│   ├── recording_id
│   ├── quote
│   └── context
└── connections[]
    ├── entity_id
    ├── relationship
    └── evidence
```

---

## API Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/health` | GET | Health check |
| `/upload` | POST | Upload audio file |
| `/recordings` | GET | List all recordings |
| `/recordings/:id` | GET | Get recording with transcript |
| `/recordings/:id` | DELETE | Delete recording |
| `/recordings/:id/audio` | GET | Stream audio file |
| `/recordings/:id/transcribe` | POST | Re-trigger transcription |
| `/recordings/:id/summarize` | POST | Re-generate summary |
| `/entities` | GET | List entities (filter by type) |
| `/entities/:id` | GET | Get entity with mentions |
| `/search` | GET | Search recordings and entities |
| `/ask` | POST | Ask AI assistant |
| `/settings` | GET | Get settings |
| `/settings` | POST | Save settings |

---

## Portal Layout

```
┌─────────────────────────────────────────────────────────────────┐
│ ● ● ●    CloudKit                                     ⚙    💬  │
├──────────┬──────────────────────────────────────────────────────┤
│          │                                                      │
│ Library  │  ┌────────────────────────────────────────────────┐  │
│  └ All   │  │  🎙  meeting-notes-dec-2024.m4a              │  │
│  └ Today │  │     23 min · 3 speakers · Done           ✓    │  │
│  └ Week  │  ├────────────────────────────────────────────────┤  │
│          │  │  🎙  interview-recording.m4a                  │  │
│ Entities │  │     47 min · 2 speakers · Done           ✓    │  │
│  └ People│  ├────────────────────────────────────────────────┤  │
│  └ Places│  │  🎙  voice-memo.m4a                           │  │
│  └ Ideas │  │     Processing...                    [····]   │  │
│          │  └────────────────────────────────────────────────┘  │
│          │                                                      │
│          │  ┌────────────────────────────────────────────────┐  │
│          │  │                                                │  │
│          │  │     Drop audio files here to upload            │  │
│          │  │              or click to browse                │  │
│          │  │                                                │  │
│          │  └────────────────────────────────────────────────┘  │
└──────────┴──────────────────────────────────────────────────────┘
```

---

## Privacy Model

Your data stays on **your** infrastructure:

```
Your audio file
      │
      ▼
┌─────────────────┐
│   Your R2       │  ← Stored permanently on your account
└────────┬────────┘
         │
         ▼ (sent for transcription)
┌─────────────────┐
│   Deepgram      │  ← Processes, returns text
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│   Your D1       │  ← Transcript stored on your account
└────────┬────────┘
         │
         ▼ (sent for AI processing)
┌─────────────────┐
│   Claude        │  ← Extracts entities, generates summaries
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│   Your D1       │  ← All AI outputs stored on your account
└─────────────────┘
```

**On your infrastructure:**
- All files (R2)
- All metadata, transcripts, entities (D1)
- API keys stored encrypted (D1)

**Third-party processing:**
- Audio → Deepgram (transcription only)
- Text → Claude (entity extraction, summaries, chat)

See each provider's privacy policy for their data handling.

---

## Configuration

### Settings Panel
Access via ⚙️ in the portal header:

- **Deepgram API Key** — Get one at [deepgram.com](https://deepgram.com)
- **Claude API Key** — Get one at [console.anthropic.com](https://console.anthropic.com)
- **Theme** — Light or Warm

### Environment
API keys are stored in D1, not in code. The deployed worker reads them at runtime.

---

## Development

```bash
# Install dependencies
cd api && npm install
cd ../portal && npm install

# Run API locally
cd api && npm run dev

# Run portal locally (in another terminal)
cd portal && npm run dev
```

### Project Structure
```
moss-cloudkit/
├── CloudKit.md          # This spec
├── README.md            # Quick start guide
├── deploy.sh            # One-click deploy script
├── api/
│   ├── src/index.ts     # Hono API + Queue consumer
│   ├── schema.sql       # D1 database schema
│   ├── wrangler.toml    # Worker configuration
│   └── package.json
└── portal/
    ├── src/
    │   ├── App.tsx      # Main React app
    │   ├── styles.css   # Design system
    │   └── main.tsx     # Entry point
    ├── index.html
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
npx wrangler d1 create cloudkit-db
npx wrangler r2 bucket create cloudkit-files
npx wrangler queues create cloudkit-processing

# Update api/wrangler.toml with your database ID

# Deploy API
cd api
npm install
npx wrangler d1 execute cloudkit-db --remote --file=./schema.sql
npx wrangler deploy

# Deploy Portal
cd ../portal
npm install
npm run build
npx wrangler pages project create cloudkit-portal --production-branch=main
npx wrangler pages deploy dist --project-name=cloudkit-portal
```

---

## Demo

Live demo: [https://memory-portal.pages.dev](https://memory-portal.pages.dev)

This is a deployed instance showing the portal interface. To use it fully, deploy your own and add your API keys.

---

## License

MIT — Use it however you want.

---

## Contributing

PRs welcome. Please open an issue first for major changes.

---

*Your cloud. Your data. Your rules.*
