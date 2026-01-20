/**
 * Limit Order Follower Bot
 *
 * Keeps limit orders on predict.fun at 5¢ cheaper than Polymarket asks.
 * Constantly repositions orders when PM prices change.
 * If PM price < 6¢, only keeps order on the opposite side.
 *
 * npx tsx bots/predictfun-btc15/strategies/limit-follower.ts
 */

import "dotenv/config";
import { config } from "dotenv";
config({ path: ".env.local" });

import fs from "fs";
import path from "path";
import WebSocket from "ws";

import { createClient, type Market, type PredictClient } from "../lib/client";

// Log file
const LOG_FILE = path.join(__dirname, "limit-follower.log");

// Config
const ORDER_SIZE = 159; // 100 shares per limit order
const PRICE_DISCOUNT = 0.05; // 5¢ cheaper than PM
const MIN_PM_PRICE = 0.06; // Don't place order if PM price < 6¢
const PRICE_CHANGE_THRESHOLD = 0.01; // Only reposition if price changed by 1¢+

// Polymarket state
let pmUpAsk: number | null = null;
let pmDownAsk: number | null = null;
let pmUpTokenId: string | null = null;
let pmDownTokenId: string | null = null;
let pmWs: WebSocket | null = null;
let pmTitle: string | null = null;

// predict.fun state
let pfClient: PredictClient | null = null;
let pfMarket: Market | null = null;
let pfMarketId: number | null = null;
let pfWs: WebSocket | null = null;
let pfRequestId = 1;
let pfTitle: string | null = null;

// Active orders
let activeUpOrderId: string | null = null;
let activeDownOrderId: string | null = null;
let activeUpPrice: number | null = null;
let activeDownPrice: number | null = null;

// Prevent concurrent order operations
let orderOperationInProgress = false;

function log(message: string) {
  const timestamp = new Date().toISOString();
  const line = `[${timestamp}] ${message}\n`;
  fs.appendFileSync(LOG_FILE, line);
}

function logError(context: string, error: unknown) {
  const timestamp = new Date().toISOString();
  const errorStr = error instanceof Error ? error.message : JSON.stringify(error);
  const line = `[${timestamp}] ERROR [${context}]: ${errorStr}\n`;
  fs.appendFileSync(LOG_FILE, line);
}

// Extract time window from market title
function extractTimeWindow(title: string | null): string | null {
  if (!title) return null;
  const match = title.match(/(\d{1,2}:\d{2}(?:AM|PM)?-\d{1,2}:\d{2}(?:AM|PM))/i);
  return match ? match[1].toUpperCase() : null;
}

// Check if both markets are on the same time window
function areMarketsInSync(): boolean {
  const pmWindow = extractTimeWindow(pmTitle);
  const pfWindow = extractTimeWindow(pfTitle);

  if (!pmWindow || !pfWindow) return false;

  const pmMatch = pmWindow.match(/(\d{1,2}:\d{2})(?:AM|PM)?-(\d{1,2}:\d{2})(AM|PM)/);
  const pfMatch = pfWindow.match(/(\d{1,2}:\d{2})(?:AM|PM)?-(\d{1,2}:\d{2})(AM|PM)/);

  if (!pmMatch || !pfMatch) return false;

  return pmMatch[1] === pfMatch[1] && pmMatch[2] === pfMatch[2] && pmMatch[3] === pfMatch[3];
}

// Find Polymarket BTC 15-min market
async function findPolymarketMarket(): Promise<boolean> {
  const now = new Date();
  const etTime = new Date(now.toLocaleString("en-US", { timeZone: "America/New_York" }));

  const month = etTime.toLocaleString("en-US", { month: "long" });
  const day = etTime.getDate();
  const hours = etTime.getHours();
  const minutes = Math.floor(etTime.getMinutes() / 15) * 15;
  const endMinutes = minutes + 15;

  const startHour = hours % 12 || 12;
  const endHour = endMinutes >= 60 ? ((hours + 1) % 12 || 12) : startHour;
  const ampm = hours >= 12 ? "PM" : "AM";
  const endAmpm = (endMinutes >= 60 && hours + 1 >= 12) || (endMinutes < 60 && hours >= 12) ? "PM" : "AM";

  const startMin = `:${minutes.toString().padStart(2, "0")}`;
  const endMin = `:${(endMinutes % 60).toString().padStart(2, "0")}`;

  const expectedTitle = `Bitcoin Up or Down - ${month} ${day}, ${startHour}${startMin}${ampm}-${endHour}${endMin}${endAmpm} ET`;

  try {
    const searchQuery = encodeURIComponent(expectedTitle);
    const res = await fetch(
      `https://gamma-api.polymarket.com/public-search?q=${searchQuery}&type=events&limit_per_type=5`
    );
    const searchResult = await res.json() as { events?: Array<{ title: string; markets: Array<{ clobTokenIds: string[] | string; outcomes: string[] | string }> }> };
    const events = searchResult.events || [];

    if (!events.length) return false;

    const event = events[0];
    pmTitle = event.title;
    const market = event.markets?.[0];
    if (!market) return false;

    const outcomes: string[] = Array.isArray(market.outcomes)
      ? market.outcomes
      : JSON.parse(market.outcomes as string);

    const clobTokenIds: string[] = typeof market.clobTokenIds === "string"
      ? JSON.parse(market.clobTokenIds)
      : market.clobTokenIds;

    const upIdx = outcomes.findIndex((o: string) => o === "Up");
    const downIdx = outcomes.findIndex((o: string) => o === "Down");

    if (upIdx === -1 || downIdx === -1) return false;

    pmUpTokenId = clobTokenIds[upIdx];
    pmDownTokenId = clobTokenIds[downIdx];

    return true;
  } catch {
    return false;
  }
}

