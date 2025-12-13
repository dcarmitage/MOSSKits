# MOSSKits

**You don't code. Your AI does. MOSSKits tells it what to build.**

Fork this repo. Open in any AI coding tool. Say "build CloudKit". Watch it build.

---

## Quick Start

1. **Fork** this repo
2. **Open** in Claude Code, Cursor, Windsurf, or any AI coding tool
3. **Say:** "build CloudKit" (or any kit name)
4. **Watch** your AI build while you supervise
5. **Deploy** with guided help

That's it. No coding required.

---

## Available Kits

| Kit | What You Get | Platform | Spec |
|-----|--------------|----------|------|
| **CloudKit** | Self-hosted iCloud — file storage, transcription, AI search | Cloudflare | [CloudKit.md](./CloudKit/CloudKit.md) |
| **PunditKit** | Prediction market research agent | Cloudflare | [PunditKit.md](./PunditKit/PunditKit.md) |
| **PhysicsKit** | Multi-body physics simulation | Browser | [PhysicsKit.md](./PhysicsKit/PhysicsKit.md) |
| **EvalKit** | Benchmark for AI coding tools | Meta | [EvalKit.md](./EvalKit/EvalKit.md) |

---

## How It Works

Each kit has a **spec file** — a detailed markdown document that tells your AI exactly what to build.

```
CloudKit/
├── CloudKit.md        # The spec (your AI reads this)
├── README.md          # Human description
└── demo/              # Reference implementation
```

The spec includes architecture, data models, API endpoints, UI patterns — everything needed to build production software.

Your AI reads the spec. You supervise. You end up with working software.

---

## Who Is This For?

**Beginners:** No coding experience needed. Just tell your AI what to build and help with deployment.

**Experts:** Skip the boilerplate. Get a complete architecture in minutes. Customize from there.

---

## Infra Guides

Platform-specific patterns your AI uses while building:

| Guide | For |
|-------|-----|
| [Cloudflare.md](./Infra/Cloudflare.md) | Workers, D1, R2, Pages, Queues |
| [Modal.md](./Infra/Modal.md) | GPU workloads, ML inference |
| [Tinker.md](./Infra/Tinker.md) | Model fine-tuning |
| [ClaudeAgent.md](./Infra/ClaudeAgent.md) | Multi-agent systems |

---

## License

MIT. Build whatever you want — commercial or personal.

---

**[mosskits.com](https://mosskits.com)**
