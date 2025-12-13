# CLAUDE.md - MOSSKits Eval

This file guides AI coding assistants in building the MOSSKits Eval system from scratch.

## What is MOSSKits Eval?

An open benchmark measuring how well AI coding tools build real infrastructure from markdown specifications. Unlike HumanEval (single functions) or SWE-Bench (bug fixes), this tests **complete system building** from specs.

**The pitch**: Tool vendors want to score well on this eval because it measures what developers actually need.

## Project Structure

```
EvalKit/
├── CLAUDE.md                    # This file
├── EvalKit.md                   # Full specification (reference)
├── packages/
│   ├── harness/                 # Test harness (runs evals)
│   │   ├── src/
│   │   │   ├── index.ts         # CLI entry point
│   │   │   ├── runner.ts        # Eval orchestration
│   │   │   ├── capture.ts       # Interaction capture
│   │   │   ├── validator.ts     # Build/test/deploy validation
│   │   │   ├── scorer.ts        # Score calculation
│   │   │   └── types.ts         # TypeScript interfaces
│   │   ├── scripts/
│   │   │   ├── build.sh         # Build validation script
│   │   │   ├── test.sh          # Test runner script
│   │   │   ├── deploy.sh        # Deployment script
│   │   │   ├── quality.sh       # Code quality scan
│   │   │   └── score.sh         # Score calculator
│   │   └── package.json
│   ├── kits/                    # Reference kit specifications
│   │   ├── tier1/
│   │   │   ├── echo-kit/
│   │   │   │   ├── spec.md      # Kit specification
│   │   │   │   ├── tests/       # Test suite
│   │   │   │   └── features.json # Feature checklist
│   │   │   ├── counter-kit/
│   │   │   └── converter-kit/
│   │   ├── tier2/
│   │   │   ├── todo-kit/
│   │   │   ├── webhook-kit/
│   │   │   └── auth-kit/
│   │   ├── tier3/
│   │   │   ├── chat-kit/
│   │   │   ├── analytics-kit/
│   │   │   └── workflow-kit/
│   │   └── tier4/
│   │       ├── cloud-kit/       # Links to existing CloudKit
│   │       ├── pundit-kit/      # Links to existing PunditKit
│   │       └── platform-kit/
│   ├── dashboard/               # Results dashboard (web UI)
│   │   ├── src/
│   │   └── package.json
│   └── cli/                     # CLI for running evals
│       ├── src/
│       └── package.json
├── results/                     # Eval run results
│   └── .gitkeep
├── config/
│   ├── tools/                   # Tool configurations
│   │   ├── claude-code.yaml
│   │   ├── cursor.yaml
│   │   └── template.yaml
│   └── environment.yaml         # Standard eval environment
└── docs/
    ├── adding-kits.md
    ├── running-evals.md
    └── submitting-results.md
```

## Core Concepts

### Complexity Dimensions (6)

Every kit is scored 1-10 on each:

| Dimension | Measures |
|-----------|----------|
| **Scope** | Files, LOC, technologies |
| **Integration** | External APIs, auth patterns |
| **Ambiguity** | Interpretation required |
| **Correctness** | Type safety, security, edge cases |
| **Infrastructure** | Deployment complexity |
| **Domain** | Specialized knowledge |

**Composite formula**:
```
Complexity = (Scope×1.5 + Integration×1.5 + Ambiguity + Correctness + Infrastructure + Domain) / 7
```

### Kit Tiers

| Tier | Complexity | Characteristics |
|------|------------|-----------------|
| 1 | 1-25 | 1-3 files, single tech, explicit specs |
| 2 | 26-50 | 4-10 files, 2-3 techs, some decisions |
| 3 | 51-75 | 10-25 files, 3-5 techs, production patterns |
| 4 | 76-100 | 25+ files, 5+ techs, full systems |

### Scoring Weights

**Per-Kit**:
- Build Success: 20%
- Test Pass Rate: 30%
- Feature Completeness: 25%
- Deployment: 10%
- Code Quality: 10%
- Efficiency: 5%

**Overall** (tier weights):
- Tier 1: 10%
- Tier 2: 20%
- Tier 3: 30%
- Tier 4: 40%

## Build Instructions

### Phase 1: Core Types and Harness

Start with `packages/harness/src/types.ts`:

