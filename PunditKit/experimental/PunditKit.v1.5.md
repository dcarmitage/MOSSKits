# PunditKit v1.5

*Multi-platform prediction market agent with autonomous operations, learning systems, and extensible architecture.*

---

## Philosophy

### The Market Is Usually Right

Prediction markets aggregate the beliefs of thousands of participants with real money at stake. The price IS the crowd's best estimate. PunditKit doesn't try to outsmart this wisdom mechanically—it seeks **genuine alpha**: specific, articulable information advantages that the market hasn't yet priced in.

### Default Stance: NO TRADE

Every evaluation starts from a position of humility. The system must be convinced TO trade, not convinced NOT to trade. This prevents:
- Overtrading on marginal edges
- Gambling disguised as analysis
- Losses from model overconfidence

### Learn and Improve

v1.5 introduces a **learning system**. Every prediction is recorded. Every resolution is tracked. Over time, PunditKit learns:
- Is our model well-calibrated?
- Which research techniques produce better outcomes?
- Which market types do we have real edge in?

### Multi-Platform, Modular Architecture

Prediction markets exist across many platforms. PunditKit v1.5 isn't locked to one ecosystem. The **platform adapter pattern** makes adding new sources straightforward:
- Polymarket (via Gamma API)
- Kalshi (via Kalshi API)
- Metaculus (for calibration training, no trading)
- Custom markets (track anything)

### Autonomous by Default

Manual-only systems miss opportunities. v1.5 runs autonomously:
- Daily market discovery
- Automatic research on high-interest markets
- Alerts when trade opportunities emerge
- Stale research detection

You're notified when action is needed. The system works while you sleep.

---

## Quick Start

```bash
# 1. Clone and navigate
git clone https://github.com/dcarmitage/MOSSKits.git
cd MOSSKits/PunditKit/demo

# 2. Login to Cloudflare
npx wrangler login

# 3. Deploy with AI assistance
# Open in Claude Code or Cursor and say:
# "Deploy PunditKit to my Cloudflare account"
```

The AI agent guides you through resource creation. Once deployed:
1. Open your portal URL
2. Add API keys in Settings (Claude, Gemini)
3. Configure at least one platform (Polymarket requires no auth)
4. Enable autonomous operations (optional)

