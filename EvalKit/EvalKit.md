# MOSSKits Eval v1

*Measuring how well AI coding tools build real infrastructure from specifications.*

---

## Overview

MOSSKits Eval is an open benchmark for evaluating AI coding assistants on their ability to build complete, working systems from markdown specifications.

Unlike existing code benchmarks that test isolated functions or bug fixes, MOSSKits Eval measures what developers actually need: **Can this tool take a spec and build production-quality infrastructure?**

### What We Measure

| Dimension | Question |
|-----------|----------|
| **Build Success** | Does the code compile and run? |
| **Feature Completeness** | Are all specified features implemented? |
| **Test Coverage** | Do the tests pass? |
| **Deployment** | Can it be deployed and accessed? |
| **Code Quality** | Is it secure, maintainable, well-structured? |
| **Efficiency** | How many tokens/interactions did it take? |

### Why This Matters

Current AI coding evals don't reflect real work:

| Eval | Tests | Limitation |
|------|-------|------------|
| HumanEval | Single functions | No system building |
| SWE-Bench | Bug fixes | No greenfield development |
| APPS | Competitive programming | No real infrastructure |
| BigCodeBench | API usage | Isolated tasks |

**MOSSKits Eval tests what developers do daily**: interpret a specification, make architectural decisions, coordinate multiple files, integrate external services, handle errors, and deploy working systems.

---

## Philosophy

### Specs Are the Interface

A MOSSKit specification is a natural language document describing what to build. It contains:
- Architecture overview
- Data models
- API endpoints
- UI requirements
- Deployment instructions

The spec is **deliberately incomplete**—it describes WHAT, not exactly HOW. A capable AI must:
1. Interpret intent correctly
2. Make reasonable architectural decisions
3. Fill in implementation details
4. Produce working code

### Complexity Is Multi-Dimensional

A "hard" kit isn't just more lines of code. Complexity comes from:
- Number of coordinating components
- External integrations
- Ambiguity in specifications
- Correctness requirements
- Deployment infrastructure

### Real Infrastructure, Not Toys

Every kit in the eval produces something deployable and useful:
- Actual databases with schemas
- Real API endpoints
- Working frontends
- Proper authentication
- Cloud deployment

If you wouldn't ship it, it's not in the eval.

### Agentic By Default

The eval assumes tools operate agentically:
- Reading and writing files
- Running terminal commands
- Iterating on errors
- Making decisions autonomously

Single-shot code generation tools can participate but will likely struggle on complex kits.

---

## Complexity Taxonomy

### The Six Dimensions

Each kit is scored on six complexity dimensions (1-10 each):

#### 1. Scope Complexity
How much code and how many files?

| Score | Files | LOC | Technologies |
|-------|-------|-----|--------------|
| 1-2 | 1-2 | <200 | 1 |
| 3-4 | 3-5 | 200-500 | 1-2 |
| 5-6 | 6-10 | 500-1000 | 2-3 |
| 7-8 | 11-20 | 1000-2000 | 3-4 |
| 9-10 | 20+ | 2000+ | 5+ |

#### 2. Integration Complexity
How many external systems must be coordinated?

| Score | External APIs | Auth | Data Flow |
|-------|---------------|------|-----------|
| 1-2 | None | None | Request/response |
| 3-4 | 1 simple | Basic tokens | Simple queues |
| 5-6 | 2-3 APIs | Sessions/JWT | Event-driven |
| 7-8 | 3-5 APIs | OAuth flows | Pub/sub patterns |
| 9-10 | 5+ APIs | Multi-provider | Complex orchestration |

#### 3. Specification Ambiguity
How much is left to interpretation?

| Score | Description |
|-------|-------------|
| 1-2 | Step-by-step instructions, explicit requirements |
| 3-4 | Clear goals, some implementation decisions |
| 5-6 | High-level architecture, significant decisions required |
| 7-8 | Conceptual description, architectural freedom |
| 9-10 | Problem statement only, full design required |

#### 4. Correctness Requirements
How strict are the requirements?

| Score | Type Safety | Error Handling | Security |
|-------|-------------|----------------|----------|
| 1-2 | Dynamic OK | Happy path | Basic |
| 3-4 | Some types | Common errors | Input validation |
| 5-6 | Full typing | Comprehensive | Auth required |
| 7-8 | Strict types | Edge cases | OWASP-aware |
| 9-10 | Type-driven | Fault tolerant | Security-critical |

