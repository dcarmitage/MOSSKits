import { logJournalEntry } from './chronicler';

/**
 * Scout Agent
 * Discovers markets via Playwriter MCP browser automation
 */

export interface ScoutedMarket {
  platform: string;
  externalId: string;
  question: string;
  currentOdds: {
    yes: number;
    no: number;
  };
  volume: number;
  liquidity: number;
  closeDate: string;
}

export interface ScoutResult {
  markets: ScoutedMarket[];
  scannedAt: string;
}

export async function scanMarkets(
  db: D1Database,
  playwriterUrl: string | null,
  platforms: string[]
): Promise<ScoutResult> {
  await logJournalEntry(db, 'scout', 'scan_started', {
    platforms,
    playwriterConnected: !!playwriterUrl
  });

  if (!playwriterUrl) {
    throw new Error(
      'Playwriter not connected. Please install the Playwriter browser extension ' +
      '(https://chromewebstore.google.com/detail/playwriter-mcp/jfeammnjpkecdekppnclgkkffahnhfhe) ' +
      'and configure the playwriter_url in Settings.'
    );
  }

  const allMarkets: ScoutedMarket[] = [];

  for (const platform of platforms) {
    try {
      const markets = await scanPlatform(playwriterUrl, platform);
      allMarkets.push(...markets);

      await logJournalEntry(db, 'scout', 'platform_scanned', {
        platform,
        marketsFound: markets.length
      });
    } catch (error) {
      await logJournalEntry(db, 'scout', 'platform_scan_failed', {
        platform,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  await logJournalEntry(db, 'scout', 'scan_completed', {
    totalMarketsFound: allMarkets.length
  });

  return {
    markets: allMarkets,
    scannedAt: new Date().toISOString()
  };
}

async function scanPlatform(
  playwriterUrl: string,
  platform: string
): Promise<ScoutedMarket[]> {
  const code = generateScanningCode(platform);

  const response = await fetch(`${playwriterUrl}/execute`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      code,
      captureNetwork: true
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Playwriter error: ${response.status} - ${errorText}`);
  }

  const result = await response.json() as {
    success: boolean;
    result?: ScoutedMarket[];
    error?: string;
    networkTraces?: Array<{
      url: string;
      responseBody?: string;
    }>;
  };

  if (!result.success) {
    throw new Error(result.error || 'Scan failed');
  }

  // Try to get markets from result or network traces
  if (result.result && Array.isArray(result.result)) {
    return result.result;
  }

  // Parse from network traces if available
  if (result.networkTraces) {
    return parseMarketsFromNetwork(platform, result.networkTraces);
  }

  return [];
}

function generateScanningCode(platform: string): string {
  switch (platform.toLowerCase()) {
    case 'polymarket':
      return `
        // Polymarket market scanner
        // Assumes browser is on Polymarket markets page

        async function scanMarkets() {
          const markets = [];

          // Find all market cards
          const marketCards = document.querySelectorAll('[data-market-id], .market-card, [class*="MarketCard"]');

          for (const card of marketCards) {
            try {
              // Extract market data from the card
              const questionEl = card.querySelector('h2, h3, [class*="question"], [class*="title"]');
              const question = questionEl?.textContent?.trim();

              const oddsEls = card.querySelectorAll('[class*="odds"], [class*="price"], [data-outcome]');
              let yesOdds = 0.5;
              let noOdds = 0.5;

              for (const oddsEl of oddsEls) {
                const text = oddsEl.textContent || '';
                const match = text.match(/(\\d+(?:\\.\\d+)?)/);
                if (match) {
                  const value = parseFloat(match[1]) / 100;
                  if (oddsEl.textContent?.toLowerCase().includes('yes') || oddsEl.dataset?.outcome === 'yes') {
                    yesOdds = value;
                  } else if (oddsEl.textContent?.toLowerCase().includes('no') || oddsEl.dataset?.outcome === 'no') {
                    noOdds = value;
                  }
                }
              }

              const volumeEl = card.querySelector('[class*="volume"], [class*="Volume"]');
              const volumeText = volumeEl?.textContent || '0';
              const volume = parseFloat(volumeText.replace(/[^0-9.]/g, '')) || 0;

              const id = card.dataset?.marketId || card.getAttribute('href')?.split('/').pop() || crypto.randomUUID();

              if (question) {
                markets.push({
                  platform: 'polymarket',
                  externalId: id,
                  question,
                  currentOdds: { yes: yesOdds, no: noOdds },
                  volume,
                  liquidity: volume * 0.3, // Estimate
                  closeDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
                });
              }
            } catch (e) {
              console.error('Failed to parse market card:', e);
            }
          }

          return markets;
        }

        return scanMarkets();
      `;

    case 'kalshi':
      return `
        // Kalshi market scanner
        async function scanMarkets() {
          const markets = [];

          // Kalshi-specific parsing logic
          const marketElements = document.querySelectorAll('[data-testid*="market"], .market-row');

          for (const el of marketElements) {
            try {
              const question = el.querySelector('[class*="title"], h3')?.textContent?.trim();
              const id = el.dataset?.marketId || el.querySelector('a')?.href?.split('/').pop();

              if (question && id) {
                markets.push({
                  platform: 'kalshi',
                  externalId: id,
                  question,
                  currentOdds: { yes: 0.5, no: 0.5 },
                  volume: 0,
                  liquidity: 0,
                  closeDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
                });
              }
            } catch (e) {
              console.error('Failed to parse Kalshi market:', e);
            }
          }

          return markets;
        }

        return scanMarkets();
      `;

    default:
      return `
        return [];
      `;
  }
}

function parseMarketsFromNetwork(
  platform: string,
  traces: Array<{ url: string; responseBody?: string }>
): ScoutedMarket[] {
  const markets: ScoutedMarket[] = [];

  for (const trace of traces) {
    // Look for API responses that might contain market data
    if (
      trace.url.includes('/markets') ||
      trace.url.includes('/events') ||
      trace.url.includes('/api/')
    ) {
      if (trace.responseBody) {
        try {
          const data = JSON.parse(trace.responseBody);

          // Handle array responses
          const items = Array.isArray(data) ? data : data.markets || data.data || data.results || [];

          for (const item of items) {
            if (item.question || item.title || item.name) {
              markets.push({
                platform,
                externalId: item.id || item.slug || crypto.randomUUID(),
                question: item.question || item.title || item.name,
                currentOdds: {
                  yes: item.yes_price || item.yesPrice || item.probability || 0.5,
                  no: item.no_price || item.noPrice || (1 - (item.probability || 0.5))
                },
                volume: item.volume || item.total_volume || 0,
                liquidity: item.liquidity || item.volume * 0.3 || 0,
                closeDate: item.close_date || item.closeDate || item.end_date || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
              });
            }
          }
        } catch {}
      }
    }
  }

  return markets;
}