**Requirements:**
- Cloudflare account (free tier works)
- Claude API key (evaluation)
- Gemini API key (research)
- Platform API keys (Kalshi requires auth; Polymarket doesn't)

---

## What's New in v1.5

| Capability | v1.1 | v1.5 |
|------------|------|------|
| **Platforms** | Polymarket only | Multi-platform with adapters |
| **Operations** | Manual triggers | Autonomous scheduling (Cron) |
| **Learning** | None | Full prediction tracking + calibration |
| **Notifications** | None | Webhooks, email alerts |
| **Research** | All reports equal | Quality-scored aggregation |
| **Monitoring** | Basic UI | Operational dashboard |
| **Extension** | Ad-hoc modifications | Documented extension framework |

### Migration from v1.1

v1.5 is backwards compatible. Your existing:
- Markets, research, evaluations → preserved
- Prompts → work unchanged
- Settings → still used

New tables are added for:
- Predictions (learning system)
- Notifications configuration
- Platform credentials
- Scheduled task history

Run the migration:
```bash
npx wrangler d1 execute pundit-db --remote --file=./migrations/v1.5.sql
```

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                          YOUR CLOUDFLARE ACCOUNT                                 │
│                                                                                  │
│  ┌─────────────┐   ┌─────────────┐   ┌─────────────┐   ┌─────────────┐          │
│  │     D1      │   │   Worker    │   │    Queue    │   │    Cron     │          │
│  │  Database   │   │    API      │   │  Research   │   │  Triggers   │          │
│  │             │   │             │   │             │   │             │          │
│  │ • markets   │   │ • REST API  │   │ max_con: 10 │   │ • daily     │          │
│  │ • research  │   │ • platform  │   │ • retries   │   │ • hourly    │          │
│  │ • evals     │   │   adapters  │   │             │   │ • custom    │          │
│  │ • predict   │   │ • notifier  │   │             │   │             │          │
│  └──────┬──────┘   └──────┬──────┘   └──────┬──────┘   └──────┬──────┘          │
│         └──────────────────┴──────────────────┴──────────────────┘               │
│                                      │                                           │
│  ┌───────────────────────────────────┴───────────────────────────────────────┐   │
│  │                         Pages (Portal UI)                                  │   │
│  │   Pipeline │ Dashboard │ Performance │ Notifications │ Settings            │   │
│  └───────────────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────────┘
                                      │
          ┌───────────────────────────┼───────────────────────────┐
          │                           │                           │
          ▼                           ▼                           ▼
┌─────────────────────┐   ┌─────────────────────┐   ┌─────────────────────┐
│  Platform Adapters  │   │   Research Models   │   │  Notification Sinks │
├─────────────────────┤   ├─────────────────────┤   ├─────────────────────┤
│ • Polymarket        │   │ • Gemini Deep       │   │ • Discord webhook   │
│ • Kalshi            │   │ • Gemini Quick      │   │ • Slack webhook     │
│ • Metaculus         │   │ • Claude Analysis   │   │ • Email (SendGrid)  │
│ • Custom            │   │ • [extensible]      │   │ • [extensible]      │
└─────────────────────┘   └─────────────────────┘   └─────────────────────┘
```

### Why This Architecture

| Component | Purpose |
|-----------|---------|
| **Platform Adapters** | Normalize market data from any source |
| **Cron Triggers** | Autonomous scheduled operations |
| **Queue** | Parallel research with retry logic |
| **Notification Sinks** | Alert on trade recommendations |
| **Predictions Table** | Enable learning from outcomes |

---

## Platform Adapters

### Adapter Interface

Every platform implements this interface:

```typescript
interface PlatformAdapter {
  // Identity
  readonly name: string;
  readonly slug: string;

  // Discovery
  discoverMarkets(filters: DiscoveryFilters): Promise<Market[]>;
  getMarket(id: string): Promise<Market | null>;
  syncMarket(id: string): Promise<Market>;  // Refresh from source

  // Research context
  getResearchContext(market: Market): string;  // Additional context for prompts

  // Trading (optional - some platforms are read-only)
  readonly canTrade: boolean;
  executeTrade?(market: Market, direction: 'yes' | 'no', size: number): Promise<Trade>;

  // Resolution tracking
  checkResolution(market: Market): Promise<Resolution | null>;
}

interface DiscoveryFilters {
  minVolume?: number;
  maxEndDate?: Date;
  categories?: string[];
  searchQuery?: string;
  limit?: number;
}

interface Resolution {
  outcome: 'yes' | 'no' | string;  // string for multi-outcome
  resolvedAt: Date;
  source: string;  // URL or description
}
```

### Polymarket Adapter

Uses the Gamma API (no authentication required):

```typescript
class PolymarketAdapter implements PlatformAdapter {
  readonly name = 'Polymarket';
  readonly slug = 'polymarket';
  readonly canTrade = false;  // v1.5: read-only, v2.0: Playwriter integration

  private baseUrl = 'https://gamma-api.polymarket.com';

  async discoverMarkets(filters: DiscoveryFilters): Promise<Market[]> {
    const params = new URLSearchParams({
      active: 'true',
      closed: 'false',
      limit: String(filters.limit || 100),
    });

    if (filters.minVolume) {
      params.set('volume_num_min', String(filters.minVolume));
    }

    const response = await fetch(`${this.baseUrl}/markets?${params}`);
    const data = await response.json();

    return data.map(this.normalizeMarket);
  }

  private normalizeMarket(raw: GammaMarket): Market {
    return {
      id: raw.conditionId,
      platform: 'polymarket',
      externalId: raw.id,
      question: raw.question,
      description: raw.description,
      outcomes: JSON.parse(raw.outcomes || '["Yes", "No"]'),
      outcomePrices: JSON.parse(raw.outcomePrices || '["0.5", "0.5"]'),
      volume: parseFloat(raw.volume || '0'),
      liquidity: parseFloat(raw.liquidity || '0'),
      endDate: raw.endDate,
      // ... additional fields
    };
  }

  getResearchContext(market: Market): string {
    return `Platform: Polymarket (decentralized prediction market)
Volume: $${market.volume?.toLocaleString() || 'Unknown'}
Liquidity: $${market.liquidity?.toLocaleString() || 'Unknown'}
Resolution: ${market.description || 'See market page for resolution criteria'}`;
  }

  async checkResolution(market: Market): Promise<Resolution | null> {
    const fresh = await this.syncMarket(market.id);

    // Check if market has resolved
    if (fresh.resolved) {
      return {
        outcome: fresh.resolutionOutcome,
        resolvedAt: new Date(fresh.resolvedAt),
        source: `https://polymarket.com/event/${fresh.slug}`
      };
    }

    return null;
  }
}
```

### Kalshi Adapter

Requires API authentication:

```typescript
class KalshiAdapter implements PlatformAdapter {
  readonly name = 'Kalshi';
  readonly slug = 'kalshi';
  readonly canTrade = true;  // Kalshi has official trading API

  private baseUrl = 'https://trading-api.kalshi.com/v2';
  private apiKey: string;
  private privateKey: string;

  constructor(credentials: KalshiCredentials) {
    this.apiKey = credentials.apiKey;
    this.privateKey = credentials.privateKey;
  }

  async discoverMarkets(filters: DiscoveryFilters): Promise<Market[]> {
    const response = await this.authenticatedFetch('/markets', {
      status: 'open',
      limit: filters.limit || 100,
    });

    return response.markets.map(this.normalizeMarket);
  }

  async executeTrade(
    market: Market,
    direction: 'yes' | 'no',
    size: number
  ): Promise<Trade> {
    const side = direction === 'yes' ? 'yes' : 'no';

    const response = await this.authenticatedFetch('/orders', {
      method: 'POST',
      body: {
        ticker: market.externalId,
        side,
        type: 'market',
        count: Math.floor(size * 100),  // Kalshi uses contract counts
      }
    });

    return {
      id: response.order_id,
      marketId: market.id,
      direction,
      size,
      entryPrice: response.avg_price,
      status: 'executed',
      executedAt: new Date(),
    };
  }

  getResearchContext(market: Market): string {
    return `Platform: Kalshi (CFTC-regulated US exchange)
Volume: $${market.volume?.toLocaleString() || 'Unknown'}
Settlement: ${market.description || 'See Kalshi rules for resolution'}
Note: Regulated market - resolution criteria are legally binding`;
  }
}
```

### Metaculus Adapter

Read-only, excellent for calibration practice:

```typescript
class MetaculusAdapter implements PlatformAdapter {
  readonly name = 'Metaculus';
  readonly slug = 'metaculus';
  readonly canTrade = false;  // Metaculus is prediction-only

  private baseUrl = 'https://www.metaculus.com/api2';

  async discoverMarkets(filters: DiscoveryFilters): Promise<Market[]> {
    const response = await fetch(
      `${this.baseUrl}/questions/?status=open&type=binary&limit=${filters.limit || 50}`
    );
    const data = await response.json();

    return data.results.map(this.normalizeMarket);
  }

  getResearchContext(market: Market): string {
    return `Platform: Metaculus (forecasting community)
Community Prediction: ${market.communityPrediction || 'N/A'}
Note: High-quality forecasters, good calibration benchmark`;
  }
}
```

### Custom Market Adapter

Track predictions on anything:

```typescript
class CustomAdapter implements PlatformAdapter {
  readonly name = 'Custom';
  readonly slug = 'custom';
  readonly canTrade = false;

  async discoverMarkets(): Promise<Market[]> {
    // Custom markets are added manually, not discovered
    return [];
  }

  async addMarket(input: CustomMarketInput): Promise<Market> {
    return {
      id: crypto.randomUUID(),
      platform: 'custom',
      question: input.question,
      description: input.resolutionCriteria,
      outcomes: input.outcomes || ['Yes', 'No'],
      outcomePrices: input.initialPrices || ['0.5', '0.5'],
      endDate: input.endDate,
      source: input.source,  // URL or description of where to check resolution
    };
  }

  getResearchContext(market: Market): string {
    return `Platform: Custom market
Source: ${market.source || 'Manual entry'}
Resolution: ${market.description}`;
  }
}
```

### Adding a New Platform

To add support for a new prediction market:

1. Create adapter file: `src/adapters/{platform}.ts`
2. Implement the `PlatformAdapter` interface
3. Register in `src/adapters/index.ts`:

```typescript
// src/adapters/index.ts
import { PolymarketAdapter } from './polymarket';
import { KalshiAdapter } from './kalshi';
import { MetaculusAdapter } from './metaculus';
import { CustomAdapter } from './custom';
// import { YourNewAdapter } from './yournew';

export function createAdapter(
  platform: string,
  credentials?: PlatformCredentials
): PlatformAdapter {
  switch (platform) {
    case 'polymarket': return new PolymarketAdapter();
    case 'kalshi': return new KalshiAdapter(credentials as KalshiCredentials);
    case 'metaculus': return new MetaculusAdapter();
    case 'custom': return new CustomAdapter();
    // case 'yournew': return new YourNewAdapter(credentials);
    default: throw new Error(`Unknown platform: ${platform}`);
  }
}

export const SUPPORTED_PLATFORMS = [
  { slug: 'polymarket', name: 'Polymarket', requiresAuth: false, canTrade: false },
  { slug: 'kalshi', name: 'Kalshi', requiresAuth: true, canTrade: true },
  { slug: 'metaculus', name: 'Metaculus', requiresAuth: false, canTrade: false },
  { slug: 'custom', name: 'Custom', requiresAuth: false, canTrade: false },
];
```

---

## Research System

### Multi-Technique Architecture

Research techniques are pluggable modules:

```typescript
interface ResearchTechnique {
  readonly name: string;
  readonly slug: string;
  readonly estimatedDuration: number;  // seconds
  readonly requiresApiKey: string;     // which setting key

  execute(
    query: string,
    context: ResearchContext,
    onProgress?: (update: ProgressUpdate) => void
  ): Promise<ResearchResult>;

  isAvailable(settings: Settings): boolean;
}

interface ResearchContext {
  market: Market;
  platformContext: string;  // from adapter
  existingResearch?: ResearchPath[];  // for synthesis techniques
}

interface ResearchResult {
  summary: string;
  sources: ResearchSource[];
  keyFacts: string[];
  contradictions: string[];
  confidence: 'high' | 'medium' | 'low';
  rawOutput?: string;
}
```

### Built-in Techniques

| Technique | Model | Duration | Best For |
|-----------|-------|----------|----------|
| `deep_research` | `deep-research-pro-preview-12-2025` | 2-5 min | Comprehensive first pass |
| `quick_search` | `gemini-3-pro-preview` | 10-30 sec | Fast updates, active markets |
| `analysis` | `claude-opus-4-5-20251101` | 30-60 sec | Synthesizing existing research |

### Research Quality Scoring

Not all research is equally valuable. v1.5 scores each research report:

```typescript
interface ResearchQuality {
  sourceCount: number;          // More sources = more confident
  sourceDiversity: number;      // Different domains = less bias
  recency: number;              // Newer = more relevant
  factDensity: number;          // Facts per paragraph
  contradictionRatio: number;   // Contradictions / facts (lower = cleaner)

  // Computed
  overallScore: number;         // 0-100
}

function scoreResearch(result: ResearchResult): ResearchQuality {
  const sourceCount = result.sources.length;

  // Source diversity: unique domains / total sources
  const domains = new Set(result.sources.map(s => new URL(s.url).hostname));
  const sourceDiversity = domains.size / Math.max(sourceCount, 1);

  // Recency: average days old, scaled 0-1 (newer = higher)
  const avgAge = result.sources.reduce((sum, s) => {
    const age = Date.now() - new Date(s.publishDate).getTime();
    return sum + age / (1000 * 60 * 60 * 24);  // days
  }, 0) / Math.max(sourceCount, 1);
  const recency = Math.max(0, 1 - avgAge / 365);  // Decay over 1 year

  // Fact density: key facts per 500 chars of summary
  const factDensity = result.keyFacts.length / (result.summary.length / 500);

  // Contradiction ratio: contradictions per fact (lower = cleaner)
  const contradictionRatio = result.contradictions.length /
    Math.max(result.keyFacts.length, 1);

  // Overall score: weighted combination
  const overallScore = Math.round(
    sourceCount * 5 +                    // Up to 50 points for 10 sources
    sourceDiversity * 20 +               // Up to 20 points
    recency * 15 +                       // Up to 15 points
    Math.min(factDensity * 10, 10) +     // Up to 10 points
    (1 - contradictionRatio) * 5         // Up to 5 points
  );

  return {
    sourceCount,
    sourceDiversity,
    recency,
    factDensity,
    contradictionRatio,
    overallScore: Math.min(100, overallScore),
  };
}
```

### Weighted Aggregation for Evaluation

When evaluating, research reports are weighted by quality:

```typescript
function aggregateResearchForEvaluation(
  researchPaths: ResearchPath[]
): string {
  // Sort by quality score descending
  const sorted = [...researchPaths]
    .filter(r => r.status === 'completed')
    .sort((a, b) => (b.quality_score || 0) - (a.quality_score || 0));

  return sorted.map((path, idx) => {
    const quality = path.quality_score || 50;
    const technique = path.technique || 'unknown';
    const weight = quality >= 70 ? 'HIGH WEIGHT' :
                   quality >= 50 ? 'MEDIUM WEIGHT' : 'LOW WEIGHT';

    return `=== Research Report #${idx + 1} ===
Technique: ${technique}
Quality Score: ${quality}/100 (${weight})
Sources: ${path.source_count || 0}

${path.summary}`;
  }).join('\n\n---\n\n');
}
```

### Research Scheduling

v1.5 can automatically trigger research:

```typescript
interface ResearchTrigger {
  type: 'volume_spike' | 'price_movement' | 'approaching_end' | 'stale_research';
  threshold: number;
  technique: string;
  maxPerDay: number;
}

// Example configuration
const DEFAULT_RESEARCH_TRIGGERS: ResearchTrigger[] = [
  {
    type: 'volume_spike',
    threshold: 2.0,  // 2x normal volume
    technique: 'quick_search',
    maxPerDay: 10,
  },
  {
    type: 'approaching_end',
    threshold: 7,  // 7 days until resolution
    technique: 'deep_research',
    maxPerDay: 5,
  },
  {
    type: 'stale_research',
    threshold: 7,  // Research older than 7 days
    technique: 'quick_search',
    maxPerDay: 20,
  },
];
```

---

## Evaluation System

### Alpha-Seeking Core

The evaluation prompt emphasizes finding genuine edge:

```
CORE PRINCIPLE: The market is usually right. The current price reflects
collective wisdom. You should ONLY recommend trading when you have a
SPECIFIC, ARTICULABLE reason to believe the market is wrong.

DEFAULT STANCE: NO TRADE.

WHAT COUNTS AS ALPHA:
- Information the market hasn't priced in yet
- Analysis that reveals a flaw in consensus thinking
- Timing advantages from faster research

WHAT DOES NOT COUNT:
- Your probability estimate being slightly different
- Disagreeing without specific evidence
- Gut feelings
```

### Structured Evaluation Output

```typescript
interface EvaluationResult {
  // Probability estimate
  probability: number;              // 0.05 to 0.95
  confidence: 'high' | 'medium' | 'low';

  // Alpha assessment (PRIMARY SIGNAL)
  recommend_trade: boolean;
  trade_direction: 'yes' | 'no' | null;
  information_advantage: 'none' | 'weak' | 'moderate' | 'strong';
  market_inefficiency: string | null;
  trade_thesis: string | null;

  // Analysis components
  base_rate: {
    estimate: string;
    reasoning: string;
  };
  key_factors_yes: string[];
  key_factors_no: string[];
  main_uncertainty: string;
  market_comparison: string;

  // Full reasoning
  reasoning: string;
}
```

### Position Sizing

Only calculated when `recommend_trade === true`:

```typescript
function calculatePosition(
  evaluation: EvaluationResult,
  market: Market,
  settings: Settings
): number {
  // No trade = no position
  if (!evaluation.recommend_trade) {
    return 0;
  }

  // Get current market odds
  const marketOdds = parseFloat(market.outcome_prices[0]);

  // Calculate edge
  const edge = evaluation.trade_direction === 'yes'
    ? evaluation.probability - marketOdds
    : (1 - evaluation.probability) - (1 - marketOdds);

  // Floor/ceiling detection
  const isAtFloor = evaluation.probability <= 0.06;
  const isAtCeiling = evaluation.probability >= 0.94;
  const marketAtExtreme = marketOdds < 0.04 || marketOdds > 0.96;

  if ((isAtFloor || isAtCeiling) && marketAtExtreme) {
    return 0;  // Can't distinguish real probability from calibration bound
  }

  // Kelly criterion with fractional sizing
  const kellyFraction = 0.25;  // Quarter Kelly for safety
  const winProb = evaluation.trade_direction === 'yes'
    ? evaluation.probability
    : (1 - evaluation.probability);
  const odds = 1 / marketOdds - 1;  // Decimal odds
  const kelly = (winProb * odds - (1 - winProb)) / odds;

  // Apply constraints
  const maxPosition = settings.max_position_percent / 100;
  const position = Math.max(0, Math.min(maxPosition, kelly * kellyFraction));

  // Confidence adjustment
  const confidenceMultiplier =
    evaluation.confidence === 'high' ? 1.0 :
    evaluation.confidence === 'medium' ? 0.7 : 0.4;

  return position * confidenceMultiplier;
}
```

### Category-Aware Prompts

Different market types benefit from different prompts:

```typescript
interface PromptCategory {
  slug: string;
  name: string;
  keywords: string[];
  systemPromptAddition: string;
}

const PROMPT_CATEGORIES: PromptCategory[] = [
  {
    slug: 'politics',
    name: 'Political Events',
    keywords: ['election', 'president', 'congress', 'vote', 'poll'],
    systemPromptAddition: `
For political markets:
- Weight polling aggregates heavily (538, RCP, Silver)
- Account for poll-to-result historical bias
- Consider electoral college math for presidential
- Watch for late-breaking news cycles`,
  },
  {
    slug: 'sports',
    name: 'Sports Outcomes',
    keywords: ['game', 'match', 'championship', 'win', 'score'],
    systemPromptAddition: `
For sports markets:
- Injuries are crucial - check recent news
- Home/away advantage matters
- Recent form vs season average
- Weather conditions for outdoor sports`,
  },
  {
    slug: 'crypto',
    name: 'Cryptocurrency',
    keywords: ['bitcoin', 'ethereum', 'crypto', 'token', 'blockchain'],
    systemPromptAddition: `
For crypto markets:
- Extreme volatility - widen confidence intervals
- Regulatory news can move markets instantly
- Technical analysis has limited value
- Whale movements can dominate`,
  },
  {
    slug: 'science',
    name: 'Scientific/Technical',
    keywords: ['study', 'research', 'fda', 'trial', 'launch', 'spacex'],
    systemPromptAddition: `
For scientific/technical markets:
- Look for preprint papers and conference announcements
- Historical success rates for similar endeavors
- Expert consensus matters more than popular opinion
- Timeline estimates often optimistic`,
  },
];

function detectCategory(market: Market): PromptCategory | null {
  const text = `${market.question} ${market.description || ''}`.toLowerCase();

  for (const category of PROMPT_CATEGORIES) {
    if (category.keywords.some(kw => text.includes(kw))) {
      return category;
    }
  }

  return null;
}
```

---

## Autonomous Operations

### Cron Triggers

v1.5 uses Cloudflare Cron Triggers for scheduled execution:

```toml
# wrangler.toml
[triggers]
crons = [
  "0 6 * * *",   # 6 AM UTC - daily discovery
  "0 */4 * * *", # Every 4 hours - resolution check
  "0 12 * * *",  # Noon UTC - stale research check
]
```

### Scheduled Tasks

```typescript
// src/scheduled.ts
export async function handleScheduled(
  event: ScheduledEvent,
  env: Env,
  ctx: ExecutionContext
) {
  const hour = new Date(event.scheduledTime).getUTCHours();

  switch (event.cron) {
    case '0 6 * * *':
      await dailyDiscovery(env);
      break;
    case '0 */4 * * *':
      await checkResolutions(env);
      break;
    case '0 12 * * *':
      await detectStaleResearch(env);
      break;
  }
}

async function dailyDiscovery(env: Env) {
  const platforms = await getEnabledPlatforms(env.DB);

  for (const platform of platforms) {
    const adapter = createAdapter(platform.slug, platform.credentials);

    // Discover markets matching criteria
    const markets = await adapter.discoverMarkets({
      minVolume: 10000,  // $10k minimum
      limit: 50,
    });

    // Upsert into database
    for (const market of markets) {
      await upsertMarket(env.DB, market);
    }

    // Log discovery
    await logJournalEntry(env.DB, 'system', 'daily_discovery', {
      platform: platform.slug,
      marketsFound: markets.length,
    });
  }

  // Notify if configured
  await sendNotification(env, {
    type: 'discovery_complete',
    title: 'Daily Discovery Complete',
    body: `Synced ${platforms.length} platforms`,
  });
}

async function checkResolutions(env: Env) {
  // Get markets that might have resolved
  const pendingResolution = await env.DB.prepare(`
    SELECT m.*, p.slug as platform_slug
    FROM markets m
    JOIN platforms p ON m.platform = p.slug
    WHERE m.status != 'closed'
    AND m.end_date < datetime('now', '+1 day')
  `).all();

  for (const market of pendingResolution.results) {
    const adapter = createAdapter(market.platform_slug);
    const resolution = await adapter.checkResolution(market);

    if (resolution) {
      // Update market status
      await env.DB.prepare(`
        UPDATE markets
        SET status = 'closed',
            resolved_outcome = ?,
            resolved_at = ?
        WHERE id = ?
      `).bind(resolution.outcome, resolution.resolvedAt.toISOString(), market.id).run();

      // Update predictions for learning system
      await recordResolution(env.DB, market.id, resolution);

      // Notify
      await sendNotification(env, {
        type: 'market_resolved',
        title: `Market Resolved: ${market.question.substring(0, 50)}...`,
        body: `Outcome: ${resolution.outcome}`,
        marketId: market.id,
      });
    }
  }
}

async function detectStaleResearch(env: Env) {
  const staleThreshold = 7;  // days

  const staleMarkets = await env.DB.prepare(`
    SELECT m.* FROM markets m
    WHERE m.status = 'watching' OR m.status = 'researching'
    AND m.end_date > datetime('now')
    AND NOT EXISTS (
      SELECT 1 FROM research_paths r
      WHERE r.market_id = m.id
      AND r.created_at > datetime('now', '-' || ? || ' days')
    )
  `).bind(staleThreshold).all();

  // Queue quick research for stale markets
  for (const market of staleMarkets.results) {
    await env.RESEARCH_QUEUE.send({
      marketId: market.id,
      technique: 'quick_search',
      reason: 'stale_research',
    });
  }
}
```

### Auto-Research Triggers

```typescript
async function evaluateAutoResearchTriggers(
  env: Env,
  market: Market,
  previousState: Market | null
): Promise<void> {
  const triggers = await getResearchTriggers(env.DB);

  for (const trigger of triggers) {
    let shouldTrigger = false;

    switch (trigger.type) {
      case 'volume_spike':
        if (previousState) {
          const volumeRatio = market.volume / (previousState.volume || 1);
          shouldTrigger = volumeRatio >= trigger.threshold;
        }
        break;

      case 'price_movement':
        if (previousState) {
          const priceDelta = Math.abs(
            parseFloat(market.outcome_prices[0]) -
            parseFloat(previousState.outcome_prices[0])
          );
          shouldTrigger = priceDelta >= trigger.threshold;
        }
        break;

      case 'approaching_end':
        const daysUntilEnd = (new Date(market.end_date).getTime() - Date.now())
          / (1000 * 60 * 60 * 24);
        shouldTrigger = daysUntilEnd <= trigger.threshold && daysUntilEnd > 0;
        break;
    }

    if (shouldTrigger) {
      // Check daily limit
      const todayCount = await getTodayTriggerCount(env.DB, trigger.type);
      if (todayCount < trigger.maxPerDay) {
        await env.RESEARCH_QUEUE.send({
          marketId: market.id,
          technique: trigger.technique,
          reason: trigger.type,
        });
      }
    }
  }
}
```

---

## Notification System

### Notification Channels

```typescript
interface NotificationChannel {
  readonly type: string;
  readonly name: string;

  send(notification: Notification): Promise<boolean>;
  isConfigured(settings: Settings): boolean;
}

interface Notification {
  type: NotificationType;
  title: string;
  body: string;
  priority: 'high' | 'medium' | 'low';
  marketId?: string;
  evaluationId?: string;
  metadata?: Record<string, unknown>;
}

type NotificationType =
  | 'trade_recommendation'
  | 'research_complete'
  | 'market_resolved'
  | 'discovery_complete'
  | 'system_alert';
```

### Webhook Channel (Discord/Slack)

```typescript
class WebhookChannel implements NotificationChannel {
  readonly type = 'webhook';
  readonly name = 'Webhook';

  async send(notification: Notification, settings: Settings): Promise<boolean> {
    const webhookUrl = settings.notification_webhook_url;
    if (!webhookUrl) return false;

    // Detect webhook type by URL
    const isDiscord = webhookUrl.includes('discord.com/api/webhooks');
    const isSlack = webhookUrl.includes('hooks.slack.com');

    const payload = isDiscord
      ? this.formatDiscord(notification)
      : isSlack
        ? this.formatSlack(notification)
        : this.formatGeneric(notification);

    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    return response.ok;
  }

  private formatDiscord(n: Notification): object {
    const color = n.type === 'trade_recommendation' ? 0x00ff00 :
                  n.type === 'system_alert' ? 0xff0000 : 0x0099ff;

    return {
      embeds: [{
        title: n.title,
        description: n.body,
        color,
        timestamp: new Date().toISOString(),
        footer: { text: 'PunditKit v1.5' },
      }],
    };
  }

  private formatSlack(n: Notification): object {
    return {
      blocks: [
        {
          type: 'header',
          text: { type: 'plain_text', text: n.title },
        },
        {
          type: 'section',
          text: { type: 'mrkdwn', text: n.body },
        },
      ],
    };
  }

  isConfigured(settings: Settings): boolean {
    return !!settings.notification_webhook_url;
  }
}
```

### Email Channel

```typescript
class EmailChannel implements NotificationChannel {
  readonly type = 'email';
  readonly name = 'Email';

  async send(notification: Notification, settings: Settings): Promise<boolean> {
    const apiKey = settings.sendgrid_api_key;
    const toEmail = settings.notification_email;
    const fromEmail = settings.notification_from_email || 'pundit@example.com';

    if (!apiKey || !toEmail) return false;

    // Only send high-priority notifications via email
    if (notification.priority !== 'high') return true;

    const response = await fetch('https://api.sendgrid.com/v3/mail/send', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        personalizations: [{ to: [{ email: toEmail }] }],
        from: { email: fromEmail, name: 'PunditKit' },
        subject: `[PunditKit] ${notification.title}`,
        content: [{
          type: 'text/plain',
          value: notification.body,
        }],
      }),
    });

    return response.ok;
  }

  isConfigured(settings: Settings): boolean {
    return !!settings.sendgrid_api_key && !!settings.notification_email;
  }
}
```

### Notification Preferences

```typescript
interface NotificationPreferences {
  // Which notification types to send
  trade_recommendation: boolean;
  research_complete: boolean;
  market_resolved: boolean;
  discovery_complete: boolean;
  system_alert: boolean;