// Connect to Polymarket WebSocket
function connectPolymarketWS() {
  if (!pmUpTokenId || !pmDownTokenId) return;

  pmWs = new WebSocket("wss://ws-subscriptions-clob.polymarket.com/ws/market");

  pmWs.on("open", () => {
    setTimeout(() => {
      if (pmWs?.readyState !== WebSocket.OPEN) return;
      pmWs.send(JSON.stringify({ type: "Market", assets_ids: [pmUpTokenId] }));
      pmWs.send(JSON.stringify({ type: "Market", assets_ids: [pmDownTokenId] }));
    }, 50);
  });

  pmWs.on("message", (data) => {
    try {
      const msg = JSON.parse(data.toString());

      if (Array.isArray(msg)) {
        for (const book of msg) updatePolymarketBook(book);
        onPriceUpdate();
        return;
      }

      if (msg.price_changes) {
        for (const change of msg.price_changes) {
          if (change.asset_id === pmUpTokenId) {
            if (change.best_ask) pmUpAsk = parseFloat(change.best_ask);
          } else if (change.asset_id === pmDownTokenId) {
            if (change.best_ask) pmDownAsk = parseFloat(change.best_ask);
          }
        }
        onPriceUpdate();
        return;
      }

      if (msg.asset_id && (msg.bids || msg.asks)) {
        updatePolymarketBook(msg);
        onPriceUpdate();
      }
    } catch {
      // Ignore
    }
  });

  pmWs.on("error", () => {});
  pmWs.on("close", () => setTimeout(connectPolymarketWS, 5000));
}

function updatePolymarketBook(book: { asset_id?: string; asks?: Array<{ price: string }> }) {
  const assetId = book.asset_id;
  if (!assetId) return;

  const asks = book.asks || [];

  let bestAsk: number | null = null;
  for (const ask of asks) {
    const price = parseFloat(ask.price);
    if (bestAsk === null || price < bestAsk) {
      bestAsk = price;
    }
  }

  if (assetId === pmUpTokenId) {
    pmUpAsk = bestAsk;
  } else if (assetId === pmDownTokenId) {
    pmDownAsk = bestAsk;
  }
}

// Connect to predict.fun WebSocket (for market sync detection)
function connectPredictFunWS() {
  if (!pfMarketId) return;

  const apiKey = process.env.PREDICTFUN_API_KEY;
  const wsUrl = apiKey ? `wss://ws.predict.fun/ws?apiKey=${apiKey}` : "wss://ws.predict.fun/ws";

  pfWs = new WebSocket(wsUrl);

  pfWs.on("open", () => {
    setTimeout(() => {
      if (pfWs?.readyState !== WebSocket.OPEN) return;
      const subscribeMsg = {
        method: "subscribe",
        requestId: pfRequestId++,
        params: [`predictOrderbook/${pfMarketId}`]
      };
      pfWs.send(JSON.stringify(subscribeMsg));
    }, 50);
  });

  pfWs.on("message", (data) => {
    try {
      const msg = JSON.parse(data.toString());

      if (msg.type === "M" && msg.topic === "heartbeat") {
        if (pfWs?.readyState === WebSocket.OPEN) {
          pfWs.send(JSON.stringify({ method: "heartbeat", data: msg.data }));
        }
      }
    } catch {
      // Ignore
    }
  });

  pfWs.on("error", () => {});
  pfWs.on("close", () => setTimeout(connectPredictFunWS, 5000));
}