#### 5. Infrastructure Complexity
How complex is the deployment?

| Score | Deployment | Config | Resources |
|-------|------------|--------|-----------|
| 1-2 | Local only | Hardcoded | Single process |
| 3-4 | Simple cloud | Env vars | Database |
| 5-6 | Multi-service | Config files | Queues/cache |
| 7-8 | Container orchestration | Secrets management | Distributed |
| 9-10 | Multi-region | Full IaC | Auto-scaling |

#### 6. Domain Knowledge
How specialized is the problem domain?

| Score | Domain |
|-------|--------|
| 1-2 | Generic programming (CRUD, utilities) |
| 3-4 | Common patterns (auth, file handling) |
| 5-6 | Specialized (payments, search) |
| 7-8 | Expert domain (ML, cryptography) |
| 9-10 | Cutting-edge (novel architectures) |

### Composite Complexity Score

```
Complexity Score = (Scope × 1.5 + Integration × 1.5 + Ambiguity × 1.0
                   + Correctness × 1.0 + Infrastructure × 1.0 + Domain × 1.0) / 7
```

Scope and Integration weighted higher as they most correlate with real-world difficulty.

---

## Kit Tiers

### Tier 1: Foundational (Complexity 1-25)

**Tests**: Basic code generation, simple file coordination, following explicit instructions.

**Characteristics**:
- 1-3 files
- Single language/framework
- No external integrations
- Explicit specifications
- ~100-300 LOC

**Reference Kits**:

| Kit | Description | Key Test |
|-----|-------------|----------|
| **EchoKit** | HTTP echo server | Basic API creation |
| **CounterKit** | Persistent counter | Database basics |
| **ConverterKit** | MD→HTML CLI | File I/O handling |

### Tier 2: Integrated (Complexity 26-50)

**Tests**: Multi-component coordination, basic integrations, architectural decisions.

**Characteristics**:
- 4-10 files
- 2-3 technologies
- 1-2 external integrations
- Some ambiguity in spec
- ~300-800 LOC

**Reference Kits**:

| Kit | Description | Key Test |
|-----|-------------|----------|
| **TodoKit** | Full CRUD + simple UI | Standard patterns |
| **WebhookKit** | Receive, queue, deliver | Async processing |
| **AuthKit** | Registration, login, sessions | Security patterns |

### Tier 3: Systems (Complexity 51-75)

**Tests**: Production-like systems, multiple integrations, real-time patterns, deployment.

**Characteristics**:
- 10-25 files
- 3-5 technologies
- Multiple integrations
- Significant architectural freedom
- ~800-2000 LOC

**Reference Kits**:

| Kit | Description | Key Test |
|-----|-------------|----------|
| **ChatKit** | Real-time chat rooms | WebSocket handling |
| **AnalyticsKit** | Event tracking + dashboard | Data pipelines |
| **WorkflowKit** | Multi-step automation | State machines |

### Tier 4: Production (Complexity 76-100)

**Tests**: Complex production systems, extensive integrations, autonomous operation, full deployment.

**Characteristics**:
- 25+ files
- 5+ technologies
- Many external APIs
- High ambiguity, domain expertise needed
- ~2000+ LOC

**Reference Kits**:

| Kit | Description | Key Test |
|-----|-------------|----------|
| **CloudKit** | Self-hosted file storage | Full-stack complexity |
| **PunditKit** | Prediction market agent | AI orchestration |
| **PlatformKit** | Multi-tenant SaaS | Enterprise patterns |

---

## Reference Kits

### Tier 1 Kits

#### EchoKit (Complexity: 12)

**Purpose**: Simplest possible API test. Can the tool create a working HTTP server?

**Specification Summary**:
- HTTP server on configurable port
- POST /echo returns request body
- GET /health returns 200 OK
- Proper error handling for malformed requests

**Complexity Breakdown**:
- Scope: 2 (1 file, ~50 LOC)
- Integration: 1 (none)
- Ambiguity: 1 (explicit)
- Correctness: 2 (basic errors)
- Infrastructure: 1 (local)
- Domain: 1 (generic)

**Test Suite**:
- `test_health_endpoint`: GET /health returns 200
- `test_echo_json`: POST JSON returns same JSON
- `test_echo_text`: POST text returns same text
- `test_echo_binary`: POST binary returns same binary
- `test_invalid_method`: Wrong method returns 405

