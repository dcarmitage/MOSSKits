# MOSSKits

**Massive Open Source Software Kits**

Spec-first reference implementations you can drop into any AI coding tool to build real infrastructure.

**[mosskits.com](https://mosskits.com)**

---

## How It Works

1. Browse the kits below
2. Click the demo to see it in action
3. Download the `.md` spec file
4. Type "build this" in your AI coding assistant
5. Get a working implementation

---

## Recently Updated

| Kit | Last Update | What Changed |
|-----|-------------|--------------|
| CloudKit | Dec 10, 2025 | Initial release |
| PhysicsKit | Dec 10, 2025 | Initial release |

---

## Kit Showcase

### CloudKit

**Self-hosted iCloud on Cloudflare**

Upload audio → Get transcripts → AI summaries → Smart search. All on your own infrastructure.

| | |
|---|---|
| **Spec** | [CloudKit.md](./CloudKit/CloudKit.md) |
| **Demo** | [Try it](./CloudKit/demo/) |
| **Stack** | Cloudflare Workers, D1, R2, React, Hono |

---

### PhysicsKit

**Multi-body physics with non-linear tire simulation**

Pacejka Magic Formula tire model, vehicle dynamics, drift simulation with real-time visualization.

| | |
|---|---|
| **Spec** | [PhysicsKit.md](./PhysicsKit/PhysicsKit.md) |
| **Demo** | [Try it](./PhysicsKit/demo/) |
| **Stack** | Python, NumPy, Pygame |

---

## Kit Structure

Every kit follows the same pattern:

```
KitName/
├── KitName.md   # The spec (THIS IS THE PRODUCT)
└── demo/        # Reference implementation
```

The markdown specification is the primary artifact. Download it, feed it to your AI coding tool, and build.

---

## License

MIT

---

**[MOSS](https://mosskits.com)** - Build anything.