// Calculate target limit prices based on PM prices
function calculateTargetPrices(): { upPrice: number | null; downPrice: number | null } {
  let upPrice: number | null = null;
  let downPrice: number | null = null;

  // UP order: PM UP ask >= 6¢ -> place at (PM UP ask - 5¢)
  if (pmUpAsk !== null && pmUpAsk >= MIN_PM_PRICE) {
    upPrice = Math.round((pmUpAsk - PRICE_DISCOUNT) * 100) / 100;
    if (upPrice < 0.01) upPrice = 0.01; // Min price
  }

  // DOWN order: PM DOWN ask >= 6¢ -> place at (PM DOWN ask - 5¢)
  if (pmDownAsk !== null && pmDownAsk >= MIN_PM_PRICE) {
    downPrice = Math.round((pmDownAsk - PRICE_DISCOUNT) * 100) / 100;
    if (downPrice < 0.01) downPrice = 0.01;
  }

  return { upPrice, downPrice };
}

// Check if we need to reposition orders
function needsRepositioning(targetUp: number | null, targetDown: number | null): boolean {
  // Check UP order
  if (targetUp === null && activeUpOrderId !== null) return true;
  if (targetUp !== null && activeUpOrderId === null) return true;
  if (targetUp !== null && activeUpPrice !== null) {
    if (Math.abs(targetUp - activeUpPrice) >= PRICE_CHANGE_THRESHOLD) return true;
  }

  // Check DOWN order
  if (targetDown === null && activeDownOrderId !== null) return true;
  if (targetDown !== null && activeDownOrderId === null) return true;
  if (targetDown !== null && activeDownPrice !== null) {
    if (Math.abs(targetDown - activeDownPrice) >= PRICE_CHANGE_THRESHOLD) return true;
  }

  return false;
}

// Cancel all active orders
async function cancelAllOrders(): Promise<void> {
  if (!pfClient) return;

  if (activeUpOrderId) {
    const success = await pfClient.cancelOrder(activeUpOrderId);
    if (success) {
      log(`Cancelled UP order: ${activeUpOrderId}`);
    } else {
      logError("cancel UP", "Failed to cancel");
    }
    activeUpOrderId = null;
    activeUpPrice = null;
  }

  if (activeDownOrderId) {
    const success = await pfClient.cancelOrder(activeDownOrderId);
    if (success) {
      log(`Cancelled DOWN order: ${activeDownOrderId}`);
    } else {
      logError("cancel DOWN", "Failed to cancel");
    }
    activeDownOrderId = null;
    activeDownPrice = null;
  }
}

// Place new limit orders
async function placeOrders(upPrice: number | null, downPrice: number | null): Promise<void> {
  if (!pfClient || !pfMarket) return;

  // Place UP order
  if (upPrice !== null) {
    const upOutcome = pfMarket.outcomes?.find(o => o.name === "Up");
    if (upOutcome) {
      const result = await pfClient.placeLimitOrder(pfMarket, upOutcome, upPrice, ORDER_SIZE);
      if (result.success) {
        activeUpOrderId = result.orderId || null;
        activeUpPrice = upPrice;
        log(`Placed UP order: ${upPrice * 100}¢ x ${ORDER_SIZE} (${result.orderId})`);
      } else {
        logError("place UP", result.error);
      }
    }
  }

  // Place DOWN order
  if (downPrice !== null) {
    const downOutcome = pfMarket.outcomes?.find(o => o.name === "Down");
    if (downOutcome) {
      const result = await pfClient.placeLimitOrder(pfMarket, downOutcome, downPrice, ORDER_SIZE);
      if (result.success) {
        activeDownOrderId = result.orderId || null;
        activeDownPrice = downPrice;
        log(`Placed DOWN order: ${downPrice * 100}¢ x ${ORDER_SIZE} (${result.orderId})`);
      } else {
        logError("place DOWN", result.error);
      }
    }
  }
}

// Reposition orders if needed
async function repositionOrders(): Promise<void> {
  if (orderOperationInProgress) return;

  const inSync = areMarketsInSync();
  if (!inSync) {
    // Cancel orders if markets out of sync
    if (activeUpOrderId || activeDownOrderId) {
      orderOperationInProgress = true;
      await cancelAllOrders();
      orderOperationInProgress = false;
    }
    return;
  }

  const { upPrice, downPrice } = calculateTargetPrices();

  if (!needsRepositioning(upPrice, downPrice)) return;

  orderOperationInProgress = true;

  // Cancel existing orders first
  await cancelAllOrders();

  // Place new orders
  await placeOrders(upPrice, downPrice);

  orderOperationInProgress = false;
}

// Called when PM prices update
function onPriceUpdate() {
  displayStatus();
  repositionOrders().catch(err => logError("repositionOrders", err));
}

