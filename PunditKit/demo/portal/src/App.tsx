import { useState, useEffect, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import {
  Eye, Search, CheckCircle, XCircle, Activity, BookOpen,
  Settings, RefreshCw, ChevronRight, TrendingUp,
  TrendingDown, AlertCircle, Clock, DollarSign, Target,
  Zap, BarChart3, ExternalLink, Play, FlaskConical, Star,
  Plus, Trash2, Save, ChevronDown, Loader2, Scale
} from 'lucide-react';
import { cn, formatCurrency, formatDateTime, getRelativeTime } from '@/lib/utils';

// =============================================================================
// Types
// =============================================================================

type View = 'dashboard' | 'markets' | 'trades' | 'journal' | 'settings' | 'playground';
type MarketStatus = 'watching' | 'researching' | 'traded' | 'closed';
type WorkflowTab = 'watching' | 'researching' | 'evaluated' | 'traded';
type TradeStatus = 'pending' | 'executed' | 'settled' | 'cancelled';
type AgentType = 'scout' | 'researcher' | 'analyst' | 'trader' | 'chronicler' | 'system';

// Event - Groups related markets
interface Event {
  id: string;
  slug: string;
  title: string;
  image: string | null;
  market_count: number;
  created_at: string;
  updated_at: string;
}

interface Market {
  id: string;
  platform: string;
  gamma_id: string | null;
  condition_id: string | null;
  slug: string | null;
  event_id: string | null;
  question: string;
  description: string | null;
  image: string | null;
  outcomes: string;           // JSON array: '["Yes", "No"]'
  outcome_prices: string;     // JSON array: '["0.65", "0.35"]'
  volume: number | null;
  volume_24hr: number | null;
  liquidity: number | null;
  one_day_price_change: number | null;
  one_week_price_change: number | null;
  competitive: number | null;
  end_date: string | null;
  status: MarketStatus;
  last_synced: string;
  created_at: string;
  updated_at: string;
}

type ResearchTechnique = 'deep_research' | 'quick_search' | 'analysis';

interface ResearchPath {
  id: string;
  market_id: string;
  query: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  summary: string | null;
  key_facts: string | null;
  contradictions: string | null;
  error_message: string | null;
  model: string | null;
  prompt_id: string | null;
  technique: ResearchTechnique | null;
  duration_seconds: number | null;
  // Progress tracking
  poll_count: number | null;
  last_polled_at: string | null;
  started_at: string | null;
  created_at: string;
  completed_at: string | null;
}

interface Trade {
  id: string;
  market_id: string;
  evaluation_id: string | null;
  direction: 'yes' | 'no';
  size: number;
  entry_odds: number;
  exit_odds: number | null;
  status: TradeStatus;
  pnl: number | null;
  executed_at: string | null;
  created_at: string;
}

interface JournalEntry {
  id: string;
  agent: AgentType;
  action: string;
  reasoning: string | null;
  context: string | null;
  market_id: string | null;
  timestamp: string;
}

interface DailySnapshot {
  date: string;
  markets_scanned: number;
  research_completed: number;
  trades_executed: number;
  total_pnl: number;
}

type ConfidenceLevel = 'high' | 'medium' | 'low';
type InformationAdvantage = 'none' | 'weak' | 'moderate' | 'strong';

interface Evaluation {
  id: string;
  market_id: string;
  // Legacy scoring fields
  source_authenticity: number;
  confidence_level: number;
  sizing_factor: number;
  composite_edge: number;
  estimated_probability: number;
  recommended_position: number;
  reasoning: string;
  research_path_ids: string;
  // Rich evaluation fields
  confidence: ConfidenceLevel | null;
  base_rate_estimate: string | null;
  base_rate_reasoning: string | null;
  key_factors_yes: string | null;  // JSON array
  key_factors_no: string | null;   // JSON array
  main_uncertainty: string | null;
  market_comparison: string | null;
  // Alpha-seeking fields
  recommend_trade: boolean | null;
  trade_direction: 'yes' | 'no' | null;
  information_advantage: InformationAdvantage | null;
  market_inefficiency: string | null;
  trade_thesis: string | null;
  model: string | null;
  prompt_id: string | null;
  evaluated_at: string;
}

interface Settings {
  claude_api_key?: string;
  gemini_api_key?: string;
  playwriter_url?: string;
  max_position_percent?: string;
  max_daily_trades?: string;
  min_edge_threshold?: string;
  min_confidence?: string;
  platforms?: string;
  bankroll?: string;
}

type PromptStage = 'research' | 'evaluation';

interface Prompt {
  id: string;
  stage: PromptStage;
  name: string;
  system_prompt: string | null;
  user_prompt: string;
  model: string;
  temperature: number;
  max_tokens: number;
  is_active: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

// Model options for the playground
const RESEARCH_MODELS = [
  { id: 'deep-research-pro-preview-12-2025', name: 'Deep Research Pro', speed: '2-5 min', description: 'Comprehensive autonomous research' },
  { id: 'gemini-3-pro-preview', name: 'Gemini 3 Pro', speed: '10-30 sec', description: 'Fast research with Google grounding' },
];

const EVALUATION_MODELS = [
  { id: 'claude-opus-4-5-20251101', name: 'Claude Opus 4.5', speed: '30-60 sec', description: 'Best reasoning, best calibration' },
  { id: 'claude-sonnet-4-20250514', name: 'Claude Sonnet 4', speed: '5-10 sec', description: 'Faster iteration' },
];

// Research technique display info
const RESEARCH_TECHNIQUES: Record<ResearchTechnique, { name: string; speed: string; description: string }> = {
  deep_research: { name: 'Deep Research Pro', speed: '2-5 min', description: 'Comprehensive multi-step research' },
  quick_search: { name: 'Gemini 3 Pro', speed: '10-30 sec', description: 'Fast research with Google grounding' },
  analysis: { name: 'Claude Analysis', speed: '30-60 sec', description: 'Synthesize existing research' },
};

// =============================================================================
// API Configuration
// =============================================================================

// Always use deployed Worker - local dev still needs Playwriter for scanning
const API_URL = 'https://pundit-agent.gentle-disk-2e8a.workers.dev';

// =============================================================================
// Main App Component
// =============================================================================

// Sort modes for markets view
type SortMode = 'volume' | 'activity' | 'ending_soon' | 'competitive' | 'edge';
type ViewMode = 'flat' | 'grouped';

export default function App() {
  const [view, setView] = useState<View>('dashboard');
  const [markets, setMarkets] = useState<Market[]>([]);
  const [events, setEvents] = useState<Event[]>([]);
  const [researchPaths, setResearchPaths] = useState<ResearchPath[]>([]);
  const [trades, setTrades] = useState<Trade[]>([]);
  const [evaluations, setEvaluations] = useState<Evaluation[]>([]);
  const [journal, setJournal] = useState<JournalEntry[]>([]);
  const [snapshots, setSnapshots] = useState<DailySnapshot[]>([]);
  const [settings, setSettings] = useState<Settings>({});
  const [prompts, setPrompts] = useState<Prompt[]>([]);
  const [showSettings, setShowSettings] = useState(false);
  const [showLogTrade, setShowLogTrade] = useState<Evaluation | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [autoMode, setAutoMode] = useState(() => localStorage.getItem('pundit_auto_mode') === 'true');
  const [sortMode, setSortMode] = useState<SortMode>(() => (localStorage.getItem('pundit_sort_mode') as SortMode) || 'volume');
  const [viewMode, setViewMode] = useState<ViewMode>(() => (localStorage.getItem('pundit_view_mode') as ViewMode) || 'flat');

  // Persist preferences
  useEffect(() => {
    localStorage.setItem('pundit_auto_mode', autoMode.toString());
  }, [autoMode]);

  useEffect(() => {
    localStorage.setItem('pundit_sort_mode', sortMode);
  }, [sortMode]);

  useEffect(() => {
    localStorage.setItem('pundit_view_mode', viewMode);
  }, [viewMode]);

  // Fetch data
  const fetchData = useCallback(async () => {
    try {
      const [marketsRes, eventsRes, researchRes, tradesRes, evalsRes, journalRes, snapshotsRes, settingsRes, promptsRes] = await Promise.all([
        fetch(`${API_URL}/markets?limit=500`),
        fetch(`${API_URL}/events`),
        fetch(`${API_URL}/research`),
        fetch(`${API_URL}/trades`),
        fetch(`${API_URL}/evaluations`),
        fetch(`${API_URL}/journal?limit=50`),
        fetch(`${API_URL}/snapshots?limit=7`),
        fetch(`${API_URL}/settings`),
        fetch(`${API_URL}/prompts`)
      ]);

      if (marketsRes.ok) setMarkets(await marketsRes.json());
      if (eventsRes.ok) setEvents(await eventsRes.json());
      if (researchRes.ok) setResearchPaths(await researchRes.json());
      if (tradesRes.ok) setTrades(await tradesRes.json());
      if (evalsRes.ok) setEvaluations(await evalsRes.json());
      if (journalRes.ok) setJournal(await journalRes.json());
      if (snapshotsRes.ok) setSnapshots(await snapshotsRes.json());
      if (settingsRes.ok) setSettings(await settingsRes.json());
      if (promptsRes.ok) setPrompts(await promptsRes.json());
    } catch (err) {
      console.error('Failed to fetch data:', err);
    }
  }, []);

  // Smart polling: fast when research is active, slow when idle
  const hasActiveResearch = researchPaths.some(r => r.status === 'running' || r.status === 'pending');
  const pollInterval = hasActiveResearch ? 5000 : 30000; // 5s when active, 30s when idle

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    const interval = setInterval(fetchData, pollInterval);
    return () => clearInterval(interval);
  }, [fetchData, pollInterval]);

  // Actions
  // Sync markets from Polymarket via Worker (Worker fetches from Gamma API to avoid CORS)
  const syncMarkets = async () => {
    setIsLoading(true);
    setError(null);

    try {
      // Call Worker endpoint which fetches from Gamma API (avoids CORS)
      const response = await fetch(`${API_URL}/markets/sync-from-gamma`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || 'Sync failed');
      }

      const result = await response.json();
      console.log(`Synced: ${result.created} created, ${result.updated} updated, ${result.total} total`);

      await fetchData(); // Refresh UI
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sync failed');
      console.error('Sync error:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const spawnResearch = async (marketId: string, withEvaluation: boolean = false, technique: ResearchTechnique = 'deep_research') => {
    console.log('[spawnResearch] Called with:', { marketId, withEvaluation, technique });
    setIsLoading(true);
    setError(null);
    try {
      console.log('[spawnResearch] Fetching:', `${API_URL}/research/spawn`);
      const res = await fetch(`${API_URL}/research/spawn`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          market_id: marketId,
          auto_evaluate: withEvaluation || autoMode,
          technique
        })
      });
      const data = await res.json();
      console.log('[spawnResearch] Response:', res.status, data);
      if (!res.ok) throw new Error(data.error || data.message);
      await fetchData();
    } catch (err) {
      console.error('[spawnResearch] Error:', err);
      setError(err instanceof Error ? err.message : 'Research spawn failed');
    } finally {
      setIsLoading(false);
    }
  };

  const runEvaluation = async (marketId: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_URL}/evaluations/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ market_id: marketId })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || data.message);
      await fetchData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Evaluation failed');
    } finally {
      setIsLoading(false);
    }
  };

  const saveSettings = async (newSettings: Settings) => {
    setIsLoading(true);
    try {
      const res = await fetch(`${API_URL}/settings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newSettings)
      });
      if (res.ok) {
        setSettings({ ...settings, ...newSettings });
        setShowSettings(false);
      }
    } catch (err) {
      console.error('Failed to save settings:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const logTrade = async (evaluation: Evaluation, direction: 'yes' | 'no', size: number, entryOdds: number, txHash?: string) => {
    setIsLoading(true);
    try {
      const res = await fetch(`${API_URL}/trades/execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          market_id: evaluation.market_id,
          evaluation_id: evaluation.id,
          direction,
          size,
          entry_odds: entryOdds,
          tx_hash: txHash,
          manual: true
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to log trade');
      setShowLogTrade(null);
      await fetchData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to log trade');
    } finally {
      setIsLoading(false);
    }
  };

  // Computed values
  const tradedCount = markets.filter(m => m.status === 'traded').length;

  // Trade recommendations: evaluations where AI recommends trade AND we haven't traded yet
  const tradedMarketIds = new Set(trades.map(t => t.market_id));
  const tradeRecommendations = evaluations.filter(e =>
    e.recommend_trade === true &&
    !tradedMarketIds.has(e.market_id)
  );

  const todayPnl = trades
    .filter(t => t.pnl !== null && t.executed_at?.startsWith(new Date().toISOString().split('T')[0]))
    .reduce((sum, t) => sum + (t.pnl || 0), 0);

  const totalPnl = trades
    .filter(t => t.pnl !== null)
    .reduce((sum, t) => sum + (t.pnl || 0), 0);

  const winRate = trades.filter(t => t.status === 'settled').length > 0
    ? (trades.filter(t => t.pnl !== null && t.pnl > 0).length / trades.filter(t => t.status === 'settled').length) * 100
    : 0;

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="h-14 border-b border-border flex items-center justify-between px-4">
        <div className="flex items-center gap-3">
          <div className="flex gap-1.5">
            <div className="w-3 h-3 rounded-full bg-destructive/80" />
            <div className="w-3 h-3 rounded-full bg-warning/80" />
            <div className="w-3 h-3 rounded-full bg-success/80" />
          </div>
          <span className="font-semibold text-lg">Pundit HQ</span>
          <span className="text-xs text-muted-foreground px-2 py-0.5 bg-muted rounded">v1.0</span>
        </div>

        <div className="flex items-center gap-2">
          {error && (
            <div className="flex items-center gap-2 text-sm text-destructive bg-destructive/10 px-3 py-1.5 rounded">
              <AlertCircle className="w-4 h-4" />
              {error}
              <button onClick={() => setError(null)} className="ml-2 hover:text-destructive/80">
                <XCircle className="w-4 h-4" />
              </button>
            </div>
          )}
          {/* Auto Mode Toggle */}
          <button
            onClick={() => setAutoMode(!autoMode)}
            className={cn(
              "flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm transition-colors border",
              autoMode
                ? "bg-success/20 border-success/50 text-success"
                : "bg-muted border-border text-muted-foreground hover:text-foreground"
            )}
            title={autoMode ? "Auto Mode ON: Research auto-triggers evaluation" : "Auto Mode OFF: Manual evaluation required"}
          >
            <Play className={cn("w-3 h-3", autoMode && "fill-current")} />
            Auto
          </button>
          <button
            onClick={fetchData}
            className="p-2 hover:bg-muted rounded-lg transition-colors"
            title="Refresh"
          >
            <RefreshCw className={cn("w-4 h-4", isLoading && "animate-spin")} />
          </button>
          <button
            onClick={() => setShowSettings(true)}
            className="p-2 hover:bg-muted rounded-lg transition-colors"
            title="Settings"
          >
            <Settings className="w-4 h-4" />
          </button>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <aside className="w-60 border-r border-border flex flex-col">
          <nav className="flex-1 p-3 space-y-6">
            {/* Dashboard */}
            <div>
              <button
                onClick={() => setView('dashboard')}
                className={cn(
                  "w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors",
                  view === 'dashboard' ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                )}
              >
                <BarChart3 className="w-4 h-4" />
                Dashboard
              </button>
            </div>

            {/* Pipeline */}
            <div className="space-y-1">
              <div className="px-3 py-1 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Pipeline
              </div>
              <button
                onClick={() => setView('markets')}
                className={cn(
                  "w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm transition-colors",
                  view === 'markets' ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                )}
              >
                <div className="flex items-center gap-3">
                  <Activity className="w-4 h-4" />
                  Markets
                </div>
                <span className="text-xs bg-muted px-1.5 py-0.5 rounded">{markets.length}</span>
              </button>
              <button
                onClick={() => setView('trades')}
                className={cn(
                  "w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm transition-colors",
                  view === 'trades' ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                )}
              >
                <div className="flex items-center gap-3">
                  <DollarSign className="w-4 h-4" />
                  Trade History
                </div>
                <span className="text-xs bg-muted text-muted-foreground px-1.5 py-0.5 rounded">{tradedCount}</span>
              </button>
            </div>

            {/* Activity */}
            <div className="space-y-1">
              <div className="px-3 py-1 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Activity
              </div>
              <button
                onClick={() => setView('journal')}
                className={cn(
                  "w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors",
                  view === 'journal' ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                )}
              >
                <BookOpen className="w-4 h-4" />
                Journal
              </button>
            </div>

            {/* Tools */}
            <div className="space-y-1">
              <div className="px-3 py-1 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Tools
              </div>
              <button
                onClick={() => setView('playground')}
                className={cn(
                  "w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors",
                  view === 'playground' ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                )}
              >
                <FlaskConical className="w-4 h-4" />
                Playground
              </button>
            </div>
          </nav>

          {/* Quick Stats */}
          <div className="p-4 border-t border-border space-y-3">
            <div className="flex justify-between items-center text-sm">
              <span className="text-muted-foreground">Today P&L</span>
              <span className={cn("font-mono font-medium", todayPnl >= 0 ? "text-success" : "text-destructive")}>
                {todayPnl >= 0 ? '+' : ''}{formatCurrency(todayPnl)}
              </span>
            </div>
            <div className="flex justify-between items-center text-sm">
              <span className="text-muted-foreground">Win Rate</span>
              <span className="font-mono">{winRate.toFixed(0)}%</span>
            </div>
          </div>
        </aside>

        {/* Main Content */}
        <main className="flex-1 overflow-auto p-6">
          {view === 'dashboard' && (
            <DashboardView
              markets={markets}
              trades={trades}
              journal={journal}
              snapshots={snapshots}
              tradeRecommendations={tradeRecommendations}
              todayPnl={todayPnl}
              totalPnl={totalPnl}
              winRate={winRate}
              onSyncMarkets={syncMarkets}
              onLogTrade={setShowLogTrade}
              isLoading={isLoading}
            />
          )}
          {view === 'markets' && (
            <MarketsView
              markets={markets}
              events={events}
              evaluations={evaluations}
              researchPaths={researchPaths}
              onResearchOnly={(id) => spawnResearch(id, false)}
              onResearchAndEvaluate={(id) => spawnResearch(id, true)}
              onResearchWithTechnique={(id, technique) => spawnResearch(id, false, technique)}
              onEvaluateOnly={runEvaluation}
              onConfirmTrade={logTrade}
              isLoading={isLoading}
              sortMode={sortMode}
              setSortMode={setSortMode}
              viewMode={viewMode}
              setViewMode={setViewMode}
              bankroll={parseFloat(settings.bankroll || '10000')}
            />
          )}
          {view === 'trades' && (
            <TradesView
              trades={trades}
              markets={markets}
              evaluations={evaluations}
              tradeOpportunities={tradeRecommendations}
              totalPnl={totalPnl}
              winRate={winRate}
              bankroll={parseFloat(settings.bankroll || '10000')}
              onLogTrade={logTrade}
              isLoading={isLoading}
            />
          )}
          {view === 'journal' && (
            <JournalView journal={journal} />
          )}
          {view === 'playground' && (
            <PlaygroundView
              prompts={prompts}
              markets={markets}
              onRefresh={fetchData}
            />
          )}
        </main>
      </div>

      {/* Settings Modal */}
      {showSettings && (
        <SettingsModal
          settings={settings}
          onSave={saveSettings}
          onClose={() => setShowSettings(false)}
          isLoading={isLoading}
        />
      )}

      {/* Trade Execution Modal */}
      {showLogTrade && (
        <TradeExecutionModal
          evaluation={showLogTrade}
          market={markets.find(m => m.id === showLogTrade.market_id)}
          bankroll={parseFloat(settings.bankroll || '10000')}
          onSubmit={logTrade}
          onClose={() => setShowLogTrade(null)}
          isLoading={isLoading}
        />
      )}
    </div>
  );
}

