/**
 *  npx tsx bots/predictfun-btc15/strategies/trend-follow.ts
 * Trend Following Strategy for BTC 15-min markets
 *
 * - If current BTC price > starting price → BUY UP at 40¢
 * - If current BTC price < starting price → BUY DOWN at 40¢
 * - Position size: $1
 * - Update every 2 seconds
 */

import { createClient, getBtcPrice, parseStartingPrice, type Market, type PredictClient } from "../lib/client";

const PRICE = 0.40; // 40 cents
const SIZE = 2.5;   // $1 total ($1 / 0.40 = 2.5 shares)
const INTERVAL = 2000; // 2 seconds

let client: PredictClient;
let currentMarket: Market | null = null;
let currentOrderId: string | null = null;
let currentSide: "UP" | "DOWN" | null = null;
let startingPrice: number | null = null;

let lastNoMarketLog = 0;
let isTickRunning = false;

async function refreshMarket() {
  const market = await client.getActiveMarket();
  if (!market) {
    const now = Date.now();
    if (now - lastNoMarketLog > 10000) {
      console.log("No market data");
      lastNoMarketLog = now;
    }
    return false;
  }

  // Check if market changed
  if (currentMarket?.id !== market.id) {
    console.log(`\n📈 New market: ${market.title}`);
    currentMarket = await client.getMarketDetails(market.id);
    if (currentMarket?.description) {
      startingPrice = parseStartingPrice(currentMarket.description);
      console.log(`   Starting price: $${startingPrice?.toLocaleString()}`);
    }
    // Cancel old order if market changed
    if (currentOrderId) {
      await client.cancelOrder(currentOrderId);
      currentOrderId = null;
      currentSide = null;
    }
  }
  return true;
}

async function tick() {
  if (isTickRunning) return; // Prevent concurrent execution
  isTickRunning = true;

  try {
    // Refresh market if needed
    if (!await refreshMarket()) return;
    if (!currentMarket || !startingPrice) return;

    // Get current BTC price
    const btcPrice = await getBtcPrice();
    const targetSide: "UP" | "DOWN" = btcPrice > startingPrice ? "UP" : "DOWN";
    const diff = btcPrice - startingPrice;
    const diffPercent = ((diff / startingPrice) * 100).toFixed(3);

    const timestamp = new Date().toLocaleTimeString();
    const priceStr = btcPrice.toLocaleString(undefined, { maximumFractionDigits: 2 });
    const arrow = diff > 0 ? "↑" : "↓";

    // If side changed, cancel old order first
    if (currentSide && currentSide !== targetSide && currentOrderId) {
      console.log(`[${timestamp}] Side changed ${currentSide} → ${targetSide}, canceling...`);
      const canceled = await client.cancelOrder(currentOrderId);
      console.log(`[${timestamp}] ${canceled ? "✅ Canceled" : "⚠️ Cancel failed"} ${currentOrderId.slice(0, 8)}...`);
      currentOrderId = null;
      currentSide = null;
    }

    // Place new order if needed
    if (!currentOrderId) {
      const outcome = currentMarket.outcomes?.find(o => o.name === (targetSide === "UP" ? "Up" : "Down"));
      if (!outcome) {
        console.log(`[${timestamp}] Outcome not found`);
        return;
      }

      const result = await client.placeLimitOrder(currentMarket, outcome, PRICE, SIZE);
      if (result.success) {
        currentOrderId = result.orderId!;
        currentSide = targetSide;
        console.log(`[${timestamp}] $${priceStr} ${arrow} ${diffPercent}% | BUY ${targetSide} @ ${PRICE * 100}¢ | ✅ ${currentOrderId.slice(0, 8)}...`);
      } else {
        console.log(`[${timestamp}] $${priceStr} ${arrow} ${diffPercent}% | BUY ${targetSide} @ ${PRICE * 100}¢ | ❌ ${result.error}`);
      }
    } else {
      // Just log status
      console.log(`[${timestamp}] $${priceStr} ${arrow} ${diffPercent}% | HOLDING ${currentSide} @ ${PRICE * 100}¢`);
    }
  } catch (error) {
    console.error(`Error:`, error);
  } finally {
    isTickRunning = false;
  }
}

async function main() {
  console.log("═".repeat(60));
  console.log("  BTC 15-Min Trend Follower - predict.fun");
  console.log("═".repeat(60));
  console.log(`\nStrategy: BUY ${PRICE * 100}¢ on winning side`);
  console.log(`Position: $${PRICE * SIZE} (${SIZE} shares)`);
  console.log(`Interval: ${INTERVAL / 1000}s\n`);

  console.log("Initializing...");
  client = await createClient();
  console.log("✅ Ready\n");

  // Initial tick
  await tick();

  // Run every 2 seconds
  setInterval(tick, INTERVAL);
}

main().catch(console.error);