---

#### CounterKit (Complexity: 18)

**Purpose**: Basic persistence test. Can the tool set up a database?

**Specification Summary**:
- Counter API with GET/POST/DELETE
- SQLite persistence
- Multiple named counters
- Atomic increment/decrement

**Complexity Breakdown**:
- Scope: 3 (2-3 files, ~150 LOC)
- Integration: 2 (database)
- Ambiguity: 2 (clear requirements)
- Correctness: 3 (atomic operations)
- Infrastructure: 2 (with persistence)
- Domain: 1 (generic)

**Test Suite**:
- `test_create_counter`: Creates new counter at 0
- `test_increment`: Increments correctly
- `test_decrement`: Decrements correctly
- `test_persistence`: Survives restart
- `test_multiple_counters`: Independent counters
- `test_concurrent_increments`: Atomic under load

---

#### ConverterKit (Complexity: 15)

**Purpose**: CLI and file handling test. Can the tool build command-line tools?

**Specification Summary**:
- CLI tool: `convert input.md output.html`
- Markdown to HTML conversion
- Support for common MD features
- Error messages for missing files

**Complexity Breakdown**:
- Scope: 2 (1-2 files, ~100 LOC)
- Integration: 1 (none)
- Ambiguity: 2 (clear features)
- Correctness: 3 (correct conversion)
- Infrastructure: 1 (local CLI)
- Domain: 2 (MD parsing)

**Test Suite**:
- `test_headings`: H1-H6 convert correctly
- `test_paragraphs`: Paragraphs wrapped in <p>
- `test_code_blocks`: Fenced code preserved
- `test_links`: Links convert to <a>
- `test_missing_file`: Proper error message
- `test_output_file`: Creates output correctly

---

### Tier 2 Kits

#### TodoKit (Complexity: 38)

**Purpose**: Standard CRUD test. The "hello world" of web apps.

**Specification Summary**:
- REST API for todos (CRUD)
- SQLite persistence
- Simple React frontend
- Filter by status (all/active/completed)
- Mark all complete, clear completed

**Complexity Breakdown**:
- Scope: 5 (6-8 files, ~500 LOC)
- Integration: 3 (frontend + backend + DB)
- Ambiguity: 4 (some design choices)
- Correctness: 4 (CRUD correctness)
- Infrastructure: 3 (full-stack local)
- Domain: 2 (common pattern)

**Test Suite**:
- `test_create_todo`: Creates with title
- `test_list_todos`: Returns all todos
- `test_update_todo`: Updates title/status
- `test_delete_todo`: Removes todo
- `test_filter_active`: Only incomplete
- `test_filter_completed`: Only complete
- `test_mark_all`: Batch completion
- `test_clear_completed`: Batch deletion
- `test_frontend_renders`: UI loads
- `test_frontend_creates`: Can add via UI

---

#### WebhookKit (Complexity: 42)

**Purpose**: Async processing test. Can the tool handle queues and retries?

**Specification Summary**:
- Receive webhooks at POST /hooks/:channel
- Queue for processing (SQLite-backed)
- Deliver to configured endpoints
- Retry with exponential backoff
- Dashboard showing delivery status

**Complexity Breakdown**:
- Scope: 5 (7-10 files, ~600 LOC)
- Integration: 5 (HTTP out, queue)
- Ambiguity: 4 (retry logic decisions)
- Correctness: 5 (delivery guarantees)
- Infrastructure: 4 (background processing)
- Domain: 3 (webhook patterns)

**Test Suite**:
- `test_receive_webhook`: Accepts and queues
- `test_delivery_success`: Delivers to endpoint
- `test_delivery_failure`: Queues for retry
- `test_exponential_backoff`: Correct delays
- `test_max_retries`: Gives up after N
- `test_dashboard_shows_status`: UI accuracy
- `test_concurrent_webhooks`: Handles load

---

#### AuthKit (Complexity: 45)

**Purpose**: Security patterns test. Can the tool implement auth correctly?

**Specification Summary**:
- User registration with email/password
- Login returns JWT
- Protected routes require valid JWT
- Password hashing (bcrypt)
- Token refresh mechanism