```typescript
// Core evaluation types

export interface EvalRun {
  id: string;
  tool: string;
  toolVersion: string;
  kit: string;
  tier: 1 | 2 | 3 | 4;
  timestamp: string;

  // Captured data
  interactions: Interaction[];
  totalTokens: number;
  inputTokens: number;
  outputTokens: number;

  // Timing
  startTime: string;
  endTime: string;
  wallTimeSeconds: number;

  // Human interventions
  interventions: Intervention[];

  // Results
  buildResult: BuildResult;
  testResults: TestResult[];
  featureResults: FeatureResult[];
  deploymentResult: DeploymentResult;
  qualityScores: QualityScores;

  // Final scores
  scores: KitScores;

  // Artifacts
  filesCreated: string[];
  finalStateHash: string;
}

export interface Interaction {
  timestamp: string;
  type: 'user' | 'assistant' | 'tool_use' | 'tool_result';
  content: string;
  tokens: number;
}

export interface Intervention {
  timestamp: string;
  type: 'error_hint' | 'clarification' | 'restart' | 'manual_fix';
  description: string;
  penaltyPoints: number;
}

export interface BuildResult {
  success: boolean;
  exitCode: number;
  log: string;
  score: number; // 0, 25, 50, 75, or 100
}

export interface TestResult {
  name: string;
  category: 'basic' | 'advanced' | 'stretch';
  passed: boolean;
  duration: number;
  error?: string;
}

export interface FeatureResult {
  name: string;
  weight: 1 | 2 | 3; // nice-to-have, important, critical
  implemented: boolean;
  notes?: string;
}

export interface DeploymentResult {
  success: boolean;
  url?: string;
  healthCheck: boolean;
  score: number; // 0, 50, 75, or 100
}

export interface QualityScores {
  linting: number;      // 0-25
  security: number;     // 0-25
  structure: number;    // 0-25
  types: number;        // 0-25
  total: number;        // 0-100
}

export interface KitScores {
  build: number;
  tests: number;
  features: number;
  deployment: number;
  quality: number;
  efficiency: number;
  total: number;
}

export interface KitConfig {
  name: string;
  tier: 1 | 2 | 3 | 4;
  complexity: ComplexityScores;
  specPath: string;
  testsPath: string;
  featuresPath: string;
  baselineTokens: number;
  timeoutMinutes: number;
}

export interface ComplexityScores {
  scope: number;
  integration: number;
  ambiguity: number;
  correctness: number;
  infrastructure: number;
  domain: number;
  composite: number;
}

export interface ToolConfig {
  name: string;
  version: string;
  type: 'agentic' | 'single-shot' | 'interactive';
  apiEndpoint?: string;
  apiKey?: string;
  customRunner?: string;
}

export interface LeaderboardEntry {
  tool: string;
  toolVersion: string;
  overall: number;
  tier1: number;
  tier2: number;
  tier3: number;
  tier4: number;
  lastUpdated: string;
  runCount: number;
  confidence: number;
}
```

### Phase 2: Score Calculator

`packages/harness/src/scorer.ts`:

```typescript
import type { EvalRun, KitScores, TestResult, FeatureResult } from './types';

export function calculateKitScores(run: EvalRun): KitScores {
  const build = run.buildResult.score;
  const tests = calculateTestScore(run.testResults);
  const features = calculateFeatureScore(run.featureResults);
  const deployment = run.deploymentResult.score;
  const quality = run.qualityScores.total;
  const efficiency = calculateEfficiencyScore(run);

  // Weighted total
  const total = Math.round(
    build * 0.20 +
    tests * 0.30 +
    features * 0.25 +
    deployment * 0.10 +
    quality * 0.10 +
    efficiency * 0.05
  );

  return { build, tests, features, deployment, quality, efficiency, total };
}

function calculateTestScore(results: TestResult[]): number {
  if (results.length === 0) return 0;
  const passed = results.filter(r => r.passed).length;
  return Math.round((passed / results.length) * 100);
}

function calculateFeatureScore(results: FeatureResult[]): number {
  if (results.length === 0) return 0;

  let weightedSum = 0;
  let totalWeight = 0;

  for (const feature of results) {
    totalWeight += feature.weight;
    if (feature.implemented) {
      weightedSum += feature.weight;
    }
  }

  return Math.round((weightedSum / totalWeight) * 100);
}

function calculateEfficiencyScore(run: EvalRun, baselineTokens = 10000): number {
  // Token efficiency (40% of efficiency score)
  const tokenRatio = run.totalTokens / baselineTokens;
  const tokenScore = Math.max(0, 100 - (tokenRatio - 1) * 100) * 0.4;

  // Interaction count (30%)
  const interactionScore = Math.max(0, 100 - run.interactions.length * 2) * 0.3;

  // Human interventions (20%)
  const interventionPenalty = run.interventions.reduce((sum, i) => sum + i.penaltyPoints, 0);
  const interventionScore = Math.max(0, 100 - interventionPenalty * 10) * 0.2;

  // Wall time (10%)
  const timeScore = Math.max(0, 100 - run.wallTimeSeconds / 60) * 0.1;

  return Math.round(tokenScore + interactionScore + interventionScore + timeScore);
}

export function calculateTierScore(kitScores: KitScores[]): number {
  if (kitScores.length === 0) return 0;
  const sum = kitScores.reduce((acc, k) => acc + k.total, 0);
  return Math.round(sum / kitScores.length);
}

export function calculateOverallScore(tierScores: {
  tier1: number;
  tier2: number;
  tier3: number;
  tier4: number;
}): number {
  return Math.round(
    tierScores.tier1 * 0.10 +
    tierScores.tier2 * 0.20 +
    tierScores.tier3 * 0.30 +
    tierScores.tier4 * 0.40
  );
}
```

