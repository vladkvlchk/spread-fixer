/**
 * Cross-platform arbitrage logic
 *
 * Strategy:
 * 1. Monitor Polymarket order books for good market buy opportunities
 * 2. When we can buy at price X on Polymarket
 * 3. Place limit sell order at price X + 2%+ on predict.fun
 * 4. If/when predict.fun order fills, we profit the spread
 *
 * Risk management:
 * - Only enter if spread >= MIN_SPREAD_PERCENT
 * - Track positions across platforms
 * - Set max position size per market
 */

import type { ArbitrageOpportunity, OrderBook, Platform } from "./platforms/types";
import { getOrderBookByTokenId } from "./platforms/polymarket";

// Configuration
export const ARB_CONFIG = {
  // Minimum spread to consider (accounts for fees, slippage, errors)
  MIN_SPREAD_PERCENT: 2.0,

  // Maximum position size per market (in USD)
  MAX_POSITION_USD: 100,

  // Polling interval for order book monitoring (ms)
  POLL_INTERVAL_MS: 1000,

  // Platforms config
  BUY_PLATFORM: "polymarket" as Platform,
  SELL_PLATFORM: "predictfun" as Platform,
};

export interface MonitoredMarket {
  title: string;
  polymarketTokenId: string;
  predictfunMarketId: string;
  outcomeName: string;
  enabled: boolean;
}

// Markets we're monitoring for arbitrage
export const MONITORED_MARKETS: MonitoredMarket[] = [
  // TODO: Add markets to monitor
  // {
  //   title: "BTC 15-min Up/Down",
  //   polymarketTokenId: "...",
  //   predictfunMarketId: "...",
  //   outcomeName: "Up",
  //   enabled: true,
  // },
];

/**
 * Calculate best executable price from order book
 * For BUY: look at asks (we're taking from sellers)
 * For SELL: look at bids (we're taking from buyers)
 */
export function getBestPrice(
  orderBook: OrderBook,
  side: "BUY" | "SELL",
  size: number
): { price: number; fillableSize: number } | null {
  const levels = side === "BUY" ? orderBook.asks : orderBook.bids;

  if (!levels || levels.length === 0) return null;

  let remainingSize = size;
  let totalCost = 0;
  let fillableSize = 0;

  for (const level of levels) {
    const takeSize = Math.min(remainingSize, level.size);
    totalCost += takeSize * level.price;
    fillableSize += takeSize;
    remainingSize -= takeSize;

    if (remainingSize <= 0) break;
  }

  if (fillableSize === 0) return null;

  return {
    price: totalCost / fillableSize, // Volume-weighted average price
    fillableSize,
  };
}

/**
 * Check for arbitrage opportunity between two order books
 */
export function findArbitrageOpportunity(
  buyBook: OrderBook,
  sellBook: OrderBook,
  marketTitle: string,
  outcomeName: string,
  targetSize: number = 100 // Default $100
): ArbitrageOpportunity | null {
  // Get best buy price from buy platform (we're buying, so look at asks)
  const buyResult = getBestPrice(buyBook, "BUY", targetSize);
  if (!buyResult) return null;

  // Get best sell price from sell platform (we're selling, so look at bids)
  const sellResult = getBestPrice(sellBook, "SELL", targetSize);
  if (!sellResult) return null;

  const spread = sellResult.price - buyResult.price;
  const spreadPercent = (spread / buyResult.price) * 100;

  // Only return if profitable
  if (spreadPercent < ARB_CONFIG.MIN_SPREAD_PERCENT) return null;

  const maxSize = Math.min(buyResult.fillableSize, sellResult.fillableSize);

  return {
    buyPlatform: buyBook.platform,
    sellPlatform: sellBook.platform,
    market: {
      title: marketTitle,
      polymarketId: buyBook.platform === "polymarket" ? buyBook.marketId : undefined,
      predictfunId: sellBook.platform === "predictfun" ? sellBook.marketId : undefined,
    },
    outcomeIndex: buyBook.outcomeIndex,
    outcomeName,
    buyPrice: buyResult.price,
    sellPrice: sellResult.price,
    spread,
    spreadPercent,
    maxSize,
    potentialProfit: spread * maxSize,
  };
}

/**
 * Execute arbitrage trade
 *
 * 1. Place limit sell order on predict.fun first (safer - can cancel if buy fails)
 * 2. Execute market buy on Polymarket
 * 3. Track position until predict.fun order fills
 */
export async function executeArbitrage(
  opportunity: ArbitrageOpportunity,
  size: number
): Promise<{
  success: boolean;
  error?: string;
  buyOrderId?: string;
  sellOrderId?: string;
}> {
  // TODO: Implement once predict.fun adapter is ready

  console.log("executeArbitrage called with:", {
    opportunity,
    size,
  });

  return {
    success: false,
    error: "Not implemented yet - waiting for predict.fun API",
  };
}

/**
 * Monitor markets for arbitrage opportunities
 * Returns async generator that yields opportunities
 */
export async function* monitorArbitrageOpportunities(
  markets: MonitoredMarket[]
): AsyncGenerator<ArbitrageOpportunity> {
  const enabledMarkets = markets.filter(m => m.enabled);

  while (true) {
    for (const market of enabledMarkets) {
      try {
        // Get Polymarket order book
        const polyBook = await getOrderBookByTokenId(market.polymarketTokenId);
        if (!polyBook) continue;

        // TODO: Get predict.fun order book once adapter is ready
        // const predictBook = await predictfunAdapter.getOrderBook(...);
        // if (!predictBook) continue;

        // For now, skip actual opportunity detection
        // const opp = findArbitrageOpportunity(polyBook, predictBook, market.title, market.outcomeName);
        // if (opp) yield opp;
      } catch (e) {
        console.error(`Error monitoring ${market.title}:`, e);
      }
    }

    // Wait before next poll
    await new Promise(resolve => setTimeout(resolve, ARB_CONFIG.POLL_INTERVAL_MS));
  }
}