**Complexity Breakdown**:
- Scope: 5 (8-10 files, ~700 LOC)
- Integration: 4 (JWT, hashing)
- Ambiguity: 4 (security decisions)
- Correctness: 6 (security critical)
- Infrastructure: 3 (stateless auth)
- Domain: 4 (auth patterns)

**Test Suite**:
- `test_register_user`: Creates user
- `test_register_duplicate`: Rejects duplicate
- `test_password_hashed`: Not stored plaintext
- `test_login_success`: Returns JWT
- `test_login_failure`: Invalid credentials
- `test_protected_route`: Requires token
- `test_invalid_token`: Rejects bad tokens
- `test_token_refresh`: Extends session
- `test_password_requirements`: Enforces strength

---

### Tier 3 Kits

#### ChatKit (Complexity: 62)

**Purpose**: Real-time systems test. Can the tool handle WebSockets?

**Specification Summary**:
- WebSocket-based chat
- Multiple rooms
- User presence (online/offline)
- Message history (last 100)
- Typing indicators
- React frontend

**Complexity Breakdown**:
- Scope: 6 (12-15 files, ~1200 LOC)
- Integration: 6 (WebSocket, presence)
- Ambiguity: 5 (UX decisions)
- Correctness: 5 (message ordering)
- Infrastructure: 5 (real-time)
- Domain: 4 (chat patterns)

**Test Suite**:
- `test_connect`: WebSocket connects
- `test_join_room`: Enters room
- `test_send_message`: Delivers to room
- `test_message_history`: Returns recent
- `test_presence_join`: Shows online
- `test_presence_leave`: Shows offline
- `test_typing_indicator`: Broadcasts typing
- `test_multiple_rooms`: Isolated rooms
- `test_reconnection`: Handles disconnect

---

#### AnalyticsKit (Complexity: 68)

**Purpose**: Data pipeline test. Can the tool build event processing?

**Specification Summary**:
- Event ingestion API (high throughput)
- Batch processing to aggregates
- Time-series storage
- Dashboard with charts
- Retention policies

**Complexity Breakdown**:
- Scope: 7 (15-20 files, ~1500 LOC)
- Integration: 6 (batch processing)
- Ambiguity: 6 (aggregation decisions)
- Correctness: 6 (data accuracy)
- Infrastructure: 6 (pipeline)
- Domain: 5 (analytics)

**Test Suite**:
- `test_ingest_event`: Accepts events
- `test_batch_processing`: Aggregates correctly
- `test_time_bucketing`: Correct intervals
- `test_dashboard_data`: Accurate charts
- `test_high_throughput`: Handles load
- `test_retention`: Old data purged
- `test_query_performance`: Fast reads

---

#### WorkflowKit (Complexity: 65)

**Purpose**: Orchestration test. Can the tool build state machines?

**Specification Summary**:
- Define workflows as JSON
- Steps: HTTP calls, delays, conditions
- Execution tracking
- Failure handling and retries
- Workflow history and replay

**Complexity Breakdown**:
- Scope: 7 (15-18 files, ~1400 LOC)
- Integration: 7 (HTTP, scheduling)
- Ambiguity: 6 (execution semantics)
- Correctness: 7 (state consistency)
- Infrastructure: 5 (durable execution)
- Domain: 6 (workflow patterns)

**Test Suite**:
- `test_simple_workflow`: Linear execution
- `test_conditional_branch`: If/else logic
- `test_parallel_steps`: Concurrent execution
- `test_step_failure`: Error handling
- `test_retry_step`: Automatic retry
- `test_workflow_state`: Tracks progress
- `test_replay_workflow`: Idempotent replay

---

### Tier 4 Kits

#### CloudKit (Complexity: 82)

**Purpose**: Full-stack complexity test. Complete file storage system.

**Specification Summary**:
- File upload/download/delete
- Folder hierarchy
- Sharing with permissions
- Thumbnail generation
- Search across files
- Multi-platform sync client

**Complexity Breakdown**:
- Scope: 8 (25+ files, ~2500 LOC)
- Integration: 8 (storage, thumbnails, search)
- Ambiguity: 7 (many decisions)
- Correctness: 7 (file integrity)
- Infrastructure: 8 (cloud deployment)
- Domain: 6 (storage systems)

*Full specification available at MOSSKits/CloudKit/CloudKit.md*

---

#### PunditKit (Complexity: 88)

