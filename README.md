# MOSSKits

**Massive Open Source Software Kits**

Specifications and reference implementations for building your own infrastructure.

---

## Kits

| Kit | Description |
|-----|-------------|
| [CloudKit](./CloudKit/CloudKit.md) | Self-hosted iCloud on Cloudflare |
| [PhysicsKit](./PhysicsKit/PhysicsKit.md) | Multi-body physics with non-linear tire simulation |

---

## Structure

Each kit follows a **spec-first** structure:

```
KitName/
├── KitName.md   # Specification (the product)
└── demo/        # Reference implementation
```

The markdown specification is the primary artifact. The `demo/` folder contains working code that implements the spec.

---

## Quick Start

### CloudKit

```bash
cd CloudKit/demo
npx wrangler login
./deploy.sh
```

### PhysicsKit

```bash
cd PhysicsKit/demo
pip install -e ".[all]"
python -m physicskit drift
```

---

## License

MIT

---

**[MOSS](https://mosskits.com)** - Build anything.