### Phase 3: Validation Scripts

`packages/harness/scripts/build.sh`:
```bash
#!/bin/bash
set -e

KIT_DIR=$1

if [ -z "$KIT_DIR" ]; then
  echo "Usage: build.sh <kit-directory>"
  exit 1
fi

cd "$KIT_DIR"

# Detect project type and build
if [ -f "package.json" ]; then
  npm install
  npm run build 2>&1 || exit 1
elif [ -f "Cargo.toml" ]; then
  cargo build --release 2>&1 || exit 1
elif [ -f "go.mod" ]; then
  go build ./... 2>&1 || exit 1
elif [ -f "requirements.txt" ]; then
  pip install -r requirements.txt 2>&1 || exit 1
  python -m py_compile *.py 2>&1 || exit 1
else
  echo "Unknown project type"
  exit 1
fi

echo "Build successful"
exit 0
```

`packages/harness/scripts/test.sh`:
```bash
#!/bin/bash
KIT_DIR=$1
TESTS_DIR=$2

if [ -z "$KIT_DIR" ] || [ -z "$TESTS_DIR" ]; then
  echo "Usage: test.sh <kit-directory> <tests-directory>"
  exit 1
fi

cd "$KIT_DIR"

# Run tests based on project type
if [ -f "package.json" ]; then
  npx vitest run --reporter=json "$TESTS_DIR" 2>&1
elif [ -f "Cargo.toml" ]; then
  cargo test --message-format=json 2>&1
elif [ -f "go.mod" ]; then
  go test -json ./... 2>&1
elif [ -f "requirements.txt" ]; then
  python -m pytest "$TESTS_DIR" --json-report 2>&1
fi
```

`packages/harness/scripts/quality.sh`:
```bash
#!/bin/bash
KIT_DIR=$1

cd "$KIT_DIR"

LINT_SCORE=0
SECURITY_SCORE=0
STRUCTURE_SCORE=0
TYPE_SCORE=0

# Linting
if [ -f "package.json" ]; then
  if npx eslint . --quiet 2>/dev/null; then
    LINT_SCORE=25
  elif npx eslint . 2>/dev/null; then
    LINT_SCORE=15
  fi
fi

# Security scan
if command -v semgrep &> /dev/null; then
  ISSUES=$(semgrep --config=auto --json . 2>/dev/null | jq '.results | length')
  if [ "$ISSUES" -eq 0 ]; then
    SECURITY_SCORE=25
  elif [ "$ISSUES" -lt 5 ]; then
    SECURITY_SCORE=15
  fi
else
  SECURITY_SCORE=20  # No scanner, give benefit of doubt
fi

# Structure (file organization)
FILE_COUNT=$(find . -type f \( -name "*.ts" -o -name "*.js" -o -name "*.py" \) | wc -l)
DIR_COUNT=$(find . -type d | wc -l)
if [ "$DIR_COUNT" -gt 3 ] && [ "$FILE_COUNT" -gt 5 ]; then
  STRUCTURE_SCORE=25
elif [ "$DIR_COUNT" -gt 1 ]; then
  STRUCTURE_SCORE=15
fi

# Type coverage
if [ -f "tsconfig.json" ]; then
  if grep -q '"strict": true' tsconfig.json; then
    TYPE_SCORE=25
  else
    TYPE_SCORE=15
  fi
elif [ -f "py.typed" ]; then
  TYPE_SCORE=20
fi

TOTAL=$((LINT_SCORE + SECURITY_SCORE + STRUCTURE_SCORE + TYPE_SCORE))

echo "{\"linting\": $LINT_SCORE, \"security\": $SECURITY_SCORE, \"structure\": $STRUCTURE_SCORE, \"types\": $TYPE_SCORE, \"total\": $TOTAL}"
```