**Purpose**: AI orchestration test. Autonomous agent system.

**Specification Summary**:
- Prediction market research agent
- Multi-technique research (Gemini Deep Research)
- Alpha-seeking evaluation (Claude)
- Multi-platform market discovery
- Learning system with calibration
- Autonomous scheduling

**Complexity Breakdown**:
- Scope: 9 (30+ files, ~3000 LOC)
- Integration: 9 (multiple AI APIs, platforms)
- Ambiguity: 8 (evaluation philosophy)
- Correctness: 7 (calibration)
- Infrastructure: 8 (workers, queues, cron)
- Domain: 8 (prediction markets)

*Full specification available at MOSSKits/PunditKit/PunditKit.v1.5.md*

---

#### PlatformKit (Complexity: 92)

**Purpose**: Enterprise patterns test. Multi-tenant SaaS.

**Specification Summary**:
- Multi-tenant data isolation
- Role-based access control
- Billing integration (Stripe)
- Team management
- Audit logging
- Admin dashboard

**Complexity Breakdown**:
- Scope: 10 (40+ files, ~4000 LOC)
- Integration: 10 (Stripe, email, analytics)
- Ambiguity: 8 (business logic)
- Correctness: 9 (tenant isolation)
- Infrastructure: 9 (production SaaS)
- Domain: 8 (SaaS patterns)

*Full specification to be developed*

---

## Evaluation Criteria

### Primary Metrics

#### 1. Build Success (0-100)

Does the code compile/run without errors?

| Score | Criteria |
|-------|----------|
| 0 | No code produced or completely broken |
| 25 | Some files created but won't run |
| 50 | Runs with errors or missing features |
| 75 | Runs with minor issues |
| 100 | Builds and runs cleanly |

**Measurement**: Automated build script returns exit code.

---

#### 2. Test Pass Rate (0-100)

What percentage of the test suite passes?

```
Test Pass Rate = (Passed Tests / Total Tests) × 100
```

Each kit has a test suite with:
- **Basic tests** (60%): Core functionality
- **Advanced tests** (30%): Edge cases, performance
- **Stretch tests** (10%): Beyond spec, best practices

**Measurement**: Test runner reports pass/fail counts.

---

#### 3. Feature Completeness (0-100)

Are all specified features implemented?

Each kit has a feature checklist derived from the spec. Features are weighted:
- **Critical** (weight 3): Core functionality
- **Important** (weight 2): Expected features
- **Nice-to-have** (weight 1): Polish features

```
Feature Score = Σ(implemented × weight) / Σ(weight) × 100
```

**Measurement**: Automated feature detection + manual review.

---

#### 4. Deployment Success (0-100)

Can it be deployed and accessed?

| Score | Criteria |
|-------|----------|
| 0 | Cannot deploy |
| 50 | Deploys but not accessible |
| 75 | Accessible with issues |
| 100 | Fully deployed and functional |

**Measurement**: Automated deployment script + health checks.

---

#### 5. Code Quality (0-100)

Is the code secure, maintainable, well-structured?

Sub-scores:
- **Linting** (25): Passes configured linter
- **Security** (25): No critical vulnerabilities (Snyk/Semgrep)
- **Structure** (25): Reasonable file organization
- **Types** (25): Type coverage (if applicable)

**Measurement**: Automated tools + rubric-based review.

---

#### 6. Efficiency (0-100)

How efficiently did the tool complete the task?

Sub-scores:
- **Token usage** (40): Compared to baseline (lower = better)
- **Interaction count** (30): Fewer interactions = better
- **Human interventions** (20): Zero = best
- **Wall time** (10): Faster = better

```
Token Efficiency = max(0, 100 - (actual_tokens / baseline_tokens - 1) × 100)
```

**Measurement**: Instrumented harness captures all interactions.

---

### Secondary Metrics (Qualitative)

These provide additional insight but don't affect the primary score:

- **Error Recovery**: How well does it debug and fix issues?
- **Clarification Requests**: Does it ask good questions?
- **Over-engineering**: Does it add unnecessary complexity?
- **Under-engineering**: Does it cut corners inappropriately?
- **Documentation**: Are comments and READMEs helpful?

---

## Scoring System

### Per-Kit Score

```
Kit Score = (Build × 0.20) + (Tests × 0.30) + (Features × 0.25)
          + (Deploy × 0.10) + (Quality × 0.10) + (Efficiency × 0.05)
```