// =============================================================================
// Dashboard View
// =============================================================================

type DashboardSort = 'volume' | 'activity' | 'ending_soon' | 'competitive';

function DashboardView({
  markets,
  trades: _trades,
  journal,
  snapshots: _snapshots,
  tradeRecommendations,
  todayPnl,
  totalPnl,
  winRate,
  onSyncMarkets,
  onLogTrade,
  isLoading
}: {
  markets: Market[];
  trades: Trade[];
  journal: JournalEntry[];
  snapshots: DailySnapshot[];
  tradeRecommendations: Evaluation[];
  todayPnl: number;
  totalPnl: number;
  winRate: number;
  onSyncMarkets: () => void;
  onLogTrade: (evaluation: Evaluation) => void;
  isLoading: boolean;
}) {
  const [dashboardSort, setDashboardSort] = useState<DashboardSort>('volume');

  // Sort markets for dashboard display
  const sortedActiveMarkets = [...markets]
    .filter(m => m.status !== 'closed')
    .sort((a, b) => {
      switch (dashboardSort) {
        case 'volume':
          return (b.volume || 0) - (a.volume || 0);
        case 'activity':
          return (b.volume_24hr || 0) - (a.volume_24hr || 0);
        case 'ending_soon':
          if (!a.end_date) return 1;
          if (!b.end_date) return -1;
          return new Date(a.end_date).getTime() - new Date(b.end_date).getTime();
        case 'competitive':
          return (b.competitive || 0) - (a.competitive || 0);
        default:
          return 0;
      }
    })
    .slice(0, 6);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Dashboard</h1>
        <button
          onClick={onSyncMarkets}
          disabled={isLoading}
          className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 disabled:opacity-50 transition-colors"
        >
          {isLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
          Sync Markets
        </button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-4 gap-4">
        <StatCard
          label="Today P&L"
          value={formatCurrency(todayPnl)}
          trend={todayPnl >= 0 ? 'up' : 'down'}
          icon={<DollarSign className="w-5 h-5" />}
        />
        <StatCard
          label="Total P&L"
          value={formatCurrency(totalPnl)}
          trend={totalPnl >= 0 ? 'up' : 'down'}
          icon={<TrendingUp className="w-5 h-5" />}
        />
        <StatCard
          label="Win Rate"
          value={`${winRate.toFixed(0)}%`}
          trend={winRate >= 50 ? 'up' : 'down'}
          icon={<Target className="w-5 h-5" />}
        />
        <StatCard
          label="Active Markets"
          value={markets.filter(m => m.status !== 'closed').length.toString()}
          icon={<Activity className="w-5 h-5" />}
        />
      </div>

      {/* Top Markets with Sort Selector */}
      <div className="fey-card overflow-hidden">
        <div className="p-4 border-b border-border flex items-center justify-between">
          <h2 className="font-medium flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-muted-foreground" />
            Top Markets
          </h2>
          <select
            value={dashboardSort}
            onChange={(e) => setDashboardSort(e.target.value as DashboardSort)}
            className="px-2 py-1 text-xs bg-muted rounded border-none"
          >
            <option value="volume">By Volume</option>
            <option value="activity">By 24h Activity</option>
            <option value="ending_soon">Ending Soon</option>
            <option value="competitive">Most Competitive</option>
          </select>
        </div>
        <div className="p-4 grid gap-3 md:grid-cols-2">
          {sortedActiveMarkets.map(market => {
            const outcomes = JSON.parse(market.outcomes || '["Yes", "No"]');
            const prices = JSON.parse(market.outcome_prices || '["0.5", "0.5"]');
            const topPrice = Math.max(...prices.map((p: string) => parseFloat(p)));
            const topOutcome = outcomes[prices.findIndex((p: string) => parseFloat(p) === topPrice)];
            const eventSlug = market.slug?.split('/')[0] || market.slug;

            return (
              <a
                key={market.id}
                href={`https://polymarket.com/event/${eventSlug}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-start gap-3 p-3 bg-muted/30 rounded-lg hover:bg-muted/50 transition-colors group"
              >
                {market.image && (
                  <img src={market.image} alt="" className="w-10 h-10 rounded object-cover flex-shrink-0" />
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium line-clamp-2 group-hover:text-primary transition-colors">
                    {market.question}
                  </p>
                  <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                    <span>{formatCurrency(market.volume || 0)} vol</span>
                    {market.one_day_price_change !== null && market.one_day_price_change !== 0 && (
                      <span className={market.one_day_price_change > 0 ? "text-success" : "text-destructive"}>
                        {market.one_day_price_change > 0 ? '+' : ''}{(market.one_day_price_change * 100).toFixed(1)}%
                      </span>
                    )}
                  </div>
                </div>
                <div className="text-right flex-shrink-0">
                  <span className="text-lg font-mono font-medium">
                    {(topPrice * 100).toFixed(0)}%
                  </span>
                  <p className="text-xs text-muted-foreground">{topOutcome}</p>
                </div>
              </a>
            );
          })}
          {sortedActiveMarkets.length === 0 && (
            <p className="col-span-2 text-sm text-muted-foreground text-center py-8">
              No active markets. Click "Sync Markets" to discover opportunities.
            </p>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-6">
        {/* Pipeline Status */}
        <div className="fey-card p-4">
          <h2 className="font-medium mb-4 flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-muted-foreground" />
            Pipeline Status
          </h2>
          <div className="space-y-3">
            <div className="flex items-center justify-between p-3 bg-muted/30 rounded-lg">
              <div className="flex items-center gap-2">
                <Eye className="w-4 h-4 text-muted-foreground" />
                <span className="text-sm">Watching</span>
              </div>
              <span className="text-lg font-mono font-semibold">
                {markets.filter(m => m.status === 'watching').length}
              </span>
            </div>
            <div className="flex items-center justify-between p-3 bg-warning/10 rounded-lg">
              <div className="flex items-center gap-2">
                <Search className="w-4 h-4 text-warning" />
                <span className="text-sm">Researching</span>
              </div>
              <span className="text-lg font-mono font-semibold text-warning">
                {markets.filter(m => m.status === 'researching').length}
              </span>
            </div>
            <div className="flex items-center justify-between p-3 bg-success/10 rounded-lg">
              <div className="flex items-center gap-2">
                <CheckCircle className="w-4 h-4 text-success" />
                <span className="text-sm">Traded</span>
              </div>
              <span className="text-lg font-mono font-semibold text-success">
                {markets.filter(m => m.status === 'traded').length}
              </span>
            </div>
            <div className="flex items-center justify-between p-3 bg-muted/30 rounded-lg">
              <div className="flex items-center gap-2">
                <Target className="w-4 h-4 text-primary" />
                <span className="text-sm">Ready to Trade</span>
              </div>
              <span className="text-lg font-mono font-semibold text-primary">
                {tradeRecommendations.length}
              </span>
            </div>
          </div>
        </div>

        {/* Live Journal */}
        <div className="fey-card p-4">
          <h2 className="font-medium mb-4 flex items-center gap-2">
            <Activity className="w-4 h-4 text-muted-foreground pulse-live" />
            Live Activity
          </h2>
          <div className="space-y-2 max-h-80 overflow-auto">
            {journal.slice(0, 10).map(entry => (
              <JournalEntryRow key={entry.id} entry={entry} compact />
            ))}
            {journal.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-8">
                No activity yet. Start by scanning markets.
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Trade Recommendations */}
      {tradeRecommendations.length > 0 && (
        <div className="fey-card p-4 border-success/30">
          <h2 className="font-medium mb-4 flex items-center gap-2">
            <Target className="w-4 h-4 text-success" />
            Ready to Trade
            <span className="ml-2 px-2 py-0.5 bg-success/20 text-success text-xs rounded-full">
              {tradeRecommendations.length}
            </span>
          </h2>
          <div className="grid gap-4">
            {tradeRecommendations.map(evaluation => {
              const market = markets.find(m => m.id === evaluation.market_id);
              const prices = market ? JSON.parse(market.outcome_prices || '["0.5", "0.5"]') : ['0.5', '0.5'];
              const yesPrice = parseFloat(prices[0]);
              const direction = evaluation.estimated_probability > yesPrice ? 'yes' : 'no';
              const odds = direction === 'yes' ? yesPrice : parseFloat(prices[1] || '0.5');
              const marketUrl = market?.slug
                ? `https://polymarket.com/event/${market.slug}`
                : `https://polymarket.com`;

              return (
                <div key={evaluation.id} className="p-4 bg-muted/30 rounded-lg border border-success/20">
                  <p className="font-medium mb-2 line-clamp-2">{market?.question || 'Unknown market'}</p>
                  <div className="flex items-center gap-4 text-sm mb-3">
                    <span className={cn(
                      "px-2 py-1 rounded font-medium",
                      direction === 'yes' ? "bg-success/20 text-success" : "bg-destructive/20 text-destructive"
                    )}>
                      {direction.toUpperCase()} @ {(odds * 100).toFixed(0)}¢
                    </span>
                    <span className="text-success">Edge: +{(evaluation.composite_edge * 100).toFixed(1)}%</span>
                    <span className="text-muted-foreground">
                      Position: {(evaluation.recommended_position * 100).toFixed(1)}%
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => window.open(marketUrl, '_blank')}
                      className="flex items-center gap-2 px-3 py-1.5 text-sm bg-muted hover:bg-muted/80 rounded transition-colors"
                    >
                      <ExternalLink className="w-3 h-3" />
                      Open on Polymarket
                    </button>
                    <button
                      onClick={() => onLogTrade(evaluation)}
                      className="flex items-center gap-2 px-3 py-1.5 text-sm bg-success/20 text-success hover:bg-success/30 rounded transition-colors"
                    >
                      <CheckCircle className="w-3 h-3" />
                      Log Trade
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({
  label,
  value,
  trend,
  icon
}: {
  label: string;
  value: string;
  trend?: 'up' | 'down';
  icon: React.ReactNode;
}) {
  return (
    <div className="fey-card p-4">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm text-muted-foreground">{label}</span>
        <span className="text-muted-foreground">{icon}</span>
      </div>
      <div className="flex items-center gap-2">
        <span className={cn(
          "text-2xl font-mono font-semibold tabular-nums",
          trend === 'up' && "text-success",
          trend === 'down' && "text-destructive"
        )}>
          {value}
        </span>
        {trend && (
          trend === 'up' ? <TrendingUp className="w-4 h-4 text-success" /> : <TrendingDown className="w-4 h-4 text-destructive" />
        )}
      </div>
    </div>
  );
}

// =============================================================================
// Markets View
// =============================================================================

function MarketsView({
  markets,
  events,
  evaluations,
  researchPaths,
  onResearchOnly,
  onResearchAndEvaluate,
  onResearchWithTechnique,
  onEvaluateOnly,
  onConfirmTrade,
  isLoading,
  sortMode,
  setSortMode,
  viewMode,
  setViewMode,
  bankroll
}: {
  markets: Market[];
  events: Event[];
  evaluations: Evaluation[];
  researchPaths: ResearchPath[];
  onResearchOnly: (marketId: string) => void;
  onResearchAndEvaluate: (marketId: string) => void;
  onResearchWithTechnique: (marketId: string, technique: ResearchTechnique) => void;
  onEvaluateOnly: (marketId: string) => void;
  onConfirmTrade: (evaluation: Evaluation, direction: 'yes' | 'no', size: number, entryOdds: number, txHash?: string) => void;
  isLoading: boolean;
  sortMode: SortMode;
  setSortMode: (mode: SortMode) => void;
  viewMode: ViewMode;
  setViewMode: (mode: ViewMode) => void;
  bankroll: number;
}) {
  const [workflowTab, setWorkflowTab] = useState<WorkflowTab>('watching');
  const [expandedDescriptions, setExpandedDescriptions] = useState<Set<string>>(new Set());
  const [expandedEvaluations, setExpandedEvaluations] = useState<Set<string>>(new Set());
  const [expandedResearch, setExpandedResearch] = useState<Set<string>>(new Set());
  const [confirmingTrade, setConfirmingTrade] = useState<string | null>(null);

  // Helper to check if market has evaluation
  const hasEvaluation = (marketId: string) => evaluations.some(e => e.market_id === marketId);
  const getEvaluation = (marketId: string) => evaluations.find(e => e.market_id === marketId);
  const getMarketResearchPaths = (marketId: string) => researchPaths.filter(p => p.market_id === marketId);
  const getResearchStatus = (marketId: string) => {
    const paths = researchPaths.filter(p => p.market_id === marketId);
    if (paths.length === 0) return null;
    if (paths.some(p => p.status === 'running' || p.status === 'pending')) return 'running';
    if (paths.some(p => p.status === 'completed')) return 'completed';
    return 'failed';
  };

  const toggleResearch = (id: string) => {
    setExpandedResearch(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Create edge map for sorting
  const marketEdgeMap = new Map<string, number>();
  evaluations.forEach(e => {
    const existing = marketEdgeMap.get(e.market_id);
    if (!existing || e.composite_edge > existing) {
      marketEdgeMap.set(e.market_id, e.composite_edge);
    }
  });

  const toggleDescription = (id: string) => {
    setExpandedDescriptions(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleEvaluation = (id: string) => {
    setExpandedEvaluations(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Filter markets by workflow tab
  const watchingMarkets = markets.filter(m =>
    m.status === 'watching' && !hasEvaluation(m.id)
  );
  const researchingMarkets = markets.filter(m =>
    m.status === 'researching' && !hasEvaluation(m.id)
  );
  const evaluatedMarkets = markets.filter(m =>
    hasEvaluation(m.id) && m.status !== 'traded'
  );
  const tradedMarkets = markets.filter(m => m.status === 'traded');

  // Get current tab's markets
  const currentMarkets = {
    watching: watchingMarkets,
    researching: researchingMarkets,
    evaluated: evaluatedMarkets,
    traded: tradedMarkets
  }[workflowTab];

  // Sort markets
  const sortedMarkets = [...currentMarkets].sort((a, b) => {
    switch (sortMode) {
      case 'volume':
        return (b.volume || 0) - (a.volume || 0);
      case 'activity':
        return (b.volume_24hr || 0) - (a.volume_24hr || 0);
      case 'ending_soon':
        if (!a.end_date) return 1;
        if (!b.end_date) return -1;
        return new Date(a.end_date).getTime() - new Date(b.end_date).getTime();
      case 'competitive':
        return (b.competitive || 0) - (a.competitive || 0);
      case 'edge':
        const edgeA = marketEdgeMap.get(a.id) ?? -Infinity;
        const edgeB = marketEdgeMap.get(b.id) ?? -Infinity;
        return edgeB - edgeA;
      default:
        return 0;
    }
  });

  // Group markets by event for grouped view
  const marketsByEvent = new Map<string | null, Market[]>();
  sortedMarkets.forEach(m => {
    const key = m.event_id;
    if (!marketsByEvent.has(key)) marketsByEvent.set(key, []);
    marketsByEvent.get(key)!.push(m);
  });

  // Tab counts
  const tabCounts = {
    watching: watchingMarkets.length,
    researching: researchingMarkets.length,
    evaluated: evaluatedMarkets.length,
    traded: tradedMarkets.length
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold">Markets Pipeline</h1>
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">View:</span>
            <button
              onClick={() => setViewMode('flat')}
              className={cn(
                "px-3 py-1.5 text-sm rounded-lg transition-colors",
                viewMode === 'flat' ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:text-foreground"
              )}
            >
              Cards
            </button>
            <button
              onClick={() => setViewMode('grouped')}
              className={cn(
                "px-3 py-1.5 text-sm rounded-lg transition-colors",
                viewMode === 'grouped' ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:text-foreground"
              )}
            >
              By Event
            </button>
          </div>
        </div>

        {/* Workflow Tabs */}
        <div className="flex items-center justify-between">
          <div className="flex gap-1 bg-muted/50 p-1 rounded-lg">
            {(['watching', 'researching', 'evaluated', 'traded'] as const).map((tab, idx) => (
              <button
                key={tab}
                onClick={() => setWorkflowTab(tab)}
                className={cn(
                  "px-4 py-2 text-sm rounded-md transition-all flex items-center gap-2",
                  workflowTab === tab
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                {idx > 0 && <ChevronRight className="w-3 h-3 -ml-2 text-muted-foreground/50" />}
                <span className="capitalize">{tab}</span>
                <span className={cn(
                  "text-xs px-1.5 py-0.5 rounded",
                  workflowTab === tab ? "bg-primary/20 text-primary" : "bg-muted text-muted-foreground"
                )}>
                  {tabCounts[tab]}
                </span>
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Sort:</span>
            <select
              value={sortMode}
              onChange={(e) => setSortMode(e.target.value as SortMode)}
              className="px-3 py-1.5 text-sm bg-muted rounded-lg border-none"
            >
              <option value="volume">Top Volume</option>
              <option value="activity">Most Active (24hr)</option>
              <option value="ending_soon">Ending Soon</option>
              <option value="competitive">Most Competitive</option>
              <option value="edge">Best Edge</option>
            </select>
          </div>
        </div>
      </div>

      {/* Markets list */}
      {viewMode === 'flat' ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {sortedMarkets.map(market => (
            <MarketCard
              key={market.id}
              market={market}
              workflowTab={workflowTab}
              evaluation={getEvaluation(market.id)}
              researchPaths={getMarketResearchPaths(market.id)}
              researchStatus={getResearchStatus(market.id)}
              expandedResearch={expandedResearch}
              onToggleResearch={toggleResearch}
              isExpanded={expandedDescriptions.has(market.id)}
              isEvalExpanded={expandedEvaluations.has(market.id)}
              onToggleExpand={() => toggleDescription(market.id)}
              onToggleEvaluation={() => toggleEvaluation(market.id)}
              onResearchOnly={() => onResearchOnly(market.id)}
              onResearchAndEvaluate={() => onResearchAndEvaluate(market.id)}
              onResearchWithTechnique={(technique) => onResearchWithTechnique(market.id, technique)}
              onEvaluateOnly={() => onEvaluateOnly(market.id)}
              onConfirmTrade={onConfirmTrade}
              isLoading={isLoading}
              bankroll={bankroll}
              isConfirming={confirmingTrade === market.id}
              setConfirming={(v) => setConfirmingTrade(v ? market.id : null)}
            />
          ))}
        </div>
      ) : (
        <div className="space-y-6">
          {Array.from(marketsByEvent.entries()).map(([eventId, eventMarkets]) => {
            const event = events.find(e => e.id === eventId);
            return (
              <div key={eventId || 'ungrouped'} className="fey-card overflow-hidden">
                <div className="p-4 border-b border-border bg-muted/30">
                  <h3 className="font-semibold">{event?.title || 'Standalone Markets'}</h3>
                  <span className="text-sm text-muted-foreground">
                    {eventMarkets.length} market{eventMarkets.length !== 1 ? 's' : ''}
                  </span>
                </div>
                <div className="p-4 grid gap-4 md:grid-cols-2">
                  {eventMarkets.map(market => (
                    <MarketCard
                      key={market.id}
                      market={market}
                      workflowTab={workflowTab}
                      evaluation={getEvaluation(market.id)}
                      researchPaths={getMarketResearchPaths(market.id)}
                      researchStatus={getResearchStatus(market.id)}
                      expandedResearch={expandedResearch}
                      onToggleResearch={toggleResearch}
                      isExpanded={expandedDescriptions.has(market.id)}
                      isEvalExpanded={expandedEvaluations.has(market.id)}
                      onToggleExpand={() => toggleDescription(market.id)}
                      onToggleEvaluation={() => toggleEvaluation(market.id)}
                      onResearchOnly={() => onResearchOnly(market.id)}
                      onResearchAndEvaluate={() => onResearchAndEvaluate(market.id)}
                      onResearchWithTechnique={(technique) => onResearchWithTechnique(market.id, technique)}
                      onEvaluateOnly={() => onEvaluateOnly(market.id)}
                      onConfirmTrade={onConfirmTrade}
                      isLoading={isLoading}
                      bankroll={bankroll}
                      isConfirming={confirmingTrade === market.id}
                      setConfirming={(v) => setConfirmingTrade(v ? market.id : null)}
                      compact
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {sortedMarkets.length === 0 && (
        <div className="text-center py-12 text-muted-foreground">
          <Eye className="w-12 h-12 mx-auto mb-4 opacity-50" />
          <p>No markets in {workflowTab} stage</p>
          {workflowTab === 'watching' && (
            <p className="text-sm mt-2">Sync markets from the dashboard to get started</p>
          )}
        </div>
      )}
    </div>
  );
}

// Market Card Component - Workflow-aware
function MarketCard({
  market,
  workflowTab,
  evaluation,
  researchPaths,
  researchStatus,
  expandedResearch,
  onToggleResearch,
  isExpanded,
  isEvalExpanded,
  onToggleExpand,
  onToggleEvaluation,
  onResearchOnly,
  onResearchAndEvaluate,
  onResearchWithTechnique,
  onEvaluateOnly,
  onConfirmTrade,
  isLoading,
  bankroll,
  isConfirming,
  setConfirming,
  compact = false
}: {
  market: Market;
  workflowTab: WorkflowTab;
  evaluation?: Evaluation;
  researchPaths: ResearchPath[];
  researchStatus: 'running' | 'completed' | 'failed' | null;
  expandedResearch: Set<string>;
  onToggleResearch: (id: string) => void;
  isExpanded: boolean;
  isEvalExpanded: boolean;
  onToggleExpand: () => void;
  onToggleEvaluation: () => void;
  onResearchOnly: () => void;
  onResearchAndEvaluate: () => void;
  onResearchWithTechnique: (technique: ResearchTechnique) => void;
  onEvaluateOnly: () => void;
  onConfirmTrade: (evaluation: Evaluation, direction: 'yes' | 'no', size: number, entryOdds: number, txHash?: string) => void;
  isLoading: boolean;
  bankroll: number;
  isConfirming: boolean;
  setConfirming: (v: boolean) => void;
  compact?: boolean;
}) {
  const [txHash, setTxHash] = useState('');
  const [showAddResearch, setShowAddResearch] = useState(false);

  // Parse outcomes and prices
  let outcomes: string[] = ['Yes', 'No'];
  let prices: number[] = [0.5, 0.5];
  try {
    outcomes = JSON.parse(market.outcomes || '["Yes", "No"]');
    const priceStrings = JSON.parse(market.outcome_prices || '["0.5", "0.5"]');
    prices = priceStrings.map((p: string) => parseFloat(p));
  } catch (e) {
    console.error('Failed to parse outcomes:', e);
  }

  const isMultiOutcome = outcomes.length > 2;
  const eventSlug = market.slug?.split('/')[0] || market.slug;
  const polymarketUrl = `https://polymarket.com/event/${eventSlug}`;

  // Computed values for evaluated tab
  const yesPrice = prices[0];
  const noPrice = prices[1] || (1 - yesPrice);
  const direction = evaluation && evaluation.estimated_probability > yesPrice ? 'yes' : 'no';
  const currentOdds = direction === 'yes' ? yesPrice : noPrice;
  const edge = evaluation?.composite_edge || 0;
  const recommendedSize = Math.round(bankroll * (evaluation?.recommended_position || 0));

  return (
    <div className={cn("fey-card overflow-hidden flex flex-col", compact && "border-0 shadow-none bg-muted/20")}>
      {/* Header with image */}
      <div className="flex gap-3 p-4">
        {market.image && !compact && (
          <img
            src={market.image}
            alt=""
            className="w-16 h-16 rounded-lg object-cover flex-shrink-0"
          />
        )}
        <div className="flex-1 min-w-0">
          <a
            href={polymarketUrl}
            target="_blank"
            rel="noopener noreferrer"
            className={cn(
              "font-medium hover:text-primary transition-colors inline-flex items-center gap-1.5 group",
              compact ? "text-sm line-clamp-2" : "line-clamp-2"
            )}
          >
            {market.question}
            <ExternalLink className="w-3 h-3 opacity-0 group-hover:opacity-50 transition-opacity flex-shrink-0" />
          </a>

          {/* Meta info */}
          <div className="flex flex-wrap items-center gap-2 mt-2 text-xs text-muted-foreground">
            {market.end_date && (
              <span className="flex items-center gap-1">
                <Clock className="w-3 h-3" />
                {new Date(market.end_date).toLocaleDateString()}
              </span>
            )}
            <span>Vol: {formatCurrency(market.volume || 0)}</span>
            {market.volume_24hr !== null && market.volume_24hr > 0 && (
              <span className="text-success">+{formatCurrency(market.volume_24hr)} 24h</span>
            )}
            {/* Price trend */}
            {market.one_day_price_change !== null && market.one_day_price_change !== 0 && (
              <span className={cn(
                "flex items-center gap-0.5 px-1.5 py-0.5 rounded text-xs",
                market.one_day_price_change > 0 ? "bg-success/20 text-success" : "bg-destructive/20 text-destructive"
              )}>
                {market.one_day_price_change > 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                {Math.abs(market.one_day_price_change * 100).toFixed(1)}%
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Outcomes */}
      <div className="px-4 pb-3">
        {isMultiOutcome ? (
          <MultiOutcomeBar outcomes={outcomes} prices={prices} />
        ) : (
          <BinaryOutcomeBar yes={prices[0]} no={prices[1]} />
        )}
      </div>

      {/* Resolution criteria (collapsible) */}
      {market.description && !compact && (
        <div className="border-t border-border">
          <button
            onClick={onToggleExpand}
            className="w-full px-4 py-2 text-xs text-muted-foreground hover:bg-muted/50 flex items-center justify-between transition-colors"
          >
            <span>Resolution Criteria</span>
            <ChevronRight className={cn("w-4 h-4 transition-transform", isExpanded && "rotate-90")} />
          </button>
          {isExpanded && (
            <div className="px-4 pb-4 text-xs text-muted-foreground max-h-48 overflow-y-auto">
              {market.description}
            </div>
          )}
        </div>
      )}

      {/* Tab-specific actions */}
      {!compact && (
        <>
          {/* WATCHING TAB: Research & Evaluate buttons */}
          {workflowTab === 'watching' && (
            <div className="flex gap-2 p-3 border-t border-border bg-muted/30 mt-auto">
              <button
                onClick={onResearchOnly}
                disabled={isLoading}
                className="flex-1 flex items-center justify-center gap-1 px-3 py-1.5 text-xs bg-background hover:bg-muted rounded transition-colors disabled:opacity-50"
              >
                <Search className="w-3 h-3" />
                Research
              </button>
              <button
                onClick={onResearchAndEvaluate}
                disabled={isLoading}
                className="flex-1 flex items-center justify-center gap-1 px-3 py-1.5 text-xs bg-primary text-primary-foreground hover:bg-primary/90 rounded transition-colors disabled:opacity-50"
              >
                <Zap className="w-3 h-3" />
                Research + Evaluate
              </button>
            </div>
          )}

          {/* RESEARCHING TAB: Multi-research display */}
          {workflowTab === 'researching' && (
            <div className="border-t border-border mt-auto">
              {/* Research reports header */}
              <div className="px-3 py-2 border-b border-border bg-muted/20 flex items-center justify-between">
                <span className="text-xs font-medium text-muted-foreground">
                  Research ({researchPaths.length} report{researchPaths.length !== 1 ? 's' : ''})
                </span>
                <div className="relative">
                  <button
                    onClick={() => setShowAddResearch(!showAddResearch)}
                    disabled={isLoading}
                    className="flex items-center gap-1 px-2 py-1 text-xs bg-background hover:bg-muted rounded border border-border transition-colors disabled:opacity-50"
                  >
                    <Plus className="w-3 h-3" />
                    Add Research
                    <ChevronDown className={cn("w-3 h-3 transition-transform", showAddResearch && "rotate-180")} />
                  </button>
                  {showAddResearch && (
                    <div className="absolute right-0 top-full mt-1 w-48 bg-background border border-border rounded-lg shadow-lg z-10 overflow-hidden">
                      {(Object.entries(RESEARCH_TECHNIQUES) as [ResearchTechnique, typeof RESEARCH_TECHNIQUES['deep_research']][]).map(([technique, info]) => (
                        <button
                          key={technique}
                          onClick={() => {
                            onResearchWithTechnique(technique);
                            setShowAddResearch(false);
                          }}
                          disabled={isLoading}
                          className="w-full px-3 py-2 text-left hover:bg-muted transition-colors disabled:opacity-50"
                        >
                          <div className="text-xs font-medium">{info.name}</div>
                          <div className="text-xs text-muted-foreground flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            {info.speed}
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Research reports list */}
              <div className="divide-y divide-border max-h-80 overflow-y-auto">
                {researchPaths.length === 0 ? (
                  <div className="p-4 text-center text-xs text-muted-foreground">
                    No research yet. Add research to get started.
                  </div>
                ) : (
                  researchPaths.map((research, idx) => (
                    <ResearchReportRow
                      key={research.id}
                      research={research}
                      index={idx}
                      isExpanded={expandedResearch.has(research.id)}
                      onToggle={() => onToggleResearch(research.id)}
                    />
                  ))
                )}
              </div>

              {/* Action buttons */}
              <div className="flex gap-2 p-3 border-t border-border bg-muted/30">
                <button
                  onClick={onEvaluateOnly}
                  disabled={isLoading || researchStatus !== 'completed'}
                  className="flex-1 flex items-center justify-center gap-1 px-3 py-1.5 text-xs bg-primary text-primary-foreground hover:bg-primary/90 rounded transition-colors disabled:opacity-50"
                >
                  <Target className="w-3 h-3" />
                  Evaluate with All Research
                </button>
              </div>
            </div>
          )}

          {/* EVALUATED TAB: Rich evaluation display */}
          {workflowTab === 'evaluated' && evaluation && (() => {
            // Parse key factors if available
            let keyFactorsYes: string[] = [];
            let keyFactorsNo: string[] = [];
            try {
              if (evaluation.key_factors_yes) keyFactorsYes = JSON.parse(evaluation.key_factors_yes);
              if (evaluation.key_factors_no) keyFactorsNo = JSON.parse(evaluation.key_factors_no);
            } catch (e) {
              console.error('Failed to parse key factors:', e);
            }

            const hasRichData = evaluation.confidence || evaluation.base_rate_estimate || keyFactorsYes.length > 0;

            return (
              <div className="border-t border-border mt-auto">
                {/* Trade recommendation header */}
                <div className="p-3 bg-muted/30">
                  <div className="flex items-center gap-3">
                    {/* Direction badge */}
                    <div className={cn(
                      "px-3 py-1.5 rounded-lg font-semibold text-sm",
                      direction === 'yes' ? "bg-success/20 text-success" : "bg-destructive/20 text-destructive"
                    )}>
                      BUY {direction.toUpperCase()}
                    </div>

                    {/* Confidence badge */}
                    {evaluation.confidence && (
                      <div className={cn(
                        "px-2 py-1 rounded text-xs font-medium",
                        evaluation.confidence === 'high' ? "bg-success/20 text-success" :
                        evaluation.confidence === 'medium' ? "bg-warning/20 text-warning" :
                        "bg-muted text-muted-foreground"
                      )}>
                        {evaluation.confidence.toUpperCase()}
                      </div>
                    )}

                    <div className="flex-1 text-right">
                      {edge > 0 && (
                        <div className="text-success font-mono text-sm font-semibold">
                          +{(edge * 100).toFixed(1)}% edge
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Probability comparison */}
                  <div className="mt-3 flex items-center gap-4 text-sm">
                    <div>
                      <span className="text-muted-foreground">Market:</span>
                      <span className="ml-1 font-mono">{(yesPrice * 100).toFixed(0)}%</span>
                    </div>
                    <ChevronRight className="w-4 h-4 text-muted-foreground" />
                    <div>
                      <span className="text-muted-foreground">Our estimate:</span>
                      <span className="ml-1 font-mono font-medium text-primary">{(evaluation.estimated_probability * 100).toFixed(0)}%</span>
                    </div>
                  </div>

                  {/* Recommended position */}
                  <div className="mt-2 text-xs text-muted-foreground">
                    Recommended: <span className="font-medium text-foreground">${recommendedSize}</span> ({((evaluation.recommended_position || 0) * 100).toFixed(1)}% of bankroll)
                  </div>

                  {/* Trade buttons */}
                  {!isConfirming ? (
                    <div className="flex gap-2 mt-3">
                      <a
                        href={polymarketUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex-1 flex items-center justify-center gap-1 px-3 py-2 text-xs bg-primary text-primary-foreground hover:bg-primary/90 rounded transition-colors"
                      >
                        <ExternalLink className="w-3 h-3" />
                        Trade on Polymarket
                      </a>
                      <button
                        onClick={() => setConfirming(true)}
                        className="flex items-center justify-center gap-1 px-3 py-2 text-xs bg-background hover:bg-muted border border-border rounded transition-colors"
                      >
                        <CheckCircle className="w-3 h-3" />
                        Confirm Trade
                      </button>
                    </div>
                  ) : (
                    <div className="mt-3 space-y-2">
                      <input
                        type="text"
                        placeholder="TX Hash (optional)"
                        value={txHash}
                        onChange={(e) => setTxHash(e.target.value)}
                        className="w-full px-3 py-1.5 text-xs bg-background border border-border rounded"
                      />
                      <div className="flex gap-2">
                        <button
                          onClick={() => {
                            onConfirmTrade(evaluation, direction, recommendedSize, currentOdds, txHash || undefined);
                            setConfirming(false);
                            setTxHash('');
                          }}
                          disabled={isLoading}
                          className="flex-1 flex items-center justify-center gap-1 px-3 py-2 text-xs bg-success text-success-foreground hover:bg-success/90 rounded transition-colors disabled:opacity-50"
                        >
                          <CheckCircle className="w-3 h-3" />
                          Confirm {direction.toUpperCase()} ${recommendedSize}
                        </button>
                        <button
                          onClick={() => setConfirming(false)}
                          className="px-3 py-2 text-xs bg-background hover:bg-muted border border-border rounded transition-colors"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                {/* Rich evaluation display */}
                {hasRichData && (
                  <div className="border-t border-border">
                    {/* Base rate */}
                    {evaluation.base_rate_estimate && (
                      <div className="px-3 py-2 border-b border-border bg-muted/10">
                        <div className="text-xs text-muted-foreground">
                          <span className="font-medium text-foreground">Base Rate: {evaluation.base_rate_estimate}</span>
                          {evaluation.base_rate_reasoning && (
                            <span className="ml-1">({evaluation.base_rate_reasoning})</span>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Key factors */}
                    {(keyFactorsYes.length > 0 || keyFactorsNo.length > 0) && (
                      <div className="grid grid-cols-2 divide-x divide-border">
                        <div className="p-2">
                          <div className="text-xs font-medium text-success mb-1 flex items-center gap-1">
                            <CheckCircle className="w-3 h-3" />
                            Why YES
                          </div>
                          <ul className="text-xs text-muted-foreground space-y-0.5">
                            {keyFactorsYes.slice(0, 3).map((factor, i) => (
                              <li key={i} className="line-clamp-2">• {factor}</li>
                            ))}
                          </ul>
                        </div>
                        <div className="p-2">
                          <div className="text-xs font-medium text-destructive mb-1 flex items-center gap-1">
                            <XCircle className="w-3 h-3" />
                            Why NO
                          </div>
                          <ul className="text-xs text-muted-foreground space-y-0.5">
                            {keyFactorsNo.slice(0, 3).map((factor, i) => (
                              <li key={i} className="line-clamp-2">• {factor}</li>
                            ))}
                          </ul>
                        </div>
                      </div>
                    )}

                    {/* Main uncertainty */}
                    {evaluation.main_uncertainty && (
                      <div className="px-3 py-2 border-t border-border bg-warning/5">
                        <div className="text-xs flex items-start gap-1">
                          <AlertCircle className="w-3 h-3 text-warning mt-0.5 flex-shrink-0" />
                          <div>
                            <span className="font-medium text-warning">Main Uncertainty:</span>
                            <span className="ml-1 text-muted-foreground">{evaluation.main_uncertainty}</span>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Market comparison */}
                    {evaluation.market_comparison && (
                      <div className="px-3 py-2 border-t border-border">
                        <div className="text-xs text-muted-foreground">
                          <span className="font-medium text-foreground">vs Market:</span>
                          <span className="ml-1">{evaluation.market_comparison}</span>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Collapsible full reasoning */}
                <button
                  onClick={onToggleEvaluation}
                  className="w-full px-4 py-2 text-xs text-muted-foreground hover:bg-muted/50 flex items-center justify-between transition-colors border-t border-border"
                >
                  <span>Full Reasoning</span>
                  <ChevronDown className={cn("w-4 h-4 transition-transform", isEvalExpanded && "rotate-180")} />
                </button>
                {isEvalExpanded && (
                  <div className="px-4 pb-4 space-y-3">
                    {/* Legacy scores (if no rich data) */}
                    {!hasRichData && (
                      <div className="grid grid-cols-3 gap-2 text-center">
                        <div className="p-2 bg-muted/30 rounded">
                          <div className="text-lg font-mono">{evaluation.source_authenticity}</div>
                          <div className="text-xs text-muted-foreground">Source Auth</div>
                        </div>
                        <div className="p-2 bg-muted/30 rounded">
                          <div className="text-lg font-mono">{evaluation.confidence_level}</div>
                          <div className="text-xs text-muted-foreground">Confidence</div>
                        </div>
                        <div className="p-2 bg-muted/30 rounded">
                          <div className="text-lg font-mono">{evaluation.sizing_factor}</div>
                          <div className="text-xs text-muted-foreground">Sizing</div>
                        </div>
                      </div>
                    )}
                    {evaluation.reasoning && (
                      <div className="bg-muted/30 rounded-lg p-3 max-h-48 overflow-y-auto">
                        <div className="prose prose-sm dark:prose-invert max-w-none text-xs">
                          <ReactMarkdown>{evaluation.reasoning}</ReactMarkdown>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })()}

          {/* TRADED TAB: Show trade info */}
          {workflowTab === 'traded' && (
            <div className="p-3 border-t border-border bg-muted/30 mt-auto">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Trade executed</span>
                <a
                  href={polymarketUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 text-primary hover:underline text-xs"
                >
                  View on Polymarket
                  <ExternalLink className="w-3 h-3" />
                </a>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

/**
 * Research report row with live elapsed time counter
 */
function ResearchReportRow({
  research,
  index,
  isExpanded,
  onToggle
}: {
  research: ResearchPath;
  index: number;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  const techniqueInfo = research.technique ? RESEARCH_TECHNIQUES[research.technique] : null;
  const isRunning = research.status === 'pending' || research.status === 'running';

  // Live elapsed time counter - updates every second when running
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (!isRunning) return;

    // Calculate initial elapsed
    const startTime = research.started_at || research.created_at;
    const startDate = new Date(startTime + 'Z');
    const updateElapsed = () => setElapsed(Math.floor((Date.now() - startDate.getTime()) / 1000));

    updateElapsed();
    const interval = setInterval(updateElapsed, 1000);
    return () => clearInterval(interval);
  }, [isRunning, research.started_at, research.created_at]);

  // Format elapsed time
  const formatElapsed = (secs: number) => {
    if (secs >= 60) {
      const mins = Math.floor(secs / 60);
      const s = secs % 60;
      return `${mins}m ${s}s`;
    }
    return `${secs}s`;
  };

  return (
    <div className="bg-muted/10">
      <button
        onClick={() => !isRunning && onToggle()}
        disabled={isRunning}
        className={cn(
          "w-full px-3 py-2 text-left flex items-center gap-2 transition-colors",
          !isRunning && "hover:bg-muted/50"
        )}
      >
        <span className="text-xs font-medium text-muted-foreground">#{index + 1}</span>
        <span className="text-xs font-medium flex-1">
          {techniqueInfo?.name || 'Research'}
        </span>

        {/* Status badge */}
        {isRunning ? (
          <span className="flex items-center gap-1 text-xs text-warning">
            <Loader2 className="w-3 h-3 animate-spin" />
            {research.status === 'pending' ? 'Queued' : `Running ${formatElapsed(elapsed)}`}
          </span>
        ) : research.status === 'completed' ? (
          <span className="flex items-center gap-1 text-xs text-success">
            <CheckCircle className="w-3 h-3" />
            {research.duration_seconds ? `${Math.round(research.duration_seconds)}s` : 'Done'}
          </span>
        ) : research.status === 'failed' ? (
          <span className="flex items-center gap-1 text-xs text-destructive">
            <XCircle className="w-3 h-3" />
            Failed
          </span>
        ) : null}

        {/* Time ago */}
        <span className="text-xs text-muted-foreground">
          {getRelativeTime(research.completed_at || research.created_at)}
        </span>

        {!isRunning && (
          <ChevronDown className={cn("w-3 h-3 text-muted-foreground transition-transform", isExpanded && "rotate-180")} />
        )}
      </button>

      {/* Expanded research content */}
      {isExpanded && research.summary && (
        <div className="px-3 pb-3">
          <div className="bg-background rounded-lg border border-border p-3 max-h-64 overflow-y-auto">
            <div className="prose prose-sm dark:prose-invert max-w-none text-xs">
              <ReactMarkdown>{research.summary}</ReactMarkdown>
            </div>
          </div>
          {research.error_message && (
            <div className="mt-2 p-2 bg-destructive/10 text-destructive text-xs rounded">
              {research.error_message}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function BinaryOutcomeBar({ yes, no }: { yes: number; no: number }) {
  return (
    <div className="flex gap-2">
      <div className="flex-1">
        <div className="flex justify-between text-xs mb-1">
          <span className="text-success font-medium">YES</span>
          <span className="font-mono">{(yes * 100).toFixed(0)}%</span>
        </div>
        <div className="h-2 bg-muted rounded-full overflow-hidden">
          <div
            className="h-full bg-success rounded-full transition-all"
            style={{ width: `${yes * 100}%` }}
          />
        </div>
      </div>
      <div className="flex-1">
        <div className="flex justify-between text-xs mb-1">
          <span className="text-destructive font-medium">NO</span>
          <span className="font-mono">{(no * 100).toFixed(0)}%</span>
        </div>
        <div className="h-2 bg-muted rounded-full overflow-hidden">
          <div
            className="h-full bg-destructive rounded-full transition-all"
            style={{ width: `${no * 100}%` }}
          />
        </div>
      </div>
    </div>
  );
}

// Multi-outcome bar (for markets with more than 2 outcomes)
function MultiOutcomeBar({ outcomes, prices }: { outcomes: string[]; prices: number[] }) {
  // Sort by price descending and take top 4
  const sorted = outcomes
    .map((name, i) => ({ name, price: prices[i] || 0 }))
    .sort((a, b) => b.price - a.price)
    .slice(0, 4);

  return (
    <div className="space-y-1.5">
      {sorted.map(({ name, price }) => (
        <div key={name} className="flex items-center gap-2">
          <span className="w-20 text-xs truncate text-muted-foreground">{name}</span>
          <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
            <div
              className="h-full bg-primary/60 rounded-full transition-all"
              style={{ width: `${price * 100}%` }}
            />
          </div>
          <span className="w-10 text-xs font-mono text-right">{(price * 100).toFixed(0)}%</span>
        </div>
      ))}
      {outcomes.length > 4 && (
        <p className="text-xs text-muted-foreground">+{outcomes.length - 4} more outcomes</p>
      )}
    </div>
  );
}

// =============================================================================
// Research View (kept for reference, not currently rendered in sidebar)
// =============================================================================

// Exported for potential future use (currently not rendered in sidebar)
export function ResearchView({
  researchPaths,
  markets
}: {
  researchPaths: ResearchPath[];
  markets: Market[];
}) {
  const getMarket = (id: string) => markets.find(m => m.id === id);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Research</h1>

      <div className="space-y-4">
        {researchPaths.map(path => {
          const market = getMarket(path.market_id);
          const keyFacts = path.key_facts ? JSON.parse(path.key_facts) : [];
          const contradictions = path.contradictions ? JSON.parse(path.contradictions) : [];

          return (
            <div key={path.id} className="fey-card p-4">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <h3 className="font-medium">{market?.question || 'Unknown Market'}</h3>
                  <p className="text-sm text-muted-foreground mt-1">{path.query}</p>
                </div>
                <span className={cn(
                  "px-2 py-1 text-xs rounded capitalize",
                  path.status === 'completed' && "bg-success/20 text-success",
                  path.status === 'running' && "bg-warning/20 text-warning",
                  path.status === 'pending' && "bg-muted text-muted-foreground",
                  path.status === 'failed' && "bg-destructive/20 text-destructive"
                )}>
                  {path.status}
                </span>
              </div>

              {path.summary && (
                <div className="mb-4">
                  <h4 className="text-sm font-medium mb-2">Summary</h4>
                  <div className="prose prose-sm prose-invert max-w-none text-muted-foreground">
                    <ReactMarkdown>{path.summary}</ReactMarkdown>
                  </div>
                </div>
              )}

              {keyFacts.length > 0 && (
                <div className="mb-4">
                  <h4 className="text-sm font-medium mb-2">Key Facts</h4>
                  <ul className="space-y-1">
                    {keyFacts.slice(0, 5).map((fact: string, i: number) => (
                      <li key={i} className="text-sm text-muted-foreground flex items-start gap-2">
                        <CheckCircle className="w-4 h-4 text-success shrink-0 mt-0.5" />
                        {fact}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {contradictions.length > 0 && (
                <div>
                  <h4 className="text-sm font-medium mb-2 text-warning">Contradictions</h4>
                  <ul className="space-y-1">
                    {contradictions.map((item: string, i: number) => (
                      <li key={i} className="text-sm text-muted-foreground flex items-start gap-2">
                        <AlertCircle className="w-4 h-4 text-warning shrink-0 mt-0.5" />
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="text-xs text-muted-foreground mt-4">
                {getRelativeTime(path.created_at)}
              </div>
            </div>
          );
        })}

        {researchPaths.length === 0 && (
          <div className="text-center py-12 text-muted-foreground">
            <Search className="w-12 h-12 mx-auto mb-4 opacity-50" />
            <p>No research paths yet</p>
            <p className="text-sm mt-1">Start research from the Markets view</p>
          </div>
        )}
      </div>
    </div>
  );
}

// =============================================================================
// Evaluations View (kept for reference, not currently rendered in sidebar)
// =============================================================================

// Exported for potential future use (currently not rendered in sidebar)
export function EvaluationsView({
  evaluations,
  markets,
  researchPaths,
  onLogTrade,
  bankroll
}: {
  evaluations: Evaluation[];
  markets: Market[];
  researchPaths: ResearchPath[];
  onLogTrade: (evaluation: Evaluation) => void;
  bankroll: number;
}) {
  const getMarket = (id: string) => markets.find(m => m.id === id);
  const getResearchForEval = (evalItem: Evaluation) => {
    try {
      const pathIds = JSON.parse(evalItem.research_path_ids || '[]');
      return researchPaths.filter(p => pathIds.includes(p.id));
    } catch {
      return [];
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Evaluations</h1>
        <p className="text-sm text-muted-foreground">{evaluations.length} evaluation{evaluations.length !== 1 ? 's' : ''}</p>
      </div>

      {evaluations.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <Target className="w-12 h-12 mx-auto mb-4 opacity-50" />
          <p>No evaluations yet.</p>
          <p className="text-sm mt-1">Run research on a market, then evaluate it.</p>
        </div>
      ) : (
        <div className="space-y-6">
          {evaluations.map(evaluation => {
            const market = getMarket(evaluation.market_id);
            const research = getResearchForEval(evaluation);
            const prices = market ? JSON.parse(market.outcome_prices || '["0.5", "0.5"]') : ['0.5', '0.5'];
            const yesPrice = parseFloat(prices[0]);
            const shouldTrade = evaluation.recommend_trade === true;
            const tradeDir = evaluation.trade_direction || (evaluation.estimated_probability > yesPrice ? 'yes' : 'no');
            const recommendedSize = bankroll * evaluation.recommended_position;

            // Info advantage badge styling
            const advantageBadge = {
              none: { color: 'bg-muted text-muted-foreground', label: 'No Edge' },
              weak: { color: 'bg-yellow-900/50 text-yellow-400', label: 'Weak' },
              moderate: { color: 'bg-blue-900/50 text-blue-400', label: 'Moderate' },
              strong: { color: 'bg-green-900/50 text-green-400', label: 'Strong' },
            }[evaluation.information_advantage || 'none'];

            return (
              <div key={evaluation.id} className="fey-card overflow-hidden">
                {/* Header - Trade Decision */}
                <div className={cn(
                  "px-6 py-4 border-b border-border",
                  shouldTrade ? "bg-success/10" : "bg-muted/30"
                )}>
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        {shouldTrade ? (
                          <span className={cn(
                            "px-3 py-1 rounded-full text-sm font-bold",
                            tradeDir === 'yes' ? "bg-success/20 text-success" : "bg-destructive/20 text-destructive"
                          )}>
                            📈 TRADE: BUY {tradeDir.toUpperCase()}
                          </span>
                        ) : (
                          <span className="px-3 py-1 rounded-full text-sm font-bold bg-muted text-muted-foreground">
                            ⏸ NO TRADE
                          </span>
                        )}
                        <span className={cn("px-2 py-0.5 rounded text-xs font-medium", advantageBadge.color)}>
                          {advantageBadge.label} Info Advantage
                        </span>
                      </div>
                      <h3 className="font-semibold text-lg mb-1">{market?.question || 'Unknown Market'}</h3>
                      <div className="flex items-center gap-3 text-sm text-muted-foreground">
                        <span>{market?.platform}</span>
                        <span>•</span>
                        <span>{getRelativeTime(evaluation.evaluated_at)}</span>
                      </div>
                    </div>
                    {shouldTrade && (
                      <button
                        onClick={() => onLogTrade(evaluation)}
                        className="flex items-center gap-2 px-4 py-2 bg-success text-white rounded-lg hover:bg-success/90 transition-colors"
                      >
                        <CheckCircle className="w-4 h-4" />
                        Log Trade
                      </button>
                    )}
                  </div>
                </div>

                {/* Trade Thesis (when recommending) */}
                {shouldTrade && evaluation.trade_thesis && (
                  <div className="px-6 py-4 bg-success/5 border-b border-border">
                    <h4 className="text-sm font-medium mb-2 text-success flex items-center gap-2">
                      <Target className="w-4 h-4" />
                      Trade Thesis
                    </h4>
                    <p className="text-sm font-medium">{evaluation.trade_thesis}</p>
                    {evaluation.market_inefficiency && (
                      <p className="text-sm text-muted-foreground mt-2">
                        <span className="font-medium">Market inefficiency:</span> {evaluation.market_inefficiency}
                      </p>
                    )}
                  </div>
                )}

                {/* Market Comparison (when not trading) */}
                {!shouldTrade && evaluation.market_comparison && (
                  <div className="px-6 py-4 bg-muted/20 border-b border-border">
                    <h4 className="text-sm font-medium mb-2 text-muted-foreground flex items-center gap-2">
                      <Scale className="w-4 h-4" />
                      Market Assessment
                    </h4>
                    <p className="text-sm">{evaluation.market_comparison}</p>
                  </div>
                )}

                {/* Stats Grid */}
                <div className="px-6 py-5 grid grid-cols-5 gap-4 border-b border-border bg-background">
                  <div className="text-center">
                    <p className="text-xs text-muted-foreground mb-1">Market Odds</p>
                    <p className="text-xl font-bold font-mono">{(yesPrice * 100).toFixed(0)}%</p>
                    <p className="text-xs text-muted-foreground">YES</p>
                  </div>
                  <div className="text-center">
                    <p className="text-xs text-muted-foreground mb-1">Our Estimate</p>
                    <p className="text-xl font-bold font-mono">{(evaluation.estimated_probability * 100).toFixed(0)}%</p>
                    <p className="text-xs text-muted-foreground">
                      {evaluation.confidence ? evaluation.confidence.toUpperCase() : ''} conf
                    </p>
                  </div>
                  <div className="text-center">
                    <p className="text-xs text-muted-foreground mb-1">Edge</p>
                    <p className={cn(
                      "text-xl font-bold font-mono",
                      evaluation.composite_edge > 0.02 ? "text-success" :
                      evaluation.composite_edge < -0.02 ? "text-destructive" : "text-muted-foreground"
                    )}>
                      {evaluation.composite_edge > 0 ? '+' : ''}{(evaluation.composite_edge * 100).toFixed(1)}%
                    </p>
                  </div>
                  <div className="text-center">
                    <p className="text-xs text-muted-foreground mb-1">Base Rate</p>
                    <p className="text-lg font-bold font-mono">{evaluation.base_rate_estimate || '—'}</p>
                    <p className="text-xs text-muted-foreground truncate" title={evaluation.base_rate_reasoning || ''}>
                      {evaluation.base_rate_reasoning?.substring(0, 30) || ''}
                    </p>
                  </div>
                  <div className="text-center">
                    <p className="text-xs text-muted-foreground mb-1">Position</p>
                    {shouldTrade ? (
                      <>
                        <p className="text-xl font-bold font-mono text-success">{(evaluation.recommended_position * 100).toFixed(1)}%</p>
                        <p className="text-xs text-muted-foreground">${recommendedSize.toFixed(0)}</p>
                      </>
                    ) : (
                      <p className="text-xl font-bold font-mono text-muted-foreground">—</p>
                    )}
                  </div>
                </div>

                {/* Key Factors */}
                {(evaluation.key_factors_yes || evaluation.key_factors_no) && (
                  <div className="px-6 py-4 border-b border-border grid grid-cols-2 gap-6">
                    <div>
                      <h4 className="text-sm font-medium mb-2 text-success flex items-center gap-2">
                        <TrendingUp className="w-4 h-4" />
                        Factors Supporting YES
                      </h4>
                      <ul className="space-y-1">
                        {(evaluation.key_factors_yes ? JSON.parse(evaluation.key_factors_yes) : []).map((f: string, i: number) => (
                          <li key={i} className="text-sm text-muted-foreground flex items-start gap-2">
                            <span className="text-success mt-0.5">•</span> {f}
                          </li>
                        ))}
                      </ul>
                    </div>
                    <div>
                      <h4 className="text-sm font-medium mb-2 text-destructive flex items-center gap-2">
                        <TrendingDown className="w-4 h-4" />
                        Factors Supporting NO
                      </h4>
                      <ul className="space-y-1">
                        {(evaluation.key_factors_no ? JSON.parse(evaluation.key_factors_no) : []).map((f: string, i: number) => (
                          <li key={i} className="text-sm text-muted-foreground flex items-start gap-2">
                            <span className="text-destructive mt-0.5">•</span> {f}
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                )}

                {/* Main Uncertainty */}
                {evaluation.main_uncertainty && (
                  <div className="px-6 py-3 border-b border-border bg-warning/5">
                    <p className="text-sm flex items-center gap-2">
                      <AlertCircle className="w-4 h-4 text-warning" />
                      <span className="font-medium text-warning">Main Uncertainty:</span>
                      <span className="text-muted-foreground">{evaluation.main_uncertainty}</span>
                    </p>
                  </div>
                )}

                {/* Full Reasoning (collapsible) */}
                <details className="px-6 py-4 border-b border-border">
                  <summary className="text-sm font-medium cursor-pointer flex items-center gap-2 hover:text-foreground">
                    <BarChart3 className="w-4 h-4 text-muted-foreground" />
                    Full Reasoning
                  </summary>
                  <div className="prose prose-sm prose-invert max-w-none mt-3">
                    <ReactMarkdown>{evaluation.reasoning}</ReactMarkdown>
                  </div>
                </details>

                {/* Research Summary */}
                {research.length > 0 && (
                  <div className="px-6 py-4 bg-muted/20">
                    <h4 className="text-sm font-medium mb-3 flex items-center gap-2">
                      <Search className="w-4 h-4 text-muted-foreground" />
                      Research ({research.length} path{research.length !== 1 ? 's' : ''})
                    </h4>
                    <div className="space-y-3">
                      {research.map(path => {
                        const keyFacts = path.key_facts ? JSON.parse(path.key_facts) : [];
                        const contradictions = path.contradictions ? JSON.parse(path.contradictions) : [];
                        return (
                          <div key={path.id} className="p-3 bg-background rounded-lg">
                            <p className="text-sm text-muted-foreground mb-2">{path.query}</p>
                            {path.summary && (
                              <div className="prose prose-sm prose-invert max-w-none mb-3">
                                <ReactMarkdown>{path.summary}</ReactMarkdown>
                              </div>
                            )}
                            <div className="flex gap-4 text-xs text-muted-foreground">
                              <span className="flex items-center gap-1">
                                <CheckCircle className="w-3 h-3 text-success" />
                                {keyFacts.length} facts
                              </span>
                              {contradictions.length > 0 && (
                                <span className="flex items-center gap-1">
                                  <AlertCircle className="w-3 h-3 text-warning" />
                                  {contradictions.length} contradiction{contradictions.length !== 1 ? 's' : ''}
                                </span>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// =============================================================================
// Trades View
// =============================================================================

function TradesView({
  trades,
  markets,
  evaluations: _evaluations,
  tradeOpportunities,
  totalPnl,
  winRate,
  bankroll,
  onLogTrade,
  isLoading
}: {
  trades: Trade[];
  markets: Market[];
  evaluations: Evaluation[];
  tradeOpportunities: Evaluation[];
  totalPnl: number;
  winRate: number;
  bankroll: number;
  onLogTrade: (evaluation: Evaluation, direction: 'yes' | 'no', size: number, entryOdds: number, txHash?: string) => void;
  isLoading: boolean;
}) {
  const getMarket = (id: string) => markets.find(m => m.id === id);
  const [expandedCard, setExpandedCard] = useState<string | null>(null);
  const [txHash, setTxHash] = useState('');

  return (
    <div className="space-y-6">
      {/* Trade Opportunities - THE MAIN EVENT */}
      {tradeOpportunities.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <div className="w-2 h-2 rounded-full bg-warning animate-pulse" />
            <h2 className="text-xl font-semibold">Trade Opportunities</h2>
            <span className="text-sm text-muted-foreground">Execute on Polymarket, then confirm here</span>
          </div>

          <div className="grid gap-4">
            {tradeOpportunities.map(evaluation => {
              const market = getMarket(evaluation.market_id);
              const prices = market ? JSON.parse(market.outcome_prices || '["0.5", "0.5"]') : ['0.5', '0.5'];
              const yesOdds = parseFloat(prices[0]);
              const noOdds = parseFloat(prices[1] || '0.5');
              const inferredDirection = evaluation.estimated_probability > yesOdds ? 'yes' : 'no';
              const selectedOdds = inferredDirection === 'yes' ? yesOdds : noOdds;
              const recommendedSize = Math.round(bankroll * evaluation.recommended_position);
              const potentialReturn = recommendedSize / selectedOdds;
              const profit = potentialReturn - recommendedSize;
              const isExpanded = expandedCard === evaluation.id;

              const polymarketUrl = market?.slug
                ? `https://polymarket.com/event/${market.slug}`
                : 'https://polymarket.com';

              return (
                <div key={evaluation.id} className="bg-[#1a1f2e] border border-[#2d3548] rounded-xl overflow-hidden">
                  {/* Card Header */}
                  <div className="p-4 border-b border-[#2d3548]">
                    <div className="flex items-start gap-3">
                      <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white font-bold flex-shrink-0">
                        {market?.question?.charAt(0) || '?'}
                      </div>
                      <p className="text-white font-medium text-sm leading-tight flex-1">
                        {market?.question || 'Unknown market'}
                      </p>
                    </div>
                  </div>

                  {/* Trade Info */}
                  <div className="p-4">
                    <div className="flex items-center gap-4 mb-4">
                      {/* Direction */}
                      <div className={cn(
                        "px-4 py-2 rounded-lg font-semibold text-sm",
                        inferredDirection === 'yes'
                          ? "bg-[#22c55e] text-white"
                          : "bg-[#6b7280] text-white"
                      )}>
                        {inferredDirection.toUpperCase()} @ {(selectedOdds * 100).toFixed(1)}¢
                      </div>

                      {/* Edge */}
                      <div className="text-center">
                        <p className="text-xs text-gray-500">Edge</p>
                        <p className="text-lg font-mono font-bold text-[#22c55e]">
                          +{(evaluation.composite_edge * 100).toFixed(1)}%
                        </p>
                      </div>

                      {/* Confidence */}
                      <div className="text-center">
                        <p className="text-xs text-gray-500">Confidence</p>
                        <p className="text-lg font-mono font-bold text-white">{evaluation.confidence_level}</p>
                      </div>

                      {/* Recommended Size */}
                      <div className="text-center">
                        <p className="text-xs text-gray-500">Size</p>
                        <p className="text-lg font-mono font-bold text-white">${recommendedSize}</p>
                      </div>

                      {/* Potential Profit */}
                      <div className="text-center ml-auto">
                        <p className="text-xs text-gray-500">Potential</p>
                        <p className="text-lg font-mono font-bold text-[#22c55e]">+${profit.toFixed(0)}</p>
                      </div>
                    </div>

                    {/* Action Buttons */}
                    <div className="flex gap-2">
                      <a
                        href={polymarketUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex-1 py-3 bg-[#3b82f6] text-white rounded-lg font-semibold text-sm hover:bg-[#2563eb] transition-colors flex items-center justify-center gap-2"
                      >
                        Open on Polymarket <ExternalLink className="w-4 h-4" />
                      </a>
                      <button
                        onClick={() => setExpandedCard(isExpanded ? null : evaluation.id)}
                        className="flex-1 py-3 bg-[#22c55e] text-white rounded-lg font-semibold text-sm hover:bg-[#16a34a] transition-colors"
                      >
                        {isExpanded ? 'Cancel' : 'Confirm Executed'}
                      </button>
                    </div>

                    {/* Expanded: Log Trade Form */}
                    {isExpanded && (
                      <div className="mt-4 pt-4 border-t border-[#2d3548] space-y-3">
                        <div>
                          <label className="text-xs text-gray-500 block mb-1">Transaction ID (optional)</label>
                          <input
                            type="text"
                            value={txHash}
                            onChange={e => setTxHash(e.target.value)}
                            placeholder="0x..."
                            className="w-full px-3 py-2 bg-[#0d1117] border border-[#2d3548] rounded-lg text-sm text-white focus:outline-none focus:ring-2 focus:ring-[#3b82f6] font-mono"
                          />
                        </div>
                        <button
                          onClick={() => {
                            onLogTrade(evaluation, inferredDirection, recommendedSize, selectedOdds, txHash || undefined);
                            setExpandedCard(null);
                            setTxHash('');
                          }}
                          disabled={isLoading}
                          className="w-full py-2.5 bg-[#22c55e] text-white rounded-lg font-semibold text-sm hover:bg-[#16a34a] disabled:opacity-50 transition-colors"
                        >
                          {isLoading ? 'Logging...' : 'Log Trade'}
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* No Opportunities State */}
      {tradeOpportunities.length === 0 && (
        <div className="bg-muted/30 border border-border rounded-lg p-8 text-center">
          <Target className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
          <h3 className="text-lg font-medium mb-2">No Trade Opportunities</h3>
          <p className="text-sm text-muted-foreground max-w-md mx-auto">
            Scan markets, research them, and run evaluations. When an evaluation finds positive edge above your threshold, it will appear here.
          </p>
        </div>
      )}

      {/* Trade History */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold">Trade History</h2>
          <div className="flex items-center gap-6">
            <div className="text-right">
              <span className="text-sm text-muted-foreground">Total P&L</span>
              <p className={cn("text-xl font-mono font-semibold", totalPnl >= 0 ? "text-success" : "text-destructive")}>
                {totalPnl >= 0 ? '+' : ''}{formatCurrency(totalPnl)}
              </p>
            </div>
            <div className="text-right">
              <span className="text-sm text-muted-foreground">Win Rate</span>
              <p className="text-xl font-mono font-semibold">{winRate.toFixed(0)}%</p>
            </div>
          </div>
        </div>

        <div className="fey-card overflow-hidden">
          <table className="w-full">
            <thead className="bg-muted/50">
              <tr className="text-left text-sm text-muted-foreground">
                <th className="px-4 py-3 font-medium">Market</th>
                <th className="px-4 py-3 font-medium">Direction</th>
                <th className="px-4 py-3 font-medium text-right">Size</th>
                <th className="px-4 py-3 font-medium text-right">Entry</th>
                <th className="px-4 py-3 font-medium text-right">Exit</th>
                <th className="px-4 py-3 font-medium text-right">P&L</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium text-right">Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {trades.map(trade => {
                const market = getMarket(trade.market_id);
                return (
                  <tr key={trade.id} className="hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-3">
                      <span className="text-sm truncate block max-w-xs" title={market?.question}>
                        {market?.question || 'Unknown'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={cn(
                        "px-2 py-0.5 text-xs rounded font-medium uppercase",
                        trade.direction === 'yes' ? "bg-success/20 text-success" : "bg-destructive/20 text-destructive"
                      )}>
                        {trade.direction}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right font-mono">{formatCurrency(trade.size)}</td>
                    <td className="px-4 py-3 text-right font-mono">{(trade.entry_odds * 100).toFixed(1)}%</td>
                    <td className="px-4 py-3 text-right font-mono">
                      {trade.exit_odds ? `${(trade.exit_odds * 100).toFixed(1)}%` : '-'}
                    </td>
                    <td className={cn(
                      "px-4 py-3 text-right font-mono font-medium",
                      trade.pnl !== null && (trade.pnl >= 0 ? "text-success" : "text-destructive")
                    )}>
                      {trade.pnl !== null ? `${trade.pnl >= 0 ? '+' : ''}${formatCurrency(trade.pnl)}` : '-'}
                    </td>
                    <td className="px-4 py-3">
                      <span className={cn(
                        "px-2 py-0.5 text-xs rounded capitalize",
                        trade.status === 'executed' && "bg-success/20 text-success",
                        trade.status === 'pending' && "bg-warning/20 text-warning",
                        trade.status === 'settled' && "bg-muted text-muted-foreground",
                        trade.status === 'cancelled' && "bg-destructive/20 text-destructive"
                      )}>
                        {trade.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right text-sm text-muted-foreground">
                      {trade.executed_at ? formatDateTime(trade.executed_at) : formatDateTime(trade.created_at)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {trades.length === 0 && (
            <div className="text-center py-12 text-muted-foreground">
              <Activity className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p>No trades logged yet</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// Playground View
// =============================================================================

function PlaygroundView({
  prompts,
  markets,
  onRefresh
}: {
  prompts: Prompt[];
  markets: Market[];
  onRefresh: () => void;
}) {
  const [stage, setStage] = useState<PromptStage>('research');
  const [selectedPromptId, setSelectedPromptId] = useState<string | null>(null);
  const [isCreatingNew, setIsCreatingNew] = useState(false);

  // Form state
  const [name, setName] = useState('');
  const [systemPrompt, setSystemPrompt] = useState('');
  const [userPrompt, setUserPrompt] = useState('');
  const [model, setModel] = useState('');
  const [temperature, setTemperature] = useState(0.2);
  const [maxTokens, setMaxTokens] = useState(2048);
  const [notes, setNotes] = useState('');

  // Test state
  const [selectedMarketId, setSelectedMarketId] = useState<string>('');
  const [isRunning, setIsRunning] = useState(false);
  const [runDuration, setRunDuration] = useState(0);
  const [testOutput, setTestOutput] = useState<string | null>(null);
  const [testError, setTestError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // Filter prompts by stage
  const stagePrompts = prompts.filter(p => p.stage === stage);
  const selectedPrompt = selectedPromptId ? prompts.find(p => p.id === selectedPromptId) : null;
  const models = stage === 'research' ? RESEARCH_MODELS : EVALUATION_MODELS;

  // Markets with research (for evaluation testing)
  const marketsWithResearch = stage === 'evaluation'
    ? markets.filter(m => m.status === 'researching' || markets.some(m2 => m2.id === m.id))
    : markets;

  // Load prompt data when selection changes
  useEffect(() => {
    if (selectedPrompt) {
      setName(selectedPrompt.name);
      setSystemPrompt(selectedPrompt.system_prompt || '');
      setUserPrompt(selectedPrompt.user_prompt);
      setModel(selectedPrompt.model);
      setTemperature(selectedPrompt.temperature);
      setMaxTokens(selectedPrompt.max_tokens);
      setNotes(selectedPrompt.notes || '');
      setIsCreatingNew(false);
    }
  }, [selectedPrompt]);

  // Clear form for new prompt
  const handleNewPrompt = () => {
    setSelectedPromptId(null);
    setIsCreatingNew(true);
    setName('');
    setSystemPrompt('');
    setUserPrompt('');
    setModel(models[0].id);
    setTemperature(0.2);
    setMaxTokens(2048);
    setNotes('');
    setTestOutput(null);
    setTestError(null);
  };

  // Save prompt
  const handleSave = async () => {
    if (!name || !userPrompt || !model) return;
    setIsSaving(true);

    try {
      const body = {
        stage,
        name,
        system_prompt: stage === 'evaluation' ? systemPrompt : null,
        user_prompt: userPrompt,
        model,
        temperature,
        max_tokens: maxTokens,
        notes: notes || null
      };

      if (selectedPromptId && !isCreatingNew) {
        // Update existing
        await fetch(`${API_URL}/prompts/${selectedPromptId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body)
        });
      } else {
        // Create new
        const res = await fetch(`${API_URL}/prompts`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body)
        });
        const newPrompt = await res.json();
        setSelectedPromptId(newPrompt.id);
        setIsCreatingNew(false);
      }

      onRefresh();
    } catch (err) {
      console.error('Failed to save prompt:', err);
    } finally {
      setIsSaving(false);
    }
  };

  // Activate prompt
  const handleActivate = async () => {
    if (!selectedPromptId) return;

    try {
      await fetch(`${API_URL}/prompts/${selectedPromptId}/activate`, {
        method: 'POST'
      });
      onRefresh();
    } catch (err) {
      console.error('Failed to activate prompt:', err);
    }
  };

  // Delete prompt
  const handleDelete = async () => {
    if (!selectedPromptId || selectedPrompt?.is_active) return;

    if (!confirm('Delete this prompt?')) return;

    try {
      await fetch(`${API_URL}/prompts/${selectedPromptId}`, {
        method: 'DELETE'
      });
      setSelectedPromptId(null);
      setIsCreatingNew(false);
      onRefresh();
    } catch (err) {
      console.error('Failed to delete prompt:', err);
    }
  };

  // Run test
  const handleRunTest = async () => {
    if (!selectedMarketId || !userPrompt || !model) return;

    setIsRunning(true);
    setTestOutput(null);
    setTestError(null);
    setRunDuration(0);

    const startTime = Date.now();
    const timer = setInterval(() => {
      setRunDuration(Math.floor((Date.now() - startTime) / 1000));
    }, 1000);

    try {
      const res = await fetch(`${API_URL}/playground/test`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          stage,
          market_id: selectedMarketId,
          system_prompt: stage === 'evaluation' ? systemPrompt : undefined,
          user_prompt: userPrompt,
          model,
          temperature,
          max_tokens: maxTokens
        })
      });

      const data = await res.json();

      if (data.success) {
        setTestOutput(data.output);
      } else {
        setTestError(data.error || 'Test failed');
      }
    } catch (err) {
      setTestError(err instanceof Error ? err.message : 'Test failed');
    } finally {
      clearInterval(timer);
      setIsRunning(false);
    }
  };

  // Insert variable into prompt
  const insertVariable = (variable: string, target: 'system' | 'user') => {
    if (target === 'system') {
      setSystemPrompt(prev => prev + `{${variable}}`);
    } else {
      setUserPrompt(prev => prev + `{${variable}}`);
    }
  };

  const variables = stage === 'research'
    ? ['market_question', 'current_odds', 'end_date', 'volume', 'liquidity']
    : ['market_question', 'current_odds', 'end_date', 'volume', 'liquidity', 'research_summary'];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-semibold">Prompt Playground</h1>
        </div>
      </div>

      {/* Stage Toggle */}
      <div className="flex gap-2">
        <button
          onClick={() => { setStage('research'); setSelectedPromptId(null); setIsCreatingNew(false); }}
          className={cn(
            "px-4 py-2 rounded-lg text-sm font-medium transition-colors",
            stage === 'research'
              ? "bg-primary text-primary-foreground"
              : "bg-muted text-muted-foreground hover:text-foreground"
          )}
        >
          Research
        </button>
        <button
          onClick={() => { setStage('evaluation'); setSelectedPromptId(null); setIsCreatingNew(false); }}
          className={cn(
            "px-4 py-2 rounded-lg text-sm font-medium transition-colors",
            stage === 'evaluation'
              ? "bg-primary text-primary-foreground"
              : "bg-muted text-muted-foreground hover:text-foreground"
          )}
        >
          Evaluation
        </button>
      </div>

      <div className="grid grid-cols-3 gap-6">
        {/* Left Column - Prompt Selection & Editor */}
        <div className="col-span-2 space-y-4">
          {/* Prompt Selector */}
          <div className="flex items-center gap-3">
            <select
              value={selectedPromptId || ''}
              onChange={(e) => {
                setSelectedPromptId(e.target.value || null);
                setIsCreatingNew(false);
                setTestOutput(null);
                setTestError(null);
              }}
              className="flex-1 px-3 py-2 rounded-lg border border-border bg-background text-sm"
            >
              <option value="">Select a prompt...</option>
              {stagePrompts.map(p => (
                <option key={p.id} value={p.id}>
                  {p.name} {p.is_active ? '★' : ''}
                </option>
              ))}
            </select>
            <button
              onClick={handleNewPrompt}
              className="flex items-center gap-1 px-3 py-2 rounded-lg bg-muted hover:bg-muted/80 text-sm transition-colors"
            >
              <Plus className="w-4 h-4" />
              New
            </button>
          </div>

          {/* Production Badge */}
          {selectedPrompt?.is_active && (
            <div className="flex items-center gap-2 text-sm text-warning">
              <Star className="w-4 h-4 fill-current" />
              In Production
            </div>
          )}

          {/* Model Selector */}
          {(selectedPromptId || isCreatingNew) && (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">Model</label>
                <select
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm"
                >
                  {models.map(m => (
                    <option key={m.id} value={m.id}>
                      {m.name} ({m.speed})
                    </option>
                  ))}
                </select>
              </div>

              {/* Prompt Name */}
              <div>
                <label className="block text-sm font-medium mb-1">Name</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g., Balanced Research v2"
                  className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm"
                />
              </div>

              {/* System Prompt (evaluation only) */}
              {stage === 'evaluation' && (
                <div>
                  <label className="block text-sm font-medium mb-1">System Prompt</label>
                  <textarea
                    value={systemPrompt}
                    onChange={(e) => setSystemPrompt(e.target.value)}
                    rows={6}
                    className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm font-mono resize-y"
                    placeholder="System instructions for the evaluation model..."
                  />
                </div>
              )}

              {/* User Prompt */}
              <div>
                <label className="block text-sm font-medium mb-1">
                  {stage === 'research' ? 'Research Prompt' : 'User Prompt'}
                </label>
                <textarea
                  value={userPrompt}
                  onChange={(e) => setUserPrompt(e.target.value)}
                  rows={12}
                  className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm font-mono resize-y"
                  placeholder={stage === 'research'
                    ? "Research prompt with {variables}..."
                    : "User prompt template with {variables}..."
                  }
                />
              </div>

              {/* Temperature & Max Tokens (evaluation only) */}
              {stage === 'evaluation' && (
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-1">Temperature</label>
                    <input
                      type="number"
                      value={temperature}
                      onChange={(e) => setTemperature(parseFloat(e.target.value))}
                      min="0"
                      max="1"
                      step="0.1"
                      className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Max Tokens</label>
                    <input
                      type="number"
                      value={maxTokens}
                      onChange={(e) => setMaxTokens(parseInt(e.target.value))}
                      min="100"
                      max="8192"
                      className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm"
                    />
                  </div>
                </div>
              )}

              {/* Notes */}
              <div>
                <label className="block text-sm font-medium mb-1">Notes</label>
                <input
                  type="text"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="What changed, performance observations..."
                  className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm"
                />
              </div>

              {/* Action Buttons */}
              <div className="flex items-center gap-2">
                <button
                  onClick={handleSave}
                  disabled={isSaving || !name || !userPrompt || !model}
                  className="flex items-center gap-1 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm hover:bg-primary/90 disabled:opacity-50 transition-colors"
                >
                  <Save className="w-4 h-4" />
                  {isSaving ? 'Saving...' : 'Save'}
                </button>
                {selectedPromptId && !selectedPrompt?.is_active && (
                  <button
                    onClick={handleActivate}
                    className="flex items-center gap-1 px-4 py-2 rounded-lg bg-warning/20 text-warning text-sm hover:bg-warning/30 transition-colors"
                  >
                    <Star className="w-4 h-4" />
                    Set as Production
                  </button>
                )}
                {selectedPromptId && !selectedPrompt?.is_active && (
                  <button
                    onClick={handleDelete}
                    className="flex items-center gap-1 px-4 py-2 rounded-lg bg-destructive/20 text-destructive text-sm hover:bg-destructive/30 transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                    Delete
                  </button>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Right Column - Variables & Test */}
        <div className="space-y-4">
          {/* Variables */}
          <div className="fey-card p-4">
            <h3 className="text-sm font-medium mb-3">Variables</h3>
            <div className="flex flex-wrap gap-2">
              {variables.map(v => (
                <button
                  key={v}
                  onClick={() => insertVariable(v, 'user')}
                  className="px-2 py-1 text-xs bg-muted rounded hover:bg-muted/80 font-mono transition-colors"
                >
                  {`{${v}}`}
                </button>
              ))}
            </div>
            <p className="text-xs text-muted-foreground mt-3">
              Click to insert into prompt
            </p>
          </div>

          {/* Test Section */}
          {(selectedPromptId || isCreatingNew) && (
            <div className="fey-card p-4 space-y-3">
              <h3 className="text-sm font-medium">Test</h3>
              <select
                value={selectedMarketId}
                onChange={(e) => setSelectedMarketId(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm"
              >
                <option value="">Select market...</option>
                {marketsWithResearch.slice(0, 50).map(m => (
                  <option key={m.id} value={m.id}>
                    {m.question.slice(0, 60)}...
                  </option>
                ))}
              </select>

              <button
                onClick={handleRunTest}
                disabled={isRunning || !selectedMarketId || !userPrompt || !model}
                className="w-full flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm hover:bg-primary/90 disabled:opacity-50 transition-colors"
              >
                {isRunning ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Running... ({runDuration}s)
                  </>
                ) : (
                  <>
                    <Play className="w-4 h-4" />
                    Run Test
                  </>
                )}
              </button>

              {stage === 'evaluation' && (
                <p className="text-xs text-muted-foreground">
                  Requires completed research for the market
                </p>
              )}
            </div>
          )}

          {/* Model Info */}
          {model && (
            <div className="fey-card p-4">
              <h3 className="text-sm font-medium mb-2">Model Info</h3>
              {(() => {
                const modelInfo = models.find(m => m.id === model);
                return modelInfo ? (
                  <div className="text-xs text-muted-foreground space-y-1">
                    <p><strong>{modelInfo.name}</strong></p>
                    <p>{modelInfo.description}</p>
                    <p className="flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {modelInfo.speed}
                    </p>
                  </div>
                ) : null;
              })()}
            </div>
          )}
        </div>
      </div>

      {/* Output Section */}
      {(testOutput || testError) && (
        <div className="fey-card p-4">
          <h3 className="text-sm font-medium mb-3">Output</h3>
          {testError ? (
            <div className="p-4 bg-destructive/10 rounded-lg text-destructive text-sm">
              {testError}
            </div>
          ) : testOutput ? (
            <div className="prose prose-sm dark:prose-invert max-w-none">
              <ReactMarkdown>{testOutput}</ReactMarkdown>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}

// =============================================================================
// Journal View
// =============================================================================

function JournalView({ journal }: { journal: JournalEntry[] }) {
  const [filterAgent, setFilterAgent] = useState<AgentType | 'all'>('all');

  const filteredJournal = filterAgent === 'all'
    ? journal
    : journal.filter(e => e.agent === filterAgent);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Journal</h1>
        <div className="flex gap-2">
          {(['all', 'scout', 'researcher', 'analyst', 'trader', 'chronicler', 'system'] as const).map(agent => (
            <button
              key={agent}
              onClick={() => setFilterAgent(agent)}
              className={cn(
                "px-3 py-1.5 text-sm rounded-lg transition-colors capitalize",
                filterAgent === agent ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:text-foreground"
              )}
            >
              {agent}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        {filteredJournal.map(entry => (
          <JournalEntryRow key={entry.id} entry={entry} />
        ))}

        {filteredJournal.length === 0 && (
          <div className="text-center py-12 text-muted-foreground">
            <BookOpen className="w-12 h-12 mx-auto mb-4 opacity-50" />
            <p>No journal entries</p>
          </div>
        )}
      </div>
    </div>
  );
}

function JournalEntryRow({ entry, compact }: { entry: JournalEntry; compact?: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const context = entry.context ? JSON.parse(entry.context) : null;

  return (
    <div
      className={cn(
        "fey-card transition-colors cursor-pointer",
        compact ? "p-2" : "p-3",
        expanded && "bg-muted/50"
      )}
      onClick={() => !compact && setExpanded(!expanded)}
    >
      <div className="flex items-start gap-3">
        <div className={cn(
          "w-8 h-8 rounded-full flex items-center justify-center shrink-0 text-xs font-medium uppercase",
          entry.agent === 'scout' && "bg-blue-500/20 text-blue-400",
          entry.agent === 'researcher' && "bg-purple-500/20 text-purple-400",
          entry.agent === 'analyst' && "bg-amber-500/20 text-amber-400",
          entry.agent === 'trader' && "bg-success/20 text-success",
          entry.agent === 'chronicler' && "bg-muted text-muted-foreground",
          entry.agent === 'system' && "bg-muted text-muted-foreground"
        )}>
          {entry.agent.charAt(0).toUpperCase()}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-medium capitalize text-sm">{entry.agent}</span>
            <span className="text-muted-foreground">•</span>
            <span className="text-sm text-muted-foreground">{entry.action.replace(/_/g, ' ')}</span>
            <span className="text-xs text-muted-foreground ml-auto">{getRelativeTime(entry.timestamp)}</span>
          </div>

          {entry.reasoning && !compact && (
            <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{entry.reasoning}</p>
          )}

          {expanded && context && (
            <pre className="mt-2 text-xs bg-background p-2 rounded overflow-auto max-h-40">
              {JSON.stringify(context, null, 2)}
            </pre>
          )}
        </div>

        {!compact && (
          <ChevronRight className={cn(
            "w-4 h-4 text-muted-foreground transition-transform",
            expanded && "rotate-90"
          )} />
        )}
      </div>
    </div>
  );
}

// =============================================================================
// Settings Modal
// =============================================================================

function SettingsModal({
  settings,
  onSave,
  onClose,
  isLoading
}: {
  settings: Settings;
  onSave: (settings: Settings) => void;
  onClose: () => void;
  isLoading: boolean;
}) {
  const [form, setForm] = useState<Settings>(settings);

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-card border border-border rounded-lg w-full max-w-lg p-6" onClick={e => e.stopPropagation()}>
        <h2 className="text-xl font-semibold mb-6">Settings</h2>

        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium block mb-1.5">Claude API Key</label>
            <input
              type="password"
              value={form.claude_api_key || ''}
              onChange={e => setForm({ ...form, claude_api_key: e.target.value })}
              placeholder="sk-ant-..."
              className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
            <p className="text-xs text-muted-foreground mt-1">
              <a href="https://console.anthropic.com" target="_blank" className="underline">Get your key</a>
            </p>
          </div>

          <div>
            <label className="text-sm font-medium block mb-1.5">Gemini API Key</label>
            <input
              type="password"
              value={form.gemini_api_key || ''}
              onChange={e => setForm({ ...form, gemini_api_key: e.target.value })}
              placeholder="AI..."
              className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
            <p className="text-xs text-muted-foreground mt-1">
              <a href="https://ai.google.dev" target="_blank" className="underline">Get your key</a>
            </p>
          </div>

          <div className="p-3 bg-muted/30 rounded-lg border border-border">
            <label className="text-sm font-medium block mb-1.5">Playwriter WebSocket URL</label>
            <input
              type="text"
              value={form.playwriter_url || ''}
              onChange={e => setForm({ ...form, playwriter_url: e.target.value })}
              placeholder="ws://localhost:19988/cdp"
              className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
            <div className="text-xs text-muted-foreground mt-2 space-y-1">
              <p className="font-medium text-foreground">Setup steps:</p>
              <p>1. <a href="https://chromewebstore.google.com/detail/playwriter-mcp/jfeammnjpkecdekppnclgkkffahnhfhe" target="_blank" rel="noopener" className="underline text-primary">Install Playwriter extension</a></p>
              <p>2. Run: <code className="bg-background px-1 rounded">npx playwriter</code></p>
              <p>3. Go to <a href="https://polymarket.com" target="_blank" rel="noopener" className="underline">polymarket.com</a> and click extension icon (turns green)</p>
              <p>4. Click "Sync Markets" in Dashboard (Playwriter only needed for comment scraping)</p>
            </div>
          </div>

          <div className="border-t border-border pt-4">
            <h3 className="text-sm font-medium mb-3">Risk Parameters</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs text-muted-foreground block mb-1">Max Position %</label>
                <input
                  type="number"
                  value={form.max_position_percent || '5'}
                  onChange={e => setForm({ ...form, max_position_percent: e.target.value })}
                  className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground block mb-1">Min Confidence</label>
                <input
                  type="number"
                  value={form.min_confidence || '60'}
                  onChange={e => setForm({ ...form, min_confidence: e.target.value })}
                  className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground block mb-1">Min Edge %</label>
                <input
                  type="number"
                  value={form.min_edge_threshold || '5'}
                  onChange={e => setForm({ ...form, min_edge_threshold: e.target.value })}
                  className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground block mb-1">Bankroll</label>
                <input
                  type="number"
                  value={form.bankroll || '10000'}
                  onChange={e => setForm({ ...form, bankroll: e.target.value })}
                  placeholder="10000"
                  className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-3 mt-6">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={() => onSave(form)}
            disabled={isLoading}
            className="px-4 py-2 text-sm bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 disabled:opacity-50 transition-colors"
          >
            {isLoading ? 'Saving...' : 'Save Settings'}
          </button>
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// Trade Execution Modal (Polymarket-style)
// =============================================================================

function TradeExecutionModal({
  evaluation,
  market,
  bankroll,
  onSubmit,
  onClose,
  isLoading
}: {
  evaluation: Evaluation;
  market: Market | undefined;
  bankroll: number;
  onSubmit: (evaluation: Evaluation, direction: 'yes' | 'no', size: number, entryOdds: number, txHash?: string) => void;
  onClose: () => void;
  isLoading: boolean;
}) {
  const prices = market ? JSON.parse(market.outcome_prices || '["0.5", "0.5"]') : ['0.5', '0.5'];
  const yesOdds = parseFloat(prices[0]);
  const noOdds = parseFloat(prices[1] || '0.5');
  const inferredDirection = evaluation.estimated_probability > yesOdds ? 'yes' : 'no';
  const recommendedSize = bankroll * evaluation.recommended_position;

  const [direction, setDirection] = useState<'yes' | 'no'>(inferredDirection);
  const [amount, setAmount] = useState(Math.round(recommendedSize));
  const [showLogForm, setShowLogForm] = useState(false);
  const [txHash, setTxHash] = useState('');

  const selectedOdds = direction === 'yes' ? yesOdds : noOdds;
  const potentialReturn = amount / selectedOdds;
  const profit = potentialReturn - amount;

  // Build Polymarket URL using slug
  const polymarketUrl = market?.slug
    ? `https://polymarket.com/event/${market.slug}`
    : 'https://polymarket.com';

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-[#1a1f2e] border border-[#2d3548] rounded-2xl w-full max-w-sm overflow-hidden" onClick={e => e.stopPropagation()}>

        {/* Header with market info */}
        <div className="p-4 border-b border-[#2d3548]">
          <div className="flex items-start gap-3">
            <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white font-bold text-lg">
              {market?.question?.charAt(0) || '?'}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-white font-medium text-sm leading-tight line-clamp-2">
                {market?.question || 'Unknown market'}
              </p>
            </div>
          </div>
        </div>

        {/* Buy/Sell tabs + Order type */}
        <div className="px-4 pt-3 flex items-center justify-between">
          <div className="flex gap-4">
            <button className="text-white font-medium text-sm border-b-2 border-white pb-1">Buy</button>
            <button className="text-gray-500 text-sm pb-1">Sell</button>
          </div>
          <button className="text-gray-400 text-sm flex items-center gap-1">
            Market <ChevronRight className="w-4 h-4 rotate-90" />
          </button>
        </div>

        {/* Yes/No buttons - Polymarket style */}
        <div className="p-4 grid grid-cols-2 gap-3">
          <button
            onClick={() => setDirection('yes')}
            className={cn(
              "py-3 rounded-lg font-semibold text-base transition-all",
              direction === 'yes'
                ? "bg-[#22c55e] text-white"
                : "bg-[#22c55e]/20 text-[#22c55e] hover:bg-[#22c55e]/30"
            )}
          >
            Yes {(yesOdds * 100).toFixed(1)}¢
          </button>
          <button
            onClick={() => setDirection('no')}
            className={cn(
              "py-3 rounded-lg font-semibold text-base transition-all",
              direction === 'no'
                ? "bg-[#6b7280] text-white"
                : "bg-[#6b7280]/20 text-[#9ca3af] hover:bg-[#6b7280]/30"
            )}
          >
            No {(noOdds * 100).toFixed(1)}¢
          </button>
        </div>

        {/* Amount section */}
        <div className="px-4 pb-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-gray-400 text-sm">Amount</span>
            <span className="text-4xl font-light text-gray-400">${amount}</span>
          </div>

          {/* Quick amount buttons */}
          <div className="flex gap-2 mb-4">
            <button
              onClick={() => setAmount(a => a + 1)}
              className="flex-1 py-2 bg-[#2d3548] text-gray-300 rounded-lg text-sm hover:bg-[#3d4558] transition-colors"
            >
              +$1
            </button>
            <button
              onClick={() => setAmount(a => a + 20)}
              className="flex-1 py-2 bg-[#2d3548] text-gray-300 rounded-lg text-sm hover:bg-[#3d4558] transition-colors"
            >
              +$20
            </button>
            <button
              onClick={() => setAmount(a => a + 100)}
              className="flex-1 py-2 bg-[#2d3548] text-gray-300 rounded-lg text-sm hover:bg-[#3d4558] transition-colors"
            >
              +$100
            </button>
            <button
              onClick={() => setAmount(Math.round(recommendedSize))}
              className="flex-1 py-2 bg-[#2d3548] text-gray-300 rounded-lg text-sm hover:bg-[#3d4558] transition-colors"
            >
              Rec
            </button>
          </div>

          {/* Potential return */}
          <div className="flex items-center justify-between text-sm mb-4 px-1">
            <span className="text-gray-500">Potential return</span>
            <span className="text-[#22c55e] font-medium">
              ${potentialReturn.toFixed(2)} (+${profit.toFixed(2)})
            </span>
          </div>

          {/* Edge indicator from evaluation */}
          <div className="bg-[#2d3548]/50 rounded-lg p-3 mb-4">
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-400">Pundit Edge</span>
              <span className={cn(
                "font-mono font-medium",
                evaluation.composite_edge > 0 ? "text-[#22c55e]" : "text-[#ef4444]"
              )}>
                {evaluation.composite_edge > 0 ? '+' : ''}{(evaluation.composite_edge * 100).toFixed(1)}%
              </span>
            </div>
            <div className="flex items-center justify-between text-sm mt-1">
              <span className="text-gray-400">Confidence</span>
              <span className="text-white font-mono">{evaluation.confidence_level}/100</span>
            </div>
          </div>

          {/* Action buttons */}
          {!showLogForm ? (
            <div className="space-y-2">
              <a
                href={polymarketUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full py-3.5 bg-[#3b82f6] text-white rounded-lg font-semibold text-base hover:bg-[#2563eb] transition-colors flex items-center justify-center gap-2"
              >
                Open on Polymarket <ExternalLink className="w-4 h-4" />
              </a>
              <button
                onClick={() => setShowLogForm(true)}
                className="w-full py-3 bg-[#2d3548] text-gray-300 rounded-lg font-medium text-sm hover:bg-[#3d4558] transition-colors"
              >
                Log Executed Trade
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              <div>
                <label className="text-xs text-gray-500 block mb-1">Transaction ID (optional)</label>
                <input
                  type="text"
                  value={txHash}
                  onChange={e => setTxHash(e.target.value)}
                  placeholder="0x..."
                  className="w-full px-3 py-2 bg-[#0d1117] border border-[#2d3548] rounded-lg text-sm text-white focus:outline-none focus:ring-2 focus:ring-[#3b82f6] font-mono"
                />
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setShowLogForm(false)}
                  className="flex-1 py-2.5 bg-[#2d3548] text-gray-300 rounded-lg text-sm hover:bg-[#3d4558] transition-colors"
                >
                  Back
                </button>
                <button
                  onClick={() => onSubmit(evaluation, direction, amount, selectedOdds, txHash || undefined)}
                  disabled={isLoading || amount <= 0}
                  className="flex-1 py-2.5 bg-[#22c55e] text-white rounded-lg font-semibold text-sm hover:bg-[#16a34a] disabled:opacity-50 transition-colors"
                >
                  {isLoading ? 'Logging...' : 'Confirm'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