  // Minimum importance for each channel
  webhook_min_priority: 'high' | 'medium' | 'low';
  email_min_priority: 'high' | 'medium' | 'low';

  // Quiet hours (UTC)
  quiet_hours_start?: number;  // 0-23
  quiet_hours_end?: number;
}

// Default: trade recommendations via webhook, critical alerts via email
const DEFAULT_PREFERENCES: NotificationPreferences = {
  trade_recommendation: true,
  research_complete: false,
  market_resolved: true,
  discovery_complete: false,
  system_alert: true,

  webhook_min_priority: 'medium',
  email_min_priority: 'high',
};
```

---

## Performance Tracking (Learning System)

### Prediction Records

Every evaluation creates a prediction record:

```typescript
interface Prediction {
  id: string;
  market_id: string;
  evaluation_id: string;

  // What we predicted
  predicted_probability: number;
  predicted_direction: 'yes' | 'no' | null;
  confidence: 'high' | 'medium' | 'low';
  information_advantage: string;

  // Market state at prediction time
  market_odds_at_prediction: number;
  market_volume_at_prediction: number;

  // Resolution (filled later)
  actual_outcome: 'yes' | 'no' | null;
  resolved_at: string | null;

  // Calculated metrics (filled on resolution)
  brier_score: number | null;  // Lower is better
  calibration_bucket: string | null;  // e.g., "60-70%"
  was_correct: boolean | null;
  edge_captured: number | null;  // Actual vs predicted

