# MOSS CloudKit

**Self-hosted iCloud on Cloudflare.**

Upload audio recordings, get automatic transcriptions with AI-powered summaries, entity extraction, and a smart assistant that can search and answer questions about your content.

All on your own Cloudflare account. You own your data.

![CloudKit Portal](https://memory-portal.pages.dev)

## Quick Start

```bash
# Clone
git clone https://github.com/anthropics/moss-cloudkit.git
cd moss-cloudkit

# Login to Cloudflare
npx wrangler login

# Deploy
./deploy.sh
```

Open your portal URL → Settings → Add API keys → Done.

## Requirements

- **Cloudflare account** — Free tier works
- **Deepgram API key** — For transcription ([deepgram.com](https://deepgram.com))
- **Claude API key** — For AI processing ([console.anthropic.com](https://console.anthropic.com))

## Features

- **iCloud-style interface** — Clean file browser with drag & drop
- **Automatic transcription** — Speaker diarization included
- **Entity extraction** — People, places, ideas automatically identified
- **AI summaries** — Title, summary, key moments generated
- **Smart assistant** — Ask questions, get answers with citations

## Architecture

Everything runs on your Cloudflare account:

| Service | Purpose |
|---------|---------|
| R2 | File storage |
| D1 | Database (metadata, transcripts, entities) |
| Workers | API backend |
| Queues | Async processing |
| Pages | Frontend portal |

## Privacy

Your data stays on **your** infrastructure. Audio and text are sent to Deepgram (transcription) and Claude (AI processing) for processing only—see their privacy policies.

## Demo

**Live portal:** [memory-portal.pages.dev](https://memory-portal.pages.dev)

This is a demo instance. Deploy your own and add API keys for full functionality.

## Documentation

See [CloudKit.md](./CloudKit.md) for the full specification.

## License

MIT

---

*Your cloud. Your data. Your rules.*