Weights reflect importance:
- Tests (30%): Most objective measure of correctness
- Features (25%): Did it do what was asked?
- Build (20%): Must run at all
- Deploy/Quality/Efficiency: Important but secondary

### Per-Tier Score

Average of all kit scores within the tier.

```
Tier Score = Σ(Kit Scores in Tier) / Kit Count
```

### Overall Score

Weighted average across tiers (higher tiers weighted more):

```
Overall = (Tier1 × 0.10) + (Tier2 × 0.20) + (Tier3 × 0.30) + (Tier4 × 0.40)
```

Rationale: Tier 4 kits represent real production work. A tool that excels at Tier 1 but fails Tier 4 isn't production-ready.

### Confidence Intervals

Each score includes confidence based on:
- Number of runs averaged
- Variance across runs
- Manual verification percentage

```
Score: 72.5 ± 3.2 (95% CI, n=5 runs)
```

---

## Test Harness

### Environment

Each eval run uses a standardized environment:

```yaml
# eval-environment.yaml
base_image: ubuntu:22.04
tools:
  - node: 20.x
  - python: 3.11
  - go: 1.21
  - rust: 1.75
  - docker: 24.x
  - wrangler: latest
resources:
  cpu: 4 cores
  memory: 16GB
  disk: 50GB
  network: full internet access
timeout:
  tier1: 30 minutes
  tier2: 60 minutes
  tier3: 120 minutes
  tier4: 240 minutes
```

### Input Protocol

1. **Fresh directory** with kit spec only
2. **Initial prompt**: "Build this system according to the specification."
3. **Tool access**: File system, terminal, browser (if tool supports)

### Capture Protocol

The harness captures:

```typescript
interface EvalRun {
  // Metadata
  tool: string;              // "claude-code", "cursor", "gpt-codex"
  tool_version: string;
  kit: string;
  run_id: string;
  timestamp: string;

  // Interactions
  interactions: Interaction[];
  total_tokens: number;
  input_tokens: number;
  output_tokens: number;

  // Timing
  start_time: string;
  end_time: string;
  wall_time_seconds: number;

  // Human interventions
  interventions: Intervention[];

  // Results
  build_success: boolean;
  build_log: string;
  test_results: TestResult[];
  feature_checklist: FeatureCheck[];
  deployment_result: DeploymentResult;
  quality_scores: QualityScores;

  // Final artifacts
  files_created: string[];
  final_state_hash: string;
}

interface Interaction {
  timestamp: string;
  type: 'user' | 'assistant' | 'tool_use' | 'tool_result';
  content: string;
  tokens: number;
}

interface Intervention {
  timestamp: string;
  type: 'error_hint' | 'clarification' | 'restart' | 'manual_fix';
  description: string;
}
```

### Validation Pipeline

After the tool declares completion:

```bash
# 1. Build check
./eval/scripts/build.sh $KIT_DIR
# Exit code: 0 = success, 1 = failure

# 2. Test suite
./eval/scripts/test.sh $KIT_DIR
# Output: JSON with pass/fail per test

# 3. Feature verification
./eval/scripts/features.sh $KIT_DIR
# Output: JSON with feature checklist

# 4. Deployment attempt
./eval/scripts/deploy.sh $KIT_DIR
# Output: Deployment URL or error

# 5. Quality scan
./eval/scripts/quality.sh $KIT_DIR
# Output: Linting, security, structure scores

# 6. Score calculation
./eval/scripts/score.sh $KIT_DIR
# Output: Final scores JSON
```

### Intervention Rules

Interventions are allowed but penalize efficiency:

| Intervention Type | Penalty |
|-------------------|---------|
| Error hint | -5 efficiency points |
| Clarification | -2 efficiency points |
| Manual restart | -10 efficiency points |
| Manual code fix | Disqualifies that feature |

Maximum 5 interventions per kit. After 5, the run is marked incomplete.

---

## Leaderboard

### Display Format