  created_at: string;
}
```

### Recording Predictions

```typescript
async function recordPrediction(
  db: D1Database,
  market: Market,
  evaluation: Evaluation
): Promise<void> {
  const marketOdds = parseFloat(market.outcome_prices[0]);

  await db.prepare(`
    INSERT INTO predictions (
      id, market_id, evaluation_id,
      predicted_probability, predicted_direction, confidence, information_advantage,
      market_odds_at_prediction, market_volume_at_prediction,
      created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
  `).bind(
    crypto.randomUUID(),
    market.id,
    evaluation.id,
    evaluation.estimated_probability,
    evaluation.trade_direction,
    evaluation.confidence,
    evaluation.information_advantage,
    marketOdds,
    market.volume
  ).run();
}
```

### Recording Resolutions

```typescript
async function recordResolution(
  db: D1Database,
  marketId: string,
  resolution: Resolution
): Promise<void> {
  // Get all predictions for this market
  const predictions = await db.prepare(`
    SELECT * FROM predictions WHERE market_id = ? AND actual_outcome IS NULL
  `).bind(marketId).all();

  for (const pred of predictions.results) {
    // Brier score: (prediction - outcome)^2
    const outcome = resolution.outcome === 'yes' ? 1 : 0;
    const brierScore = Math.pow(pred.predicted_probability - outcome, 2);

    // Calibration bucket
    const bucket = Math.floor(pred.predicted_probability * 10) * 10;
    const calibrationBucket = `${bucket}-${bucket + 10}%`;

    // Was the directional prediction correct?
    const wasCorrect = pred.predicted_direction === resolution.outcome;

    // Edge captured (actual outcome vs market odds at prediction)
    const expectedValue = resolution.outcome === 'yes'
      ? 1 - pred.market_odds_at_prediction
      : pred.market_odds_at_prediction;
    const edgeCaptured = pred.predicted_direction === resolution.outcome
      ? expectedValue
      : -expectedValue;

    await db.prepare(`
      UPDATE predictions SET
        actual_outcome = ?,
        resolved_at = ?,
        brier_score = ?,
        calibration_bucket = ?,
        was_correct = ?,
        edge_captured = ?
      WHERE id = ?
    `).bind(
      resolution.outcome,
      resolution.resolvedAt.toISOString(),
      brierScore,
      calibrationBucket,
      wasCorrect ? 1 : 0,
      edgeCaptured,
      pred.id
    ).run();
  }
}
```

### Calibration Analysis

```typescript
interface CalibrationBucket {
  range: string;           // e.g., "60-70%"
  predictedAvg: number;    // Average predicted probability
  actualFrequency: number; // Actual outcome frequency
  count: number;           // Number of predictions
  deviation: number;       // |predicted - actual|
}

