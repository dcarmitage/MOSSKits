import type { Trade, TradeDirection } from '../types';
import { logJournalEntry } from './chronicler';

/**
 * Trader Agent
 * Executes trades via Playwriter MCP or records for manual execution
 */

export interface TradeResult {
  trade: Trade;
  executed: boolean;
  message: string;
}

export async function executeTrade(
  db: D1Database,
  playwriterUrl: string | null,
  marketId: string,
  evaluationId: string | null,
  direction: TradeDirection,
  size: number,
  entryOdds: number
): Promise<TradeResult> {
  const tradeId = crypto.randomUUID();

  // Get market info
  const market = await db.prepare(
    'SELECT * FROM markets WHERE id = ?'
  ).bind(marketId).first<{ platform: string; external_id: string; question: string }>();

  if (!market) {
    throw new Error('Market not found');
  }

  await logJournalEntry(db, 'trader', 'trade_initiated', {
    tradeId,
    marketId,
    direction,
    size,
    entryOdds,
    platform: market.platform
  }, undefined, marketId);

  let executed = false;
  let txHash: string | null = null;
  let message = '';

  // Attempt execution via Playwriter if available
  if (playwriterUrl) {
    try {
      const result = await executeViaPlaywriter(
        playwriterUrl,
        market.platform,
        market.external_id,
        direction,
        size,
        entryOdds
      );

      executed = result.success;
      txHash = result.txHash || null;
      message = result.message;

      await logJournalEntry(db, 'trader', executed ? 'trade_executed' : 'trade_failed', {
        tradeId,
        txHash,
        message
      }, undefined, marketId);
    } catch (error) {
      message = `Playwriter execution failed: ${error instanceof Error ? error.message : 'Unknown error'}`;
      await logJournalEntry(db, 'trader', 'trade_failed', {
        tradeId,
        error: message
      }, undefined, marketId);
    }
  } else {
    message = 'Trade recorded. Playwriter not connected - manual execution required.';
    await logJournalEntry(db, 'trader', 'trade_recorded', {
      tradeId,
      message: 'Manual execution required'
    }, undefined, marketId);
  }

  // Record trade
  await db.prepare(`
    INSERT INTO trades (id, market_id, evaluation_id, direction, size, entry_odds, status, tx_hash, executed_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    tradeId,
    marketId,
    evaluationId,
    direction,
    size,
    entryOdds,
    executed ? 'executed' : 'pending',
    txHash,
    executed ? new Date().toISOString() : null
  ).run();

  // Update market status
  await db.prepare(`
    UPDATE markets SET status = 'traded', updated_at = datetime('now')
    WHERE id = ?
  `).bind(marketId).run();

  const trade = await db.prepare(
    'SELECT * FROM trades WHERE id = ?'
  ).bind(tradeId).first<Trade>();

  return {
    trade: trade!,
    executed,
    message
  };
}

interface PlaywriterResult {
  success: boolean;
  txHash?: string;
  message: string;
}

async function executeViaPlaywriter(
  playwriterUrl: string,
  platform: string,
  externalId: string,
  direction: TradeDirection,
  size: number,
  entryOdds: number
): Promise<PlaywriterResult> {
  // Playwriter MCP execute endpoint
  // This generates code to execute in the browser context

  const code = generateTradingCode(platform, externalId, direction, size, entryOdds);

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
    result?: unknown;
    error?: string;
    networkTraces?: Array<{
      url: string;
      method: string;
      responseStatus: number;
      responseBody?: string;
    }>;
  };

  if (!result.success) {
    return {
      success: false,
      message: result.error || 'Execution failed'
    };
  }

  // Try to extract transaction hash from network traces or result
  let txHash: string | undefined;

  if (result.networkTraces) {
    for (const trace of result.networkTraces) {
      if (trace.responseBody) {
        try {
          const body = JSON.parse(trace.responseBody);
          if (body.transactionHash || body.txHash || body.hash) {
            txHash = body.transactionHash || body.txHash || body.hash;
            break;
          }
        } catch {}
      }
    }
  }

  return {
    success: true,
    txHash,
    message: 'Trade executed via Playwriter'
  };
}

function generateTradingCode(
  platform: string,
  externalId: string,
  direction: TradeDirection,
  size: number,
  entryOdds: number
): string {
  // Generate platform-specific trading code
  // This code runs in the browser context via Playwriter

  switch (platform.toLowerCase()) {
    case 'polymarket':
      return `
        // Polymarket trade execution
        // Assumes user is logged in and on the market page

        async function executeTrade() {
          // Find the ${direction.toUpperCase()} button
          const outcomeButton = document.querySelector('[data-outcome="${direction}"]');
          if (!outcomeButton) {
            throw new Error('Outcome button not found. Ensure you are on the market page.');
          }

          // Click to select outcome
          outcomeButton.click();
          await new Promise(r => setTimeout(r, 500));

          // Find amount input and enter size
          const amountInput = document.querySelector('input[type="number"], input[placeholder*="amount"], input[placeholder*="Amount"]');
          if (amountInput) {
            amountInput.value = '';
            amountInput.focus();
            document.execCommand('insertText', false, '${size}');
            amountInput.dispatchEvent(new Event('input', { bubbles: true }));
          }

          await new Promise(r => setTimeout(r, 500));

          // Find and click the trade/buy button
          const tradeButton = document.querySelector('button[type="submit"], button:contains("Buy"), button:contains("Trade")');
          if (tradeButton && !tradeButton.disabled) {
            tradeButton.click();
            return { success: true, message: 'Trade submitted' };
          }

          return { success: false, message: 'Trade button not found or disabled' };
        }

        return executeTrade();
      `;

    case 'kalshi':
      return `
        // Kalshi trade execution
        async function executeTrade() {
          // Similar structure for Kalshi
          // Platform-specific selectors would go here

          return {
            success: false,
            message: 'Kalshi execution not yet implemented. Market ID: ${externalId}'
          };
        }

        return executeTrade();
      `;

    default:
      return `
        return {
          success: false,
          message: 'Unsupported platform: ${platform}'
        };
      `;
  }
}

export async function cancelTrade(
  db: D1Database,
  tradeId: string
): Promise<Trade> {
  const trade = await db.prepare(
    'SELECT * FROM trades WHERE id = ?'
  ).bind(tradeId).first<Trade>();

  if (!trade) {
    throw new Error('Trade not found');
  }

  if (trade.status !== 'pending') {
    throw new Error('Can only cancel pending trades');
  }

  await db.prepare(`
    UPDATE trades SET status = 'cancelled' WHERE id = ?
  `).bind(tradeId).run();

  await logJournalEntry(db, 'trader', 'trade_cancelled', {
    tradeId
  }, undefined, trade.market_id);

  const updated = await db.prepare(
    'SELECT * FROM trades WHERE id = ?'
  ).bind(tradeId).first<Trade>();

  return updated!;
}