```
╔══════════════════════════════════════════════════════════════════════════════╗
║                        MOSSKits Eval Leaderboard v1                          ║
║                           Last Updated: 2025-01-15                           ║
╠══════════════════════════════════════════════════════════════════════════════╣
║  Rank │ Tool              │ Overall │ Tier 1 │ Tier 2 │ Tier 3 │ Tier 4     ║
╠══════════════════════════════════════════════════════════════════════════════╣
║   1   │ Claude Code       │  78.4   │  94.2  │  86.7  │  74.3  │  68.1      ║
║   2   │ Cursor            │  74.2   │  92.8  │  84.1  │  71.8  │  62.4      ║
║   3   │ GPT-5 Codex       │  71.8   │  91.5  │  82.3  │  68.2  │  59.7      ║
║   4   │ Gemini Code       │  68.9   │  89.2  │  79.8  │  65.4  │  55.2      ║
║   5   │ Windsurf          │  65.3   │  88.4  │  76.2  │  61.8  │  50.8      ║
║   6   │ Amp               │  62.1   │  86.7  │  73.5  │  58.3  │  47.2      ║
╚══════════════════════════════════════════════════════════════════════════════╝
```

### Detailed View (Per Tool)

```
╔══════════════════════════════════════════════════════════════════════════════╗
║  Claude Code - Detailed Results                                              ║
╠══════════════════════════════════════════════════════════════════════════════╣
║  Overall Score: 78.4 ± 2.1 (95% CI, n=5)                                     ║
╠══════════════════════════════════════════════════════════════════════════════╣
║  Tier 1 (94.2)          │ Build │ Tests │ Features │ Deploy │ Quality │ Eff ║
║  ├─ EchoKit             │  100  │  100  │   100    │  100   │   92    │ 88  ║
║  ├─ CounterKit          │  100  │   95  │   100    │  100   │   88    │ 82  ║
║  └─ ConverterKit        │  100  │   92  │    95    │  100   │   85    │ 79  ║
╠══════════════════════════════════════════════════════════════════════════════╣
║  Tier 2 (86.7)          │ Build │ Tests │ Features │ Deploy │ Quality │ Eff ║
║  ├─ TodoKit             │  100  │   88  │    92    │  100   │   82    │ 75  ║
║  ├─ WebhookKit          │  100  │   85  │    88    │   95   │   78    │ 70  ║
║  └─ AuthKit             │  100  │   82  │    85    │  100   │   80    │ 68  ║
╠══════════════════════════════════════════════════════════════════════════════╣
║  Tier 3 (74.3)          │ Build │ Tests │ Features │ Deploy │ Quality │ Eff ║
║  ├─ ChatKit             │   95  │   78  │    80    │   90   │   72    │ 62  ║
║  ├─ AnalyticsKit        │   90  │   72  │    75    │   85   │   68    │ 58  ║
║  └─ WorkflowKit         │   85  │   70  │    72    │   80   │   65    │ 55  ║
╠══════════════════════════════════════════════════════════════════════════════╣
║  Tier 4 (68.1)          │ Build │ Tests │ Features │ Deploy │ Quality │ Eff ║
║  ├─ CloudKit            │   85  │   68  │    70    │   75   │   62    │ 48  ║
║  ├─ PunditKit           │   80  │   62  │    65    │   70   │   58    │ 42  ║
║  └─ PlatformKit         │   75  │   55  │    58    │   65   │   52    │ 38  ║
╚══════════════════════════════════════════════════════════════════════════════╝
```

### Trend View

Track improvement over time:

```
Claude Code Score Trend
100 │
 90 │     ╭───────────────────────╮     Tier 1
 80 │  ╭──╯                       │
 70 │  │      ╭─────────────────────    Tier 2
 60 │  │  ╭───╯
 50 │  │  │     ╭─────────────────      Tier 3
 40 │  ╭──╯ ╭───╯
 30 │──╯────╯        ╭──────────────    Tier 4
 20 │
    └────────────────────────────────
     Jan  Feb  Mar  Apr  May  Jun  2025
```

---

## Running the Eval

### For Tool Vendors

```bash
# 1. Clone the eval repo
git clone https://github.com/mosskits/eval.git
cd eval

# 2. Configure your tool
cp config/tool-template.yaml config/my-tool.yaml
# Edit with your tool's configuration

# 3. Run full eval
./run-eval.sh --tool my-tool --all-tiers

# 4. Run specific tier
./run-eval.sh --tool my-tool --tier 2

# 5. Run specific kit
./run-eval.sh --tool my-tool --kit TodoKit

# 6. Submit results
./submit-results.sh --run-id <run-id>
```

### For Researchers