async function getCalibrationCurve(db: D1Database): Promise<CalibrationBucket[]> {
  const results = await db.prepare(`
    SELECT
      calibration_bucket as range,
      AVG(predicted_probability) as predicted_avg,
      AVG(CASE WHEN actual_outcome = 'yes' THEN 1.0 ELSE 0.0 END) as actual_frequency,
      COUNT(*) as count
    FROM predictions
    WHERE actual_outcome IS NOT NULL
    GROUP BY calibration_bucket
    ORDER BY calibration_bucket
  `).all();

  return results.results.map(r => ({
    range: r.range,
    predictedAvg: r.predicted_avg,
    actualFrequency: r.actual_frequency,
    count: r.count,
    deviation: Math.abs(r.predicted_avg - r.actual_frequency),
  }));
}
```

### Performance Dashboard Metrics

```typescript
interface PerformanceMetrics {
  // Overall
  totalPredictions: number;
  resolvedPredictions: number;

  // Accuracy
  avgBrierScore: number;        // Lower is better, 0.25 = random
  directionAccuracy: number;    // % of correct directional calls

  // Calibration
  calibrationError: number;     // Average deviation from perfect calibration
  calibrationCurve: CalibrationBucket[];

  // Alpha
  avgEdgeCaptured: number;      // Average edge on resolved predictions
  profitablePercent: number;    // % of trades that would have been profitable