### Phase 4: Reference Kits (Tier 1)

Create `packages/kits/tier1/echo-kit/spec.md`:

```markdown
# EchoKit

*The simplest possible API test.*

## Requirements

Build an HTTP echo server with:

1. **POST /echo** - Returns the request body exactly as received
   - Preserve Content-Type header
   - Support JSON, text, and binary

2. **GET /health** - Returns 200 OK with `{"status": "ok"}`

3. **Error handling**:
   - 405 for unsupported methods
   - 400 for malformed requests

## Configuration

- Port: Read from `PORT` environment variable, default 3000

## Technology

Use any HTTP server framework. Node.js recommended.

## Example

```bash
curl -X POST http://localhost:3000/echo \
  -H "Content-Type: application/json" \
  -d '{"hello": "world"}'
# Returns: {"hello": "world"}
```
```

Create `packages/kits/tier1/echo-kit/tests/echo.test.ts`:

```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest';

const BASE_URL = process.env.TEST_URL || 'http://localhost:3000';

describe('EchoKit', () => {
  // Basic tests (60%)
  describe('Basic', () => {
    it('health endpoint returns 200', async () => {
      const res = await fetch(`${BASE_URL}/health`);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.status).toBe('ok');
    });

    it('echoes JSON body', async () => {
      const payload = { hello: 'world', num: 42 };
      const res = await fetch(`${BASE_URL}/echo`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual(payload);
    });

    it('echoes plain text', async () => {
      const text = 'Hello, World!';
      const res = await fetch(`${BASE_URL}/echo`, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: text,
      });
      expect(res.status).toBe(200);
      expect(await res.text()).toBe(text);
    });
  });

  // Advanced tests (30%)
  describe('Advanced', () => {
    it('preserves content-type header', async () => {
      const res = await fetch(`${BASE_URL}/echo`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/xml' },
        body: '<root><item>test</item></root>',
      });
      expect(res.headers.get('content-type')).toContain('application/xml');
    });

    it('returns 405 for GET on /echo', async () => {
      const res = await fetch(`${BASE_URL}/echo`);
      expect(res.status).toBe(405);
    });

    it('handles empty body', async () => {
      const res = await fetch(`${BASE_URL}/echo`, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: '',
      });
      expect(res.status).toBe(200);
      expect(await res.text()).toBe('');
    });
  });

  // Stretch tests (10%)
  describe('Stretch', () => {
    it('handles large payloads', async () => {
      const largePayload = 'x'.repeat(1000000); // 1MB
      const res = await fetch(`${BASE_URL}/echo`, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: largePayload,
      });
      expect(res.status).toBe(200);
      expect(await res.text()).toBe(largePayload);
    });
  });
});
```

Create `packages/kits/tier1/echo-kit/features.json`:

```json
{
  "kit": "echo-kit",
  "tier": 1,
  "complexity": {
    "scope": 2,
    "integration": 1,
    "ambiguity": 1,
    "correctness": 2,
    "infrastructure": 1,
    "domain": 1,
    "composite": 12
  },
  "features": [
    {
      "name": "POST /echo endpoint",
      "weight": 3,
      "description": "Returns request body exactly as received"
    },
    {
      "name": "GET /health endpoint",
      "weight": 3,
      "description": "Returns 200 OK with status"
    },
    {
      "name": "JSON body support",
      "weight": 2,
      "description": "Correctly echoes JSON payloads"
    },
    {
      "name": "Text body support",
      "weight": 2,
      "description": "Correctly echoes plain text"
    },
    {
      "name": "Content-Type preservation",
      "weight": 2,
      "description": "Response has same Content-Type as request"
    },
    {
      "name": "405 for wrong method",
      "weight": 2,
      "description": "Returns 405 Method Not Allowed appropriately"
    },
    {
      "name": "Configurable port",
      "weight": 1,
      "description": "Reads PORT from environment"
    }
  ],
  "baselineTokens": 5000,
  "timeoutMinutes": 30
}
```

### Phase 5: CLI Interface