// Display current status
function displayStatus() {
  const timestamp = new Date().toLocaleTimeString();
  const fmt = (p: number | null) => p !== null ? `${(p * 100).toFixed(1)}¢` : "  ?  ";

  const inSync = areMarketsInSync();
  const syncStatus = inSync ? '\x1B[32m✓ IN SYNC\x1B[0m' : '\x1B[31m✗ OUT OF SYNC\x1B[0m';

  const { upPrice, downPrice } = calculateTargetPrices();

  process.stdout.write('\x1B[2J\x1B[H');
  console.log(`═══════════════════════════════════════════════════════════`);
  console.log(`  Limit Order Follower Bot   ${timestamp}`);
  console.log(`═══════════════════════════════════════════════════════════`);
  console.log(`PM: ${pmTitle || 'searching...'}`);
  console.log(`PF: ${pfTitle || 'searching...'}`);
  console.log(`Status: ${syncStatus}`);
  console.log(`───────────────────────────────────────────────────────────`);
  console.log(`\n                      UP              DOWN`);
  console.log(`───────────────────────────────────────────────────────────`);
  console.log(`Polymarket ASK   ${fmt(pmUpAsk).padEnd(14)}    ${fmt(pmDownAsk)}`);
  console.log(`───────────────────────────────────────────────────────────`);
  console.log(`Target PF price  ${fmt(upPrice).padEnd(14)}    ${fmt(downPrice)}`);
  console.log(`(PM ask - 5¢, skip if PM < 6¢)`);
  console.log(`───────────────────────────────────────────────────────────`);

  console.log(`\nActive Limit Orders on predict.fun:`);

  if (activeUpOrderId) {
    console.log(`  \x1B[32m✓ UP:   ${activeUpPrice! * 100}¢ x ${ORDER_SIZE} shares\x1B[0m`);
  } else if (upPrice !== null) {
    console.log(`  \x1B[33m○ UP:   pending ${upPrice * 100}¢ x ${ORDER_SIZE}\x1B[0m`);
  } else {
    console.log(`  \x1B[90m- UP:   none (PM < 6¢)\x1B[0m`);
  }

  if (activeDownOrderId) {
    console.log(`  \x1B[32m✓ DOWN: ${activeDownPrice! * 100}¢ x ${ORDER_SIZE} shares\x1B[0m`);
  } else if (downPrice !== null) {
    console.log(`  \x1B[33m○ DOWN: pending ${downPrice * 100}¢ x ${ORDER_SIZE}\x1B[0m`);
  } else {
    console.log(`  \x1B[90m- DOWN: none (PM < 6¢)\x1B[0m`);
  }

  console.log(`───────────────────────────────────────────────────────────`);
  console.log(`Order size: ${ORDER_SIZE} shares | Discount: ${PRICE_DISCOUNT * 100}¢`);
  console.log(`Min PM price to place order: ${MIN_PM_PRICE * 100}¢`);

  if (!inSync) {
    console.log(`\n\x1B[43m\x1B[30m  ⏳ WAITING FOR MARKETS TO SYNC  \x1B[0m`);
  }
}

async function main() {
  console.log("Initializing Limit Order Follower Bot...\n");
  console.log(`Log file: ${LOG_FILE}\n`);
  log("=== Bot started ===");

  // Initialize predict.fun
  console.log("1. Initializing predict.fun...");
  pfClient = await createClient();
  const market = await pfClient.getActiveMarket();
  if (market) {
    pfMarket = await pfClient.getMarketDetails(market.id);
    pfMarketId = market.id;
    pfTitle = pfMarket?.title || null;
    console.log(`   ${pfTitle}`);
  } else {
    console.log("   No market found");
    return;
  }

  // Find Polymarket market
  console.log("\n2. Finding Polymarket market...");
  const pmFound = await findPolymarketMarket();
  if (!pmFound) {
    console.log("   No market found");
    return;
  }
  console.log(`   ${pmTitle}`);

  // Connect WebSockets
  console.log("\n3. Connecting WebSockets...");
  connectPolymarketWS();
  connectPredictFunWS();
  console.log("   Connected\n");

  // Refresh markets every 15 seconds
  setInterval(async () => {
    const oldPmTokenId = pmUpTokenId;
    const oldPfMarketId = pfMarketId;

    // Check Polymarket
    await findPolymarketMarket();
    if (pmUpTokenId !== oldPmTokenId) {
      log(`PM market changed: ${pmTitle}`);
      // Cancel all orders on market change
      await cancelAllOrders();
      if (pmWs) pmWs.close();
      connectPolymarketWS();
    }

    // Check predict.fun
    if (pfClient) {
      const newMarket = await pfClient.getActiveMarket();
      if (newMarket && newMarket.id !== oldPfMarketId) {
        pfMarket = await pfClient.getMarketDetails(newMarket.id);
        pfMarketId = newMarket.id;
        pfTitle = pfMarket?.title || null;
        log(`PF market changed: ${pfTitle}`);
        // Cancel all orders on market change
        await cancelAllOrders();
        if (pfWs) pfWs.close();
        connectPredictFunWS();
      }
    }
  }, 15000);

  // Initial status display
  displayStatus();
}

main().catch(console.error);