  // By category
  byConfidence: {
    high: { count: number; accuracy: number; brier: number };
    medium: { count: number; accuracy: number; brier: number };
    low: { count: number; accuracy: number; brier: number };
  };

  byInfoAdvantage: {
    strong: { count: number; accuracy: number; brier: number };
    moderate: { count: number; accuracy: number; brier: number };
    weak: { count: number; accuracy: number; brier: number };
    none: { count: number; accuracy: number; brier: number };
  };

  // Trends
  brierScoreOverTime: { date: string; score: number }[];
  accuracyOverTime: { date: string; accuracy: number }[];
}

async function getPerformanceMetrics(db: D1Database): Promise<PerformanceMetrics> {
  // Implementation queries the predictions table and aggregates
  // ...
}
```

### Learning Insights

The system can surface actionable insights:

```typescript
interface LearningInsight {
  type: 'overconfidence' | 'underconfidence' | 'category_edge' | 'technique_quality';
  title: string;
  description: string;
  recommendation: string;
  confidence: number;
}

async function generateInsights(db: D1Database): Promise<LearningInsight[]> {
  const insights: LearningInsight[] = [];
  const metrics = await getPerformanceMetrics(db);

  // Overconfidence detection
  const highConfAccuracy = metrics.byConfidence.high.accuracy;
  if (highConfAccuracy < 0.7 && metrics.byConfidence.high.count > 10) {
    insights.push({
      type: 'overconfidence',
      title: 'High-confidence predictions underperforming',
      description: `High-confidence predictions are only ${(highConfAccuracy * 100).toFixed(0)}% accurate`,
      recommendation: 'Consider raising the bar for "high confidence" classification',
      confidence: 0.8,
    });
  }

  // Information advantage validation
  const strongAdvantageAccuracy = metrics.byInfoAdvantage.strong.accuracy;
  const noneAdvantageAccuracy = metrics.byInfoAdvantage.none.accuracy;
  if (strongAdvantageAccuracy <= noneAdvantageAccuracy + 0.1) {
    insights.push({
      type: 'category_edge',
      title: '"Strong" info advantage not translating to edge',
      description: 'Markets where we claimed strong advantage performed similarly to those with none',
      recommendation: 'Review what qualifies as "strong" information advantage',
      confidence: 0.7,
    });
  }

  // ... more insight detection

  return insights;
}
```

---

## Data Model

### Complete Schema (v1.5)

```sql
-- Core tables from v1.1 (preserved)
-- See PunditKit.v1.1.md for: settings, events, markets, research_paths,
-- research_sources, evaluations, trades, journal_entries, daily_snapshots,
-- artifacts, prompts

-- ==========================================
-- NEW TABLES FOR v1.5
-- ==========================================

-- Platform configurations
CREATE TABLE IF NOT EXISTS platforms (
  slug TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  is_enabled BOOLEAN DEFAULT TRUE,
  requires_auth BOOLEAN DEFAULT FALSE,
  can_trade BOOLEAN DEFAULT FALSE,
  credentials TEXT,                    -- Encrypted JSON
  last_synced TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- Predictions for learning system
CREATE TABLE IF NOT EXISTS predictions (
  id TEXT PRIMARY KEY,
  market_id TEXT NOT NULL REFERENCES markets(id),
  evaluation_id TEXT REFERENCES evaluations(id),

  -- What we predicted
  predicted_probability REAL NOT NULL,
  predicted_direction TEXT,            -- 'yes' | 'no'
  confidence TEXT,                     -- 'high' | 'medium' | 'low'
  information_advantage TEXT,          -- 'none' | 'weak' | 'moderate' | 'strong'

  -- Market state at prediction
  market_odds_at_prediction REAL,
  market_volume_at_prediction REAL,

  -- Resolution (filled later)
  actual_outcome TEXT,                 -- 'yes' | 'no'
  resolved_at TEXT,

  -- Calculated metrics
  brier_score REAL,
  calibration_bucket TEXT,
  was_correct BOOLEAN,
  edge_captured REAL,

  created_at TEXT DEFAULT (datetime('now'))
);

-- Notification configurations
CREATE TABLE IF NOT EXISTS notification_channels (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,                  -- 'webhook' | 'email'
  name TEXT NOT NULL,
  config TEXT NOT NULL,                -- JSON configuration
  is_enabled BOOLEAN DEFAULT TRUE,
  min_priority TEXT DEFAULT 'medium',  -- 'high' | 'medium' | 'low'
  created_at TEXT DEFAULT (datetime('now'))
);

-- Notification history
CREATE TABLE IF NOT EXISTS notification_history (
  id TEXT PRIMARY KEY,
  channel_id TEXT REFERENCES notification_channels(id),
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT,
  priority TEXT,
  market_id TEXT REFERENCES markets(id),
  was_sent BOOLEAN DEFAULT FALSE,
  error_message TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

-- Research triggers configuration
CREATE TABLE IF NOT EXISTS research_triggers (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,                  -- 'volume_spike' | 'price_movement' | etc.
  threshold REAL NOT NULL,
  technique TEXT NOT NULL,
  max_per_day INTEGER DEFAULT 10,
  is_enabled BOOLEAN DEFAULT TRUE,
  created_at TEXT DEFAULT (datetime('now'))
);

-- Scheduled task history
CREATE TABLE IF NOT EXISTS scheduled_task_runs (
  id TEXT PRIMARY KEY,
  task_name TEXT NOT NULL,
  started_at TEXT NOT NULL,
  completed_at TEXT,
  status TEXT DEFAULT 'running',       -- 'running' | 'completed' | 'failed'
  result TEXT,                         -- JSON summary
  error_message TEXT
);

-- Research quality scores (extends research_paths)
-- Added via ALTER TABLE in migration
-- quality_score INTEGER
-- source_count INTEGER
-- source_diversity REAL
-- recency_score REAL

-- Market resolutions (extends markets)
-- Added via ALTER TABLE in migration
-- resolved_outcome TEXT
-- resolved_at TEXT
-- resolution_source TEXT

-- Indexes for new tables
CREATE INDEX IF NOT EXISTS idx_predictions_market_id ON predictions(market_id);
CREATE INDEX IF NOT EXISTS idx_predictions_resolved ON predictions(actual_outcome);
CREATE INDEX IF NOT EXISTS idx_predictions_created ON predictions(created_at);
CREATE INDEX IF NOT EXISTS idx_notification_history_created ON notification_history(created_at);
CREATE INDEX IF NOT EXISTS idx_scheduled_task_runs_task ON scheduled_task_runs(task_name);
```

### Migration Script

```sql
-- migrations/v1.5.sql

-- Add quality scoring to research_paths
ALTER TABLE research_paths ADD COLUMN quality_score INTEGER;
ALTER TABLE research_paths ADD COLUMN source_count INTEGER;
ALTER TABLE research_paths ADD COLUMN source_diversity REAL;
ALTER TABLE research_paths ADD COLUMN recency_score REAL;

-- Add resolution tracking to markets
ALTER TABLE markets ADD COLUMN resolved_outcome TEXT;
ALTER TABLE markets ADD COLUMN resolved_at TEXT;
ALTER TABLE markets ADD COLUMN resolution_source TEXT;

-- Create new tables
-- (full CREATE TABLE statements from above)

-- Seed default platforms
INSERT INTO platforms (slug, name, is_enabled, requires_auth, can_trade) VALUES
  ('polymarket', 'Polymarket', TRUE, FALSE, FALSE),
  ('kalshi', 'Kalshi', FALSE, TRUE, TRUE),
  ('metaculus', 'Metaculus', FALSE, FALSE, FALSE),
  ('custom', 'Custom', TRUE, FALSE, FALSE);

-- Seed default research triggers
INSERT INTO research_triggers (id, type, threshold, technique, max_per_day) VALUES
  ('trigger-volume', 'volume_spike', 2.0, 'quick_search', 10),
  ('trigger-enddate', 'approaching_end', 7, 'deep_research', 5),
  ('trigger-stale', 'stale_research', 7, 'quick_search', 20);
```

---

## API Reference

### Core Endpoints (from v1.1)

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/health` | GET | Health check |
| `/markets` | GET | List markets |
| `/markets/:id` | GET | Get market details |
| `/research` | GET | List research paths |
| `/research/spawn` | POST | Start research |
| `/evaluations` | GET | List evaluations |
| `/trades` | GET/POST | List or log trades |
| `/settings` | GET/POST | Configuration |
| `/prompts` | GET/POST/PUT/DELETE | Prompt management |

### New v1.5 Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/platforms` | GET | List configured platforms |
| `/platforms/:slug` | GET/PUT | Get or update platform |
| `/platforms/:slug/sync` | POST | Trigger platform sync |
| `/predictions` | GET | List predictions |
| `/predictions/metrics` | GET | Get performance metrics |
| `/predictions/calibration` | GET | Get calibration curve |
| `/predictions/insights` | GET | Get learning insights |
| `/notifications/channels` | GET/POST | Manage notification channels |
| `/notifications/test` | POST | Send test notification |
| `/notifications/history` | GET | View notification history |
| `/triggers` | GET/POST/PUT | Manage research triggers |
| `/scheduled/history` | GET | View scheduled task runs |
| `/scheduled/run` | POST | Manually trigger scheduled task |

### Example: Get Performance Metrics

```bash
curl https://your-worker.workers.dev/predictions/metrics

# Response
{
  "totalPredictions": 156,
  "resolvedPredictions": 89,
  "avgBrierScore": 0.18,
  "directionAccuracy": 0.67,
  "calibrationError": 0.08,
  "byConfidence": {
    "high": { "count": 23, "accuracy": 0.78, "brier": 0.14 },
    "medium": { "count": 45, "accuracy": 0.64, "brier": 0.19 },
    "low": { "count": 21, "accuracy": 0.57, "brier": 0.22 }
  },
  "byInfoAdvantage": {
    "strong": { "count": 8, "accuracy": 0.88, "brier": 0.10 },
    "moderate": { "count": 19, "accuracy": 0.74, "brier": 0.16 },
    "weak": { "count": 34, "accuracy": 0.62, "brier": 0.20 },
    "none": { "count": 28, "accuracy": 0.54, "brier": 0.24 }
  }
}
```

---

## UI/UX

### Navigation Structure

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  PunditKit                              [Settings] [Notifications 🔔]       │
├─────────────────────────────────────────────────────────────────────────────┤
│  Pipeline │ Dashboard │ Performance │ Playground                            │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Pipeline View (from v1.1)

Kanban-style market flow:
- **Watching** → **Researching** → **Evaluated** → **Traded**

### Dashboard View (NEW)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  Dashboard                                            Last sync: 2 min ago  │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐              │
│  │ Markets         │  │ Research        │  │ Evaluations     │              │
│  │      127        │  │      23         │  │      45         │              │
│  │ across 2 plat.  │  │ running: 3      │  │ recommend: 8    │              │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘              │
│                                                                              │
│  ┌─ Trade Recommendations ────────────────────────────────────────────────┐ │
│  │                                                                         │ │
│  │  📈 BUY YES  Trump talks to Xi before Jan 1                            │ │
│  │     Moderate advantage • +27% edge • 2.5% position                     │ │
│  │                                                                  [View] │ │
│  │  ─────────────────────────────────────────────────────────────────────  │ │
│  │  📈 BUY NO   Fed cuts rates in January                                 │ │
│  │     Weak advantage • +8% edge • 0.8% position                          │ │
│  │                                                                  [View] │ │
│  └─────────────────────────────────────────────────────────────────────────┘ │
│                                                                              │
│  ┌─ System Status ────────────────────────────────────────────────────────┐ │
│  │  Platforms:  ● Polymarket (127)  ○ Kalshi (disabled)  ● Custom (3)     │ │
│  │  Last Tasks: Daily discovery ✓ 6:00 AM  •  Stale check ✓ 12:00 PM      │ │
│  │  API Usage:  Claude: 1,247 tokens  •  Gemini: 3 deep research          │ │
│  └─────────────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Performance View (NEW)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  Performance                                         Period: [Last 90 days] │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐              │
│  │ Brier Score     │  │ Direction Acc   │  │ Calibration     │              │
│  │     0.18        │  │     67%         │  │     ±8%         │              │
│  │ (lower=better)  │  │ (random=50%)    │  │ error           │              │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘              │
│                                                                              │
│  ┌─ Calibration Curve ────────────────────────────────────────────────────┐ │
│  │                                                                         │ │
│  │  100% │                                              ●                  │ │
│  │       │                                    ●                            │ │
│  │   75% │                          ●                                      │ │
│  │       │                ●   ●                              ─── Predicted │ │
│  │   50% │          ●                                        ─── Actual    │ │
│  │       │    ●                                              ─── Perfect   │ │
│  │   25% │●                                                                │ │
│  │       └────────────────────────────────────────────────────────────     │ │
│  │         10%   20%   30%   40%   50%   60%   70%   80%   90%             │ │
│  │                        Predicted Probability                            │ │
│  └─────────────────────────────────────────────────────────────────────────┘ │
│                                                                              │
│  ┌─ Insights ─────────────────────────────────────────────────────────────┐ │
│  │  ⚠️ High-confidence predictions underperforming (72% vs expected 85%+) │ │
│  │  ✓ "Strong" info advantage correlates with better outcomes (+22%)      │ │
│  │  💡 Political markets showing best calibration (±4% error)             │ │
│  └─────────────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Mobile Responsive

All views adapt to mobile:

```
┌─────────────────────┐
│  PunditKit    [☰]   │
├─────────────────────┤
│  Pipeline           │
│  ┌─ Tabs ─────────┐ │
│  │Watch│Res│Eval│T│ │
│  └────────────────┘ │
│                     │
│  📈 Trump/Xi call   │
│  +27% edge • BUY    │
│  [View Details]     │
│  ───────────────    │
│  📈 Fed rates       │
│  +8% edge • BUY NO  │
│  [View Details]     │
│                     │
└─────────────────────┘
```

---

## Extension Guide

### Adding a New Platform

1. **Create adapter file:**

```typescript
// src/adapters/newplatform.ts
import { PlatformAdapter, Market, DiscoveryFilters } from '../types';

export class NewPlatformAdapter implements PlatformAdapter {
  readonly name = 'New Platform';
  readonly slug = 'newplatform';
  readonly canTrade = false;

  async discoverMarkets(filters: DiscoveryFilters): Promise<Market[]> {
    // Implement API calls
  }

  // ... implement other methods
}
```

2. **Register adapter:**

```typescript
// src/adapters/index.ts
import { NewPlatformAdapter } from './newplatform';

// Add to switch statement in createAdapter()
case 'newplatform': return new NewPlatformAdapter();

// Add to SUPPORTED_PLATFORMS array
{ slug: 'newplatform', name: 'New Platform', requiresAuth: false, canTrade: false },
```

3. **Add to database:**

```sql
INSERT INTO platforms (slug, name, is_enabled, requires_auth, can_trade)
VALUES ('newplatform', 'New Platform', TRUE, FALSE, FALSE);
```

### Adding a New Research Technique

1. **Create technique file:**

```typescript
// src/research/techniques/newtechnique.ts
import { ResearchTechnique, ResearchResult, ResearchContext } from '../types';

export class NewTechnique implements ResearchTechnique {
  readonly name = 'New Technique';
  readonly slug = 'new_technique';
  readonly estimatedDuration = 60;  // seconds
  readonly requiresApiKey = 'new_api_key';

  async execute(
    query: string,
    context: ResearchContext
  ): Promise<ResearchResult> {
    // Implement research logic
  }

  isAvailable(settings: Settings): boolean {
    return !!settings[this.requiresApiKey];
  }
}
```

2. **Register technique:**

```typescript
// src/research/index.ts
import { NewTechnique } from './techniques/newtechnique';

export const RESEARCH_TECHNIQUES = [
  new DeepResearchTechnique(),
  new QuickSearchTechnique(),
  new AnalysisTechnique(),
  new NewTechnique(),  // Add here
];
```

### Adding a Notification Channel

1. **Create channel file:**

```typescript
// src/notifications/channels/newchannel.ts
import { NotificationChannel, Notification } from '../types';

export class NewChannel implements NotificationChannel {
  readonly type = 'newchannel';
  readonly name = 'New Channel';

  async send(notification: Notification, settings: Settings): Promise<boolean> {
    // Implement notification sending
  }

  isConfigured(settings: Settings): boolean {
    return !!settings.newchannel_config;
  }
}
```

2. **Register channel:**

```typescript
// src/notifications/index.ts
import { NewChannel } from './channels/newchannel';

export const NOTIFICATION_CHANNELS = [
  new WebhookChannel(),
  new EmailChannel(),
  new NewChannel(),  // Add here
];
```

---

## Deployment

### Prerequisites

- Cloudflare account
- `wrangler` CLI installed
- API keys ready (Claude, Gemini)

### Agent-Guided Deployment (Recommended)

```bash
cd MOSSKits/PunditKit/demo

# Tell your AI agent:
"Deploy PunditKit v1.5 to my Cloudflare account.
Create all necessary resources and run migrations."
```

### Manual Deployment

```bash
# 1. Create resources
npx wrangler d1 create pundit-db
npx wrangler r2 bucket create pundit-artifacts
npx wrangler queues create pundit-research

# 2. Update wrangler.toml with database_id

# 3. Deploy agent
cd agent
npm install
npx wrangler d1 execute pundit-db --remote --file=./schema.sql
npx wrangler d1 execute pundit-db --remote --file=./migrations/v1.5.sql
npx wrangler deploy

# 4. Deploy portal
cd ../portal
npm install && npm run build
npx wrangler pages deploy dist --project-name=pundit-hq
```

### Production Checklist

- [ ] API keys configured in Settings
- [ ] At least one platform enabled
- [ ] Notification channel configured (recommended)
- [ ] Research triggers reviewed
- [ ] Cron triggers enabled in wrangler.toml
- [ ] Custom domain configured (optional)

### Monitoring

PunditKit logs to journal_entries and scheduled_task_runs. Monitor via:

1. **Portal Dashboard** - System status section
2. **Cloudflare Dashboard** - Worker metrics, queue depth
3. **API** - `/scheduled/history` for task run logs

### Cost Optimization

| Resource | Free Tier | Typical Usage |
|----------|-----------|---------------|
| Workers | 100k req/day | ~1-5k req/day |
| D1 | 5M rows read/day | ~10-50k rows/day |
| Queues | 1M operations/month | ~1-10k ops/day |
| R2 | 10GB storage | ~100MB |

v1.5's smart polling and autonomous scheduling keeps usage well within free tier for most deployments.

---

## Project Structure

```
PunditKit/
├── PunditKit.v1.5.md           # This spec
├── PunditKit.v1.1.md           # Previous spec (reference)
├── PunditKit.md                # Original spec (reference)
├── working-docs/               # Session logs, learnings
└── demo/
    ├── agent/
    │   ├── src/
    │   │   ├── index.ts        # Worker API + scheduled handlers
    │   │   ├── types.ts        # TypeScript interfaces
    │   │   ├── adapters/       # Platform adapters
    │   │   │   ├── index.ts
    │   │   │   ├── polymarket.ts
    │   │   │   ├── kalshi.ts
    │   │   │   ├── metaculus.ts
    │   │   │   └── custom.ts
    │   │   ├── research/       # Research system
    │   │   │   ├── index.ts
    │   │   │   ├── techniques/
    │   │   │   │   ├── deep-research.ts
    │   │   │   │   ├── quick-search.ts
    │   │   │   │   └── analysis.ts
    │   │   │   └── quality.ts  # Quality scoring
    │   │   ├── evaluation/     # Evaluation system
    │   │   │   ├── analyst.ts
    │   │   │   ├── position.ts
    │   │   │   └── categories.ts
    │   │   ├── notifications/  # Notification system
    │   │   │   ├── index.ts
    │   │   │   └── channels/
    │   │   ├── learning/       # Performance tracking
    │   │   │   ├── predictions.ts
    │   │   │   ├── calibration.ts
    │   │   │   └── insights.ts
    │   │   ├── scheduled/      # Autonomous operations
    │   │   │   ├── discovery.ts
    │   │   │   ├── resolution.ts
    │   │   │   └── stale.ts
    │   │   └── chronicler.ts   # Journaling
    │   ├── schema.sql          # Base schema
    │   ├── migrations/
    │   │   └── v1.5.sql        # v1.5 additions
    │   └── wrangler.toml
    └── portal/
        ├── src/
        │   ├── App.tsx
        │   ├── views/
        │   │   ├── Pipeline.tsx
        │   │   ├── Dashboard.tsx
        │   │   ├── Performance.tsx
        │   │   └── Playground.tsx
        │   └── components/
        └── package.json
```

---

## Roadmap

### v1.5 (This Release)
- [x] Multi-platform architecture
- [x] Autonomous operations (Cron)
- [x] Performance tracking / learning system
- [x] Notification system
- [x] Research quality scoring
- [x] Extension framework

### v2.0 (Future)
- [ ] Automated trade execution (Playwriter integration)
- [ ] Backtesting framework
- [ ] Social features (share predictions, follow analysts)
- [ ] WebSocket real-time updates
- [ ] Multi-user / team support

### Community Contributions Welcome
- Additional platform adapters
- New research techniques
- Notification channels
- UI improvements
- Documentation translations

---

## Lessons Learned

### From v1.0 to v1.5

1. **API-First Beats Scraping** - Gamma API is reliable; DOM scraping is fragile.

2. **The Market Is Usually Right** - Mechanical edge comparison doesn't work. Seek genuine alpha.

3. **Save State for Resumability** - Long operations need checkpoints. Store interaction IDs immediately.

4. **Modular Architecture Scales** - Platform adapters, research techniques, notification channels—all pluggable.

5. **Learning Requires Data** - Can't improve without tracking predictions and resolutions.

6. **Autonomous ≠ Uncontrolled** - Scheduled operations with clear triggers and limits.

7. **Simplicity First** - Start with one platform, add complexity as needed.

---

## License

MIT — Use it however you want.

---

## Contributing

PRs welcome. For new platforms, research techniques, or notification channels:

1. Follow the extension guide patterns
2. Include tests
3. Update documentation
4. Open PR with clear description

For major architectural changes, open an issue first.

---

*Learn from every prediction. Trade only with genuine edge. Improve over time.*
