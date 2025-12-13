What Makes This Different

  | Existing Evals               | MOSSKits Eval           |
  |------------------------------|-------------------------|
  | Single functions (HumanEval) | Complete systems        |
  | Bug fixes (SWE-Bench)        | Greenfield development  |
  | Algorithmic puzzles (APPS)   | Real infrastructure     |
  | Isolated tasks               | Multi-file coordination |

  Core insight: Current evals don't measure what developers actually need - the ability to take a spec and build production infrastructure.

  The Six Complexity Dimensions

  | Dimension      | What It Measures                  |
  |----------------|-----------------------------------|
  | Scope          | Files, LOC, technologies          |
  | Integration    | External APIs, auth, data flow    |
  | Ambiguity      | How much interpretation required  |
  | Correctness    | Type safety, security, edge cases |
  | Infrastructure | Deployment complexity             |
  | Domain         | Specialized knowledge required    |

  Four Tiers of Difficulty

  | Tier                 | Complexity | Example Kits                       |
  |----------------------|------------|------------------------------------|
  | Tier 1: Foundational | 1-25       | EchoKit, CounterKit, ConverterKit  |
  | Tier 2: Integrated   | 26-50      | TodoKit, WebhookKit, AuthKit       |
  | Tier 3: Systems      | 51-75      | ChatKit, AnalyticsKit, WorkflowKit |
  | Tier 4: Production   | 76-100     | CloudKit, PunditKit, PlatformKit   |

  Scoring System

  Per-Kit Score (weighted):
  - Tests: 30% (most objective)
  - Features: 25% (did it do what was asked?)
  - Build: 20% (must run)
  - Deploy: 10%
  - Quality: 10%
  - Efficiency: 5%

  Overall Score (tier-weighted):
  - Tier 4 counts 40% (represents real production work)
  - Tier 3 counts 30%
  - Tier 2 counts 20%
  - Tier 1 counts 10%

  Why Tool Vendors Will Care

  1. Credibility - "We score 82 on MOSSKits" means something
  2. Differentiation - Shows where tools excel (Tier 4 vs Tier 1)
  3. Progress tracking - Leaderboard shows improvement over time
  4. Real-world relevance - Tests actual developer workflows

  Anti-Gaming Measures

  - Kit rotation (new kits quarterly)
  - Spec variants (same concept, different details)
  - Hidden tests (20% not public)
  - Manual verification (random sampling)
  - Anomaly detection

  The eval is designed to be fair, reproducible, and resistant to gaming while measuring genuinely useful capabilities.