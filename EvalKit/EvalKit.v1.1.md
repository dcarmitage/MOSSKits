# MOSSKits Eval v1.1

*Can this AI coding tool build real infrastructure from a spec?*

---

## The Question

Current AI coding benchmarks test the wrong things:

| Benchmark | Tests | Reality Gap |
|-----------|-------|-------------|
| HumanEval | Single functions | Devs build systems, not functions |
| SWE-Bench | Bug fixes | Devs also build new things |
| APPS | Algorithms | Devs rarely write algorithms |

**MOSSKits Eval tests what matters**: Give an AI a markdown specification. Does it produce working, deployable infrastructure?

---

## How It Works

```
┌─────────────────────────────────────────────────────────────────┐
│  1. SPEC                    2. BUILD                 3. SCORE   │
│  ┌─────────────┐           ┌─────────────┐         ┌─────────┐ │
│  │ TodoKit.md  │  ──────►  │  AI Tool    │  ────►  │ Pass/   │ │
│  │             │   "build  │  (Claude,   │  tests  │ Fail +  │ │
│  │ • API       │    this"  │   Cursor,   │  run    │ Quality │ │
│  │ • DB        │           │   etc.)     │         │ Score   │ │
│  │ • UI        │           │             │         │         │ │
│  └─────────────┘           └─────────────┘         └─────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

1. **Spec** — Markdown file describing what to build
2. **Build** — AI tool attempts to build it (agentic, can iterate)
3. **Score** — Automated tests determine pass/fail + quality metrics

---

## Kits

### Tier System

| Tier | Complexity | What It Tests | Example |
|------|------------|---------------|---------|
| **1** | Simple | Can it follow instructions? | EchoKit: HTTP server |
| **2** | Integrated | Can it coordinate components? | TodoKit: CRUD + UI |
| **3** | Systems | Can it build production patterns? | ChatKit: Real-time |
| **4** | Production | Can it ship real infrastructure? | PunditKit: AI agent |

### Starter Kits

**Tier 1: EchoKit** (Complexity: 12)
- Build an HTTP echo server
- 1-2 files, ~50 LOC
- Tests: health endpoint, echo JSON, echo text

**Tier 2: TodoKit** (Complexity: 38)
- Full CRUD API + simple React UI
- 6-8 files, ~500 LOC
- Tests: create, read, update, delete, filter, UI renders

**Tier 3: ChatKit** (Complexity: 62)
- WebSocket chat with rooms and presence
- 12-15 files, ~1200 LOC
- Tests: connect, send, receive, presence, history

**Tier 4: PunditKit** (Complexity: 88)
- Prediction market research agent
- 30+ files, ~3000 LOC
- Tests: market sync, research, evaluation, scheduling

---

## Scoring

### Primary Metric: Pass Rate

For each kit, a tool either **passes** or **fails** based on:
1. Does it build without errors?
2. Do the core tests pass?
3. Can it be deployed?

```
Pass Rate = Passed Kits / Total Kits
```

### Statistical Rigor

Following [Anthropic's research on model evals](https://www.anthropic.com/research/statistical-approach-to-model-evals), we report confidence intervals:

```
Score: 75% ± 8% (95% CI, n=12 kits, 3 runs each)
```

**Key principles applied:**

1. **Standard Error of Mean (SEM)** — Each kit run is a sample. We report uncertainty, not just point estimates.

2. **Paired Comparisons** — When comparing tools, we use paired-difference analysis since both tools attempt identical kits. This reduces variance and produces tighter confidence intervals.

3. **Multiple Runs** — Each kit is attempted multiple times (default: 3) to account for non-determinism in AI outputs.

### Quality Score (Secondary)

Beyond pass/fail, we measure quality on a 0-100 scale:

| Component | Weight | Measures |
|-----------|--------|----------|
| **Tests** | 50% | % of test suite passing |
| **Features** | 30% | % of specified features implemented |
| **Code Quality** | 20% | Linting, types, structure |

---

## Running Evals

### With Claude Agent SDK

```python
from claude_agent_sdk import query, ClaudeAgentOptions
from evalkit import EvalRunner, Kit

async def run_eval(kit: Kit) -> EvalResult:
    """Run a single kit evaluation."""

    options = ClaudeAgentOptions(
        system_prompt="Build this system according to the specification.",
        allowed_tools=["Read", "Write", "Edit", "Bash", "Glob", "Grep"],
        permission_mode="acceptEdits",
        cwd=kit.workspace,
        max_turns=100,
    )

    # Feed the spec to the AI
    async for message in query(
        prompt=f"Build this:\n\n{kit.spec_content}",
        options=options
    ):
        await log_interaction(message)

    # Run validation
    return await validate_build(kit)
```

### CLI

```bash
# Run full eval
evalkit run --tool claude-code --all

# Run specific tier
evalkit run --tool cursor --tier 2

# Run specific kit
evalkit run --tool gpt-codex --kit TodoKit

