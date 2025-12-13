# MOSSKits

Instruction manuals for your AI coding agent. Fork this, say "build CloudKit", watch it build.

You don't code - your AI does. MOSSKits tells it exactly what to build.

## Quick Start

1. Fork this repo
2. Open in any AI coding tool (Claude Code, Cursor, Windsurf...)
3. Say: "build CloudKit"
4. Watch it build, help with deployment
5. Done - you have working software

## Available Kits

| Kit | What You Get | Platform |
|-----|--------------|----------|
| CloudKit | Self-hosted iCloud - file storage, transcription, AI search | Cloudflare |
| PunditKit | Prediction market research agent | Cloudflare |
| PhysicsKit | Multi-body physics simulation | Browser |
| EvalKit | Benchmark AI coding tools | Meta |

## How It Works

When you say "build {KitName}":

1. I read the spec ({KitName}/{KitName}.md) - this is my instruction manual
2. I check Infra guides for platform patterns
3. I build it right here
4. I walk you through deployment

You supervise. I do the work. The spec ensures I build it right.

## Kit Structure

```
{KitName}/
├── {KitName}.md       # THE VERIFIED SPEC (always use this)
├── README.md          # Human description
├── demo/              # Reference implementation
└── experimental/      # Speculative versions being tested
```

**Always use `{KitName}.md`** - it's the verified version.
Experimental versions exist for testing, not for users.

## Infra Guides

Reusable patterns in `/Infra`:

| Guide | For |
|-------|-----|
| Cloudflare.md | Workers, D1, R2, Pages, Queues |
| Modal.md | GPU workloads, ML inference |
| Tinker.md | Model fine-tuning |
| ClaudeAgent.md | Multi-agent systems |

## Adding Kits

1. Create `{KitName}/` directory
2. Write `{KitName}.md` - the spec IS the product
3. Add to Available Kits table
4. Optionally: build demo/, add README.md

## Git Commits

No AI attribution.