```bash
# Compare multiple tools on a kit
./compare.sh --kit PunditKit --tools "claude-code,cursor,gpt-codex"

# Analyze failure patterns
./analyze-failures.sh --tool gpt-codex --tier 4

# Generate report
./report.sh --format pdf --output eval-report.pdf
```

### CI/CD Integration

```yaml
# .github/workflows/mosskit-eval.yml
name: MOSSKits Eval
on:
  schedule:
    - cron: '0 0 * * 0'  # Weekly
  workflow_dispatch:

jobs:
  eval:
    runs-on: ubuntu-latest
    steps:
      - uses: mosskits/eval-action@v1
        with:
          tool: ${{ secrets.TOOL_NAME }}
          api_key: ${{ secrets.TOOL_API_KEY }}
          tiers: '1,2,3,4'
      - uses: mosskits/submit-action@v1
        with:
          results: ./eval-results.json
```

---

## Contributing

### Adding a Kit

1. **Write the specification** following the MOSSKit pattern
2. **Create the test suite** with tiered tests
3. **Define the feature checklist** with weights
4. **Establish baselines** by running with multiple tools
5. **Submit PR** to the eval repo

Requirements for new kits:
- Clear tier assignment with complexity scoring
- Minimum 10 tests
- Documented feature checklist
- At least 3 baseline runs
- No data leakage (don't use examples from training data)

### Running Official Evals

To submit results to the official leaderboard:

1. Run eval with `--official` flag
2. Results are cryptographically signed
3. Submit via `./submit-results.sh`
4. Results verified by maintainers
5. Published after verification

### Disputing Results

If you believe your tool was scored unfairly:

1. Open issue with run ID and concern
2. Maintainers review the run logs
3. If valid, results are re-run or corrected
4. Policy updates to prevent recurrence

---

## Data Integrity

### Anti-Gaming Measures

1. **Kit Rotation**: New kits added quarterly, old kits retired
2. **Spec Variants**: Multiple versions of each kit with different details
3. **Hidden Tests**: 20% of tests not publicly documented
4. **Manual Verification**: Random sample of runs manually reviewed
5. **Anomaly Detection**: Suspiciously high scores flagged for review

### Reproducibility

All runs are:
- Fully logged (interactions, timing, artifacts)
- Hash-verified (final state matches submitted)
- Environment-locked (exact versions recorded)
- Repeat-testable (can re-run any submission)

---

## FAQ

### Q: How is this different from SWE-Bench?

SWE-Bench tests bug fixes in existing codebases. MOSSKits Eval tests building new systems from specifications. Both are valuable; they measure different capabilities.

### Q: What if my tool doesn't support agentic operation?

Tools can still participate. Single-shot tools will likely score well on Tier 1, struggle on higher tiers. The eval measures real capability, including the ability to iterate.

### Q: How do you prevent tools from memorizing kits?

1. Kits are rotated regularly
2. Spec variants change details while testing same concepts
3. Hidden tests catch rote memorization
4. Complex kits require genuine understanding

### Q: Can I run the eval on my own infrastructure?

Yes. The harness is fully open source. Official leaderboard submissions require using the standard harness with verification.

### Q: How often is the leaderboard updated?

Weekly for official submissions. Tools can run unofficial evals anytime.

### Q: What's the baseline for efficiency scoring?

Baselines are established by averaging performance across multiple tools when a kit is first added. Updated quarterly.

---

## Roadmap

### v1.0 (Current)
- [x] 12 reference kits across 4 tiers
- [x] Core evaluation metrics
- [x] Test harness
- [x] Leaderboard format

### v1.1
- [ ] Additional kits (15 → 20)
- [ ] Multi-language kit variants
- [ ] Improved efficiency metrics
- [ ] Automated anomaly detection

### v2.0
- [ ] Interactive kits (human-in-loop testing)
- [ ] Multi-agent kit collaboration
- [ ] Real deployment testing (not just local)
- [ ] Cost efficiency metrics ($/kit)

---

## License

MIT — The eval framework is open source. Kits may have their own licenses.

---

## Acknowledgments

Inspired by:
- HumanEval (OpenAI)
- SWE-Bench (Princeton NLP)
- BigCodeBench (BigCode)
- The belief that AI coding tools should be measured on real work

---

*Measure what matters. Build real infrastructure. Ship production systems.*