# Compare tools
evalkit compare --tools "claude-code,cursor" --tier 2
```

---

## Architecture (Cloudflare)

```
┌─────────────────────────────────────────────────────────────────┐
│                      mosskits.com/eval                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐              │
│  │   Pages     │  │   Worker    │  │     D1      │              │
│  │  Dashboard  │  │    API      │  │   Results   │              │
│  │             │  │             │  │             │              │
│  │ • Leader-   │  │ • Submit    │  │ • Runs      │              │
│  │   board     │  │ • Query     │  │ • Scores    │              │
│  │ • Kit info  │  │ • Validate  │  │ • Stats     │              │
│  └─────────────┘  └─────────────┘  └─────────────┘              │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Schema

```sql
CREATE TABLE runs (
  id TEXT PRIMARY KEY,
  tool TEXT NOT NULL,
  tool_version TEXT,
  kit TEXT NOT NULL,
  tier INTEGER NOT NULL,
  passed BOOLEAN NOT NULL,
  quality_score INTEGER,
  test_pass_rate REAL,
  feature_completeness REAL,
  tokens_used INTEGER,
  wall_time_seconds INTEGER,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE leaderboard (
  tool TEXT PRIMARY KEY,
  pass_rate REAL NOT NULL,
  pass_rate_sem REAL,          -- Standard error of mean
  quality_avg REAL,
  tier1_pass REAL,
  tier2_pass REAL,
  tier3_pass REAL,
  tier4_pass REAL,
  run_count INTEGER,
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX idx_runs_tool ON runs(tool);
CREATE INDEX idx_runs_kit ON runs(kit);
```

### API Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/eval/leaderboard` | GET | Get current rankings |
| `/eval/runs` | GET | List runs (filterable) |
| `/eval/runs` | POST | Submit new run result |
| `/eval/kits` | GET | List available kits |
| `/eval/kits/:id` | GET | Get kit details + spec |
| `/eval/compare` | GET | Compare two tools |

---

## Leaderboard

```
╔═══════════════════════════════════════════════════════════════════╗
║  MOSSKits Eval Leaderboard                    Updated: 2025-01-15 ║
╠═══════════════════════════════════════════════════════════════════╣
║  #  │ Tool           │ Pass Rate     │ T1  │ T2  │ T3  │ T4      ║
╠═══════════════════════════════════════════════════════════════════╣
║  1  │ Claude Code    │ 83% ± 6%      │ 100 │ 92  │ 75  │ 67      ║
║  2  │ Cursor         │ 75% ± 7%      │ 100 │ 83  │ 67  │ 50      ║
║  3  │ GPT-5 Codex    │ 71% ± 8%      │ 100 │ 75  │ 58  │ 50      ║
║  4  │ Windsurf       │ 62% ± 9%      │ 92  │ 67  │ 50  │ 42      ║
╚═══════════════════════════════════════════════════════════════════╝
```

**What the confidence intervals tell you**: Claude Code's 83% ± 6% means we're 95% confident its true pass rate is between 77% and 89%. If another tool shows 75% ± 7%, the ranges overlap—we can't claim a significant difference without more data.

---

## Contributing

### Adding a Kit

1. Write `spec.md` following MOSSKit patterns
2. Create test suite (minimum 5 tests)
3. Define pass criteria
4. Submit PR with 3 baseline runs

### Running Official Submissions

```bash
# Generate signed result
evalkit run --tool my-tool --official --sign

# Submit to leaderboard
evalkit submit --result ./result.json
```

---

## Design Principles

### From the Research

**Modal's LLM Almanac** [[1]](https://modal.com/llm-almanac/summary) [[2]](https://modal.com/llm-almanac/how-to-benchmark):
- Test workload-specific, not generic capabilities
- Match benchmarks to production patterns
- Start simple, establish baselines first

**Anthropic's Statistical Approach** [[3]](https://www.anthropic.com/research/statistical-approach-to-model-evals):
- Report confidence intervals, not just scores
- Use paired comparisons when comparing models
- Clustered standard errors can be 3x larger than naive estimates

**Maia et al. on LLM Evals** [[4]](https://arxiv.org/abs/2411.00640):
- Treat eval questions as samples from a population
- Quantify uncertainty with error bars
- Apply formal experimental design

### Applied Here

1. **Workload-specific**: We test building infrastructure, because that's what developers do
2. **Confidence intervals**: Every score includes uncertainty bounds
3. **Paired comparisons**: Tool comparisons use the same kits, reducing variance
4. **Simple first**: Start with pass/fail, add quality metrics as secondary

---

## Why This Matters for MOSSKits

The eval serves the MOSSKit mission:

1. **Validates specs** — If no tool can build a kit, the spec needs work
2. **Guides users** — "Use Claude Code for Tier 4 kits, anything works for Tier 1"
3. **Attracts contributors** — Clear benchmark = clear contribution opportunity
4. **Improves tools** — Vendors want to score well on real-world tasks

---

## References

1. Modal Labs. "LLM Inference Engine Summary." *Modal LLM Almanac*, 2024. https://modal.com/llm-almanac/summary

2. Modal Labs. "How to Benchmark LLM Inference." *Modal LLM Almanac*, 2024. https://modal.com/llm-almanac/how-to-benchmark

3. Anthropic. "A Statistical Approach to Model Evaluations." *Anthropic Research*, 2024. https://www.anthropic.com/research/statistical-approach-to-model-evals

4. Maia, Arthur. "Statistical Methods for LLM Evaluations." *arXiv:2411.00640*, 2024. https://arxiv.org/abs/2411.00640

---

*Simple question. Rigorous answer. Build real things.*