`packages/cli/src/index.ts`:

```typescript
#!/usr/bin/env node
import { Command } from 'commander';
import { runEval } from '@mosskits/harness';

const program = new Command();

program
  .name('mosskit-eval')
  .description('Run MOSSKits evaluations')
  .version('1.0.0');

program
  .command('run')
  .description('Run an evaluation')
  .requiredOption('-t, --tool <tool>', 'Tool configuration name')
  .option('-k, --kit <kit>', 'Specific kit to run')
  .option('--tier <tier>', 'Run all kits in a tier (1-4)')
  .option('--all', 'Run all kits')
  .option('--official', 'Official submission run')
  .action(async (options) => {
    console.log(`Running eval for ${options.tool}...`);
    // Implementation
  });

program
  .command('score')
  .description('Calculate scores from a run')
  .requiredOption('-r, --run <run-id>', 'Run ID to score')
  .action(async (options) => {
    console.log(`Scoring run ${options.run}...`);
    // Implementation
  });

program
  .command('leaderboard')
  .description('Display the leaderboard')
  .option('--tier <tier>', 'Filter by tier')
  .action(async (options) => {
    console.log('Leaderboard:');
    // Implementation
  });

program
  .command('submit')
  .description('Submit results to official leaderboard')
  .requiredOption('-r, --run <run-id>', 'Run ID to submit')
  .action(async (options) => {
    console.log(`Submitting run ${options.run}...`);
    // Implementation
  });

program.parse();
```

### Phase 6: Dashboard (Web UI)

Use React + Tailwind. Key views:

1. **Leaderboard** - Overall rankings with drill-down
2. **Tool Detail** - Per-tool breakdown by tier and kit
3. **Kit Detail** - See all runs for a specific kit
4. **Run Detail** - Full interaction log and scores

## Key Implementation Notes

### Intervention Penalties

```typescript
const INTERVENTION_PENALTIES = {
  error_hint: 5,
  clarification: 2,
  restart: 10,
  manual_fix: Infinity, // Disqualifies that feature
};

const MAX_INTERVENTIONS = 5;
```

### Build Success Scoring

```typescript
function scoreBuildResult(exitCode: number, hasErrors: boolean, runsPartially: boolean): number {
  if (exitCode === 0 && !hasErrors) return 100;
  if (exitCode === 0 && hasErrors) return 75;
  if (runsPartially) return 50;
  if (exitCode !== 0) return 25;
  return 0;
}
```

### Test Categories

- **Basic** (60% of tests): Core functionality that must work
- **Advanced** (30% of tests): Edge cases, error handling
- **Stretch** (10% of tests): Beyond spec, best practices

### Deployment Scoring

```typescript
function scoreDeployment(deployed: boolean, accessible: boolean, healthCheck: boolean): number {
  if (deployed && accessible && healthCheck) return 100;
  if (deployed && accessible) return 75;
  if (deployed) return 50;
  return 0;
}
```

## Running an Eval (End-to-End)

1. **Setup environment**: Standard Docker image with all tooling
2. **Load tool config**: API keys, endpoints, runner type
3. **Load kit config**: Spec, tests, features, baseline
4. **Start capture**: Record all interactions
5. **Send initial prompt**: "Build this system according to the specification."
6. **Wait for completion or timeout**
7. **Run validation pipeline**: build.sh → test.sh → deploy.sh → quality.sh
8. **Calculate scores**
9. **Generate report**

## Anti-Gaming Measures

1. **20% hidden tests** - Not in public test files
2. **Spec variants** - Same kit, different details
3. **Manual review** - Random sample verification
4. **Anomaly detection** - Flag suspiciously high scores
5. **Kit rotation** - New kits quarterly

## File Naming Conventions

- Kit specs: `spec.md`
- Test files: `*.test.ts` or `test_*.py`
- Features: `features.json`
- Tool configs: `{tool-name}.yaml`
- Run results: `{run-id}.json`

## Environment Variables

```bash
MOSSKIT_ENV=development|production
MOSSKIT_RESULTS_DIR=./results
MOSSKIT_TOOLS_DIR=./config/tools
MOSSKIT_KITS_DIR=./packages/kits
```

## Dependencies

```json
{
  "dependencies": {
    "commander": "^11.0.0",
    "vitest": "^1.0.0",
    "yaml": "^2.3.0",
    "zod": "^3.22.0"
  }
}
```

## Git Commits

Never include AI attribution in commits. Keep commits focused and descriptive of actual changes.
