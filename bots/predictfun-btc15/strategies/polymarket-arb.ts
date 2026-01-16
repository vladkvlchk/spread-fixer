/**
 * Polymarket Price Follow Bot
 *
 * Monitors BTC 15-min prices on Polymarket via WebSocket
 * Places orders on predict.fun with 3¢ spread following Polymarket prices
 *
 * npx tsx bots/predictfun-btc15/strategies/polymarket-arb.ts
 */

import WebSocket from "ws";
import { createClient, type Market, type PredictClient } from "../lib/client";

const SPREAD = 0.03; // 3 cents spread
const MIN_VALID_PRICE = 0.02; // Don't place orders at 1¢ or below
const MAX_VALID_PRICE = 0.98; // Don't place orders at 99¢ or above

// Farming settings
const FARMING_MIN_SECONDS = 180; // Only farm if > 3 minutes left
const FARMING_PRICE = 0.01; // 1¢
const FARMING_SIZE = 100; // 100 shares ($1 at 1¢) - reduced for safety

interface PolymarketEvent {
  title: string;
  slug: string;
  markets: Array<{
    conditionId: string;
    clobTokenIds: string[];
    outcomePrices: string[];
    outcomes: string[];
  }>;
}

let upTokenId: string | null = null;
let downTokenId: string | null = null;
let conditionId: string | null = null;
let currentTitle: string | null = null;
let currentSlug: string | null = null;

let upBestBid: number | null = null;
let upBestAsk: number | null = null;
let downBestBid: number | null = null;
let downBestAsk: number | null = null;

let ws: WebSocket | null = null;

// predict.fun state
let pfClient: PredictClient | null = null;
let pfMarket: Market | null = null;
let currentUpBuyOrderId: string | null = null;
let currentDownBuyOrderId: string | null = null;
let lastPlacedUpPrice: number | null = null;
let lastPlacedDownPrice: number | null = null;
let isUpdatingOrders = false;

// Farming orders state
let farmingUpOrderId: string | null = null;
let farmingDownOrderId: string | null = null;
let isUpdatingFarming = false;
let lastPricesValid = false; // Track if prices are in valid range
let marketsReady = false; // Both Polymarket and predict.fun have matching markets

// Calculate expected market title based on current ET time
function getExpectedMarketTitle(): string {
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

  return `Bitcoin Up or Down - ${month} ${day}, ${startHour}${startMin}${ampm}-${endHour}${endMin}${endAmpm} ET`;
}

// Calculate seconds until current 15-min window ends
function getSecondsUntilMarketEnd(): number {
  const now = new Date();
  const etTime = new Date(now.toLocaleString("en-US", { timeZone: "America/New_York" }));

  const currentMinutes = etTime.getMinutes();
  const currentSeconds = etTime.getSeconds();

  // Next 15-min boundary
  const nextBoundary = Math.ceil((currentMinutes + 1) / 15) * 15;
  const minutesUntilEnd = nextBoundary - currentMinutes - 1;
  const secondsUntilEnd = (60 - currentSeconds) + (minutesUntilEnd * 60);

  return secondsUntilEnd;
}

// Find current BTC 15-min market on Polymarket
async function findCurrentMarket(): Promise<boolean> {
  try {
    const expectedTitle = getExpectedMarketTitle();
    console.log(`Looking for: "${expectedTitle}"`);

    const searchQuery = encodeURIComponent(expectedTitle);
    const res = await fetch(
      `https://gamma-api.polymarket.com/public-search?q=${searchQuery}&type=events&limit_per_type=5`
    );
    const searchResult = await res.json() as { events?: PolymarketEvent[] };
    const events = searchResult.events || [];

    if (events.length > 0) {
      const event = events[0];
      console.log(`Found: ${event.title}`);
      console.log(`Link: https://polymarket.com/event/${event.slug}`);
    }

    if (!events || events.length === 0) {
      console.log("No active BTC 15-min markets found on Polymarket");
      return false;
    }

    const event = events[0];
    const market = event.markets?.[0];
    if (!market) {
      console.log("No market in event");
      return false;
    }

    let outcomes = market.outcomes;
    if (typeof outcomes === "string") {
      outcomes = JSON.parse(outcomes);
    }

    const clobTokenIds = typeof market.clobTokenIds === "string"
      ? JSON.parse(market.clobTokenIds)
      : market.clobTokenIds;

    if (!clobTokenIds || clobTokenIds.length < 2) {
      console.log("Invalid clobTokenIds");
      return false;
    }

    const upIdx = outcomes?.findIndex((o: string) => o === "Up");
    const downIdx = outcomes?.findIndex((o: string) => o === "Down");

    if (upIdx === -1 || downIdx === -1) {
      console.log("Could not find Up/Down outcomes");
      return false;
    }

    upTokenId = clobTokenIds[upIdx];
    downTokenId = clobTokenIds[downIdx];
    conditionId = market.conditionId;
    currentTitle = event.title;
    currentSlug = event.slug;

    console.log(`\n📈 Polymarket: ${currentTitle}`);
    console.log(`   UP token: ${upTokenId?.slice(0, 20)}...`);
    console.log(`   DOWN token: ${downTokenId?.slice(0, 20)}...\n`);

    return true;
  } catch (error) {
    console.error("Error finding market:", error);
    return false;
  }
}

// Check and switch to new Polymarket market if needed
async function refreshPolymarketMarket() {
  const expectedTitle = getExpectedMarketTitle();

  // If title changed, we need a new market
  if (currentTitle && currentTitle !== expectedTitle) {
    console.log(`\n⏰ Market window changed, looking for new market...`);

    // IMMEDIATELY stop all trading
    marketsReady = false;
    lastPricesValid = false;

    // Cancel existing orders on predict.fun
    if (pfClient) {
      if (currentUpBuyOrderId) {
        await pfClient.cancelOrder(currentUpBuyOrderId);
        currentUpBuyOrderId = null;
      }
      if (currentDownBuyOrderId) {
        await pfClient.cancelOrder(currentDownBuyOrderId);
        currentDownBuyOrderId = null;
      }
      // Cancel farming orders
      if (farmingUpOrderId) {
        await pfClient.cancelOrder(farmingUpOrderId);
        farmingUpOrderId = null;
      }
      if (farmingDownOrderId) {
        await pfClient.cancelOrder(farmingDownOrderId);
        farmingDownOrderId = null;
      }
    }

    // Close old WebSocket
    if (ws) {
      ws.close();
      ws = null;
    }

    // Reset state
    upTokenId = null;
    downTokenId = null;
    upBestBid = null;
    upBestAsk = null;
    downBestBid = null;
    downBestAsk = null;
    lastPrintedPrices = "";
    lastPlacedUpPrice = null;
    lastPlacedDownPrice = null;
    pfMarket = null; // Reset predict.fun market too

    // Find new Polymarket market
    const found = await findCurrentMarket();
    if (found) {
      // Also need to find new predict.fun market
      if (pfClient) {
        const newPfMarket = await pfClient.getActiveMarket();
        if (newPfMarket) {
          pfMarket = await pfClient.getMarketDetails(newPfMarket.id);
          if (pfMarket) {
            console.log(`📈 predict.fun: ${pfMarket.title}`);
            marketsReady = true;
          }
        }
      }
      connectWebSocket();
    }
  }
}

// Connect to Polymarket WebSocket for real-time orderbook
function connectWebSocket() {
  if (!upTokenId || !downTokenId) {
    console.log("No tokens to subscribe to");
    return;
  }

  ws = new WebSocket("wss://ws-subscriptions-clob.polymarket.com/ws/market");

  ws.on("open", () => {
    console.log("WebSocket connected");

    // Subscribe to orderbook for both tokens
    const subscribeUp = {
      type: "Market",
      assets_ids: [upTokenId],
    };
    const subscribeDown = {
      type: "Market",
      assets_ids: [downTokenId],
    };

    ws!.send(JSON.stringify(subscribeUp));
    ws!.send(JSON.stringify(subscribeDown));
    console.log("Subscribed to orderbook updates");
  });

  ws.on("message", (data) => {
    try {
      const msg = JSON.parse(data.toString());

      // Initial orderbook snapshot comes as array
      if (Array.isArray(msg)) {
        for (const book of msg) {
          if (book.asset_id === upTokenId || book.asset_id === downTokenId) {
            updateFromBook(book);
          }
        }
        printPrices();
        return;
      }

      // Price changes update
      if (msg.price_changes) {
        for (const change of msg.price_changes) {
          const assetId = change.asset_id;
          if (assetId === upTokenId) {
            if (change.best_bid) upBestBid = parseFloat(change.best_bid);
            if (change.best_ask) upBestAsk = parseFloat(change.best_ask);
          } else if (assetId === downTokenId) {
            if (change.best_bid) downBestBid = parseFloat(change.best_bid);
            if (change.best_ask) downBestAsk = parseFloat(change.best_ask);
          }
        }
        printPrices();
        return;
      }

      // Single book update
      if (msg.asset_id && (msg.bids || msg.asks)) {
        updateFromBook(msg);
        printPrices();
      }
    } catch (e) {
      // Ignore parse errors
    }
  });

  ws.on("error", (error) => {
    console.error("WebSocket error:", error.message);
  });

  ws.on("close", () => {
    console.log("WebSocket closed, reconnecting in 5s...");
    setTimeout(connectWebSocket, 5000);
  });
}

function updateFromBook(book: { asset_id?: string; bids?: Array<{ price: string }>; asks?: Array<{ price: string }> }) {
  const assetId = book.asset_id;
  if (!assetId) return;

  const bids = book.bids || [];
  const asks = book.asks || [];

  // Find HIGHEST bid and LOWEST ask (bids may be sorted ascending)
  let bestBid: number | null = null;
  let bestAsk: number | null = null;

  for (const bid of bids) {
    const price = parseFloat(bid.price);
    if (bestBid === null || price > bestBid) bestBid = price;
  }
  for (const ask of asks) {
    const price = parseFloat(ask.price);
    if (bestAsk === null || price < bestAsk) bestAsk = price;
  }

  if (assetId === upTokenId) {
    upBestBid = bestBid;
    upBestAsk = bestAsk;
  } else if (assetId === downTokenId) {
    downBestBid = bestBid;
    downBestAsk = bestAsk;
  }
}

let lastPrintedPrices = "";

// Check if current market matches expected time window
function isMarketStillValid(): boolean {
  if (!currentTitle) return false;

  // Get current ET time
  const now = new Date();
  const etTime = new Date(now.toLocaleString("en-US", { timeZone: "America/New_York" }));
  const currentHour = etTime.getHours();
  const currentMinute = etTime.getMinutes();

  // Extract end time from current market title (e.g., "10:45-11:00AM ET" or "10:45AM-11:00AM ET")
  // We need to check if current time is BEFORE the end time
  const endTimeMatch = currentTitle.match(/-(\d{1,2}):(\d{2})([AP]M)\s*ET/);
  if (!endTimeMatch) return false;

  let endHour = parseInt(endTimeMatch[1]);
  const endMinute = parseInt(endTimeMatch[2]);
  const endAmPm = endTimeMatch[3];

  // Convert to 24h format
  if (endAmPm === "PM" && endHour !== 12) endHour += 12;
  if (endAmPm === "AM" && endHour === 12) endHour = 0;

  // Current time should be BEFORE end time
  if (currentHour > endHour) return false;
  if (currentHour === endHour && currentMinute >= endMinute) return false;

  return true;
}

// Manage farming orders (1¢ orders on both sides for points)
async function updateFarmingOrders() {
  if (!pfClient || !pfMarket) return;
  if (!marketsReady) return; // Don't farm if markets not ready
  if (isUpdatingFarming) return; // Prevent concurrent updates

  // Set lock IMMEDIATELY
  isUpdatingFarming = true;

  // CRITICAL: Check if market is still valid for current time
  if (!isMarketStillValid()) {
    console.log(`⚠️ Market expired! Stopping all trading.`);
    marketsReady = false;
    isUpdatingFarming = false;
    return;
  }

  try {
    const secondsLeft = getSecondsUntilMarketEnd();

    // Farm only if prices are valid AND > 3 min left AND markets are ready
    const shouldFarm = marketsReady && lastPricesValid && secondsLeft > FARMING_MIN_SECONDS;

    // Check actual order IDs, not just the flag
    const hasFarmingOrders = farmingUpOrderId !== null && farmingDownOrderId !== null;

    if (shouldFarm && !hasFarmingOrders) {
      // Start farming - place 1¢ orders on both sides (just once)
      const upOutcome = pfMarket.outcomes?.find(o => o.name === "Up");
      const downOutcome = pfMarket.outcomes?.find(o => o.name === "Down");

      if (!upOutcome || !downOutcome) {
        return;
      }

      const timestamp = new Date().toLocaleTimeString();

      // Place farming orders
      const upResult = await pfClient.placeLimitOrder(pfMarket, upOutcome, FARMING_PRICE, FARMING_SIZE);
      if (upResult.success) {
        farmingUpOrderId = upResult.orderId!;
      }

      const downResult = await pfClient.placeLimitOrder(pfMarket, downOutcome, FARMING_PRICE, FARMING_SIZE);
      if (downResult.success) {
        farmingDownOrderId = downResult.orderId!;
      }

      const upStatus = upResult.success ? "✅" : `❌${upResult.error ? ` ${upResult.error}` : ""}`;
      const downStatus = downResult.success ? "✅" : `❌${downResult.error ? ` ${downResult.error}` : ""}`;
      console.log(`[${timestamp}] 🌾 Farming: UP 1¢ x${FARMING_SIZE} ${upStatus} | DOWN 1¢ x${FARMING_SIZE} ${downStatus} (${secondsLeft}s left)`);

    } else if (!shouldFarm && (farmingUpOrderId || farmingDownOrderId)) {
      // Stop farming - cancel orders (check actual order IDs, not flag)
      const timestamp = new Date().toLocaleTimeString();

      if (farmingUpOrderId) {
        await pfClient.cancelOrder(farmingUpOrderId);
        farmingUpOrderId = null;
      }
      if (farmingDownOrderId) {
        await pfClient.cancelOrder(farmingDownOrderId);
        farmingDownOrderId = null;
      }

      const reason = !lastPricesValid ? "prices extreme" : `${secondsLeft}s left`;
      console.log(`[${timestamp}] 🌾 Farming stopped (${reason})`);
    }
  } finally {
    isUpdatingFarming = false;
  }
}

// Update predict.fun orders based on Polymarket prices
async function updatePredictFunOrders(): Promise<boolean> {
  if (isUpdatingOrders || !pfClient || !pfMarket) return false;
  if (!marketsReady) return false; // Don't place orders if markets not ready
  if (upBestBid === null || downBestBid === null) return false;

  // CRITICAL: Check if market is still valid for current time
  if (!isMarketStillValid()) {
    console.log(`⚠️ Market expired! Stopping all trading.`);
    marketsReady = false;
    lastPricesValid = false;
    return false;
  }

  // Calculate target prices first to check if they're valid
  const targetUpPrice = Math.round(upBestBid * 100) / 100;
  const targetDownPrice = Math.round(downBestBid * 100) / 100;

  const pmTotal = targetUpPrice + targetDownPrice;
  const targetTotal = 1 - SPREAD; // 97¢
  const totalOffset = Math.max(0, pmTotal - targetTotal);

  const upOffset = Math.round(totalOffset * 100 / 2) / 100;
  const downOffset = Math.round((totalOffset - upOffset) * 100) / 100;

  const upBuyPrice = Math.round((targetUpPrice - upOffset) * 100) / 100;
  const downBuyPrice = Math.round((targetDownPrice - downOffset) * 100) / 100;

  // Check if prices are within valid range (not too extreme)
  const pricesValid = upBuyPrice >= MIN_VALID_PRICE && upBuyPrice <= MAX_VALID_PRICE &&
                      downBuyPrice >= MIN_VALID_PRICE && downBuyPrice <= MAX_VALID_PRICE;

  if (!pricesValid) {
    lastPricesValid = false;
    // Prices too extreme - cancel any existing orders
    if (currentUpBuyOrderId || currentDownBuyOrderId) {
      isUpdatingOrders = true;
      const timestamp = new Date().toLocaleTimeString();
      console.log(`[${timestamp}] ⚠️ Prices too extreme (UP ${(upBuyPrice * 100).toFixed(0)}¢, DOWN ${(downBuyPrice * 100).toFixed(0)}¢) - canceling orders`);

      if (currentUpBuyOrderId) {
        await pfClient.cancelOrder(currentUpBuyOrderId);
        currentUpBuyOrderId = null;
      }
      if (currentDownBuyOrderId) {
        await pfClient.cancelOrder(currentDownBuyOrderId);
        currentDownBuyOrderId = null;
      }
      lastPlacedUpPrice = null;
      lastPlacedDownPrice = null;
      isUpdatingOrders = false;
    }
    return false;
  }

  lastPricesValid = true;

  // Skip if prices haven't changed
  if (targetUpPrice === lastPlacedUpPrice && targetDownPrice === lastPlacedDownPrice) {
    return true; // Prices still valid, just unchanged
  }

  isUpdatingOrders = true;
  const timestamp = new Date().toLocaleTimeString();

  try {
    // Cancel existing orders
    if (currentUpBuyOrderId) {
      await pfClient.cancelOrder(currentUpBuyOrderId);
      currentUpBuyOrderId = null;
    }
    if (currentDownBuyOrderId) {
      await pfClient.cancelOrder(currentDownBuyOrderId);
      currentDownBuyOrderId = null;
    }

    // Find outcomes
    const upOutcome = pfMarket.outcomes?.find(o => o.name === "Up");
    const downOutcome = pfMarket.outcomes?.find(o => o.name === "Down");

    if (!upOutcome || !downOutcome) {
      console.log(`[${timestamp}] ❌ Outcomes not found`);
      return false;
    }

    // Calculate size to get ~$1 position (minimum 2.5 shares)
    const upSize = Math.max(2.5, Math.ceil(1 / upBuyPrice));
    const downSize = Math.max(2.5, Math.ceil(1 / downBuyPrice));

    // Place UP buy order
    const upResult = await pfClient.placeLimitOrder(pfMarket, upOutcome, upBuyPrice, upSize);
    if (upResult.success) {
      currentUpBuyOrderId = upResult.orderId!;
    }

    // Place DOWN buy order
    const downResult = await pfClient.placeLimitOrder(pfMarket, downOutcome, downBuyPrice, downSize);
    if (downResult.success) {
      currentDownBuyOrderId = downResult.orderId!;
    }

    lastPlacedUpPrice = targetUpPrice;
    lastPlacedDownPrice = targetDownPrice;

    const upStatus = upResult.success ? "✅" : `❌ ${upResult.error}`;
    const downStatus = downResult.success ? "✅" : `❌ ${downResult.error}`;
    const actualTotal = upBuyPrice + downBuyPrice;
    const actualSpread = Math.round((1 - actualTotal) * 100);
    console.log(`[${timestamp}] 📊 PF: UP ${(upBuyPrice * 100).toFixed(0)}¢ ${upStatus} + DOWN ${(downBuyPrice * 100).toFixed(0)}¢ ${downStatus} = ${(actualTotal * 100).toFixed(0)}¢ (${actualSpread}¢ spread)`);

    return true;
  } catch (error) {
    console.error(`[${timestamp}] Order error:`, error);
    return false;
  } finally {
    isUpdatingOrders = false;
  }
}

function printPrices() {
  const upBid = upBestBid ? (upBestBid * 100).toFixed(1) : "?";
  const upAsk = upBestAsk ? (upBestAsk * 100).toFixed(1) : "?";
  const downBid = downBestBid ? (downBestBid * 100).toFixed(1) : "?";
  const downAsk = downBestAsk ? (downBestAsk * 100).toFixed(1) : "?";

  const priceStr = `UP: ${upBid}¢/${upAsk}¢ | DOWN: ${downBid}¢/${downAsk}¢`;

  // Only print and update orders if prices changed
  if (priceStr !== lastPrintedPrices) {
    const timestamp = new Date().toLocaleTimeString();
    console.log(`[${timestamp}] PM: ${priceStr}`);
    lastPrintedPrices = priceStr;

    // Update predict.fun orders, then update farming
    updatePredictFunOrders().then(() => {
      updateFarmingOrders();
    });
  }
}

async function main() {
  console.log("═".repeat(60));
  console.log("  Polymarket → predict.fun Price Follow Bot");
  console.log("═".repeat(60));
  console.log(`Strategy: Follow Polymarket prices, ${SPREAD * 100}¢ spread on predict.fun\n`);

  // Initialize predict.fun client
  console.log("Initializing predict.fun client...");
  pfClient = await createClient();
  console.log("✅ predict.fun ready");

  // Get predict.fun market
  pfMarket = await pfClient.getActiveMarket();
  if (pfMarket) {
    pfMarket = await pfClient.getMarketDetails(pfMarket.id);
    console.log(`📈 predict.fun: ${pfMarket?.title}\n`);
  } else {
    console.log("⚠️ No predict.fun market found\n");
  }

  // Find Polymarket market
  const found = await findCurrentMarket();
  if (!found) {
    console.log("Waiting for Polymarket market...");
    setInterval(async () => {
      if (!upTokenId) {
        await findCurrentMarket();
        if (upTokenId) {
          // Also check for predict.fun market
          if (!pfMarket && pfClient) {
            const newPfMarket = await pfClient.getActiveMarket();
            if (newPfMarket) {
              pfMarket = await pfClient.getMarketDetails(newPfMarket.id);
              console.log(`📈 predict.fun: ${pfMarket?.title}`);
            }
          }
          if (pfMarket) {
            marketsReady = true;
          }
          connectWebSocket();
        }
      }
    }, 10000);
    return;
  }

  // Both markets found - ready to trade
  if (pfMarket) {
    marketsReady = true;
    console.log("✅ Both markets ready\n");
  }

  // Connect WebSocket
  connectWebSocket();

  // Refresh markets every 10 seconds
  setInterval(async () => {
    // Check Polymarket for new 15-min window
    await refreshPolymarketMarket();

    // Check predict.fun for new market (only if not already handled by refreshPolymarketMarket)
    if (pfClient && marketsReady) {
      const newMarket = await pfClient.getActiveMarket();
      if (newMarket && newMarket.id !== pfMarket?.id) {
        // Market changed - stop trading, cancel all orders
        marketsReady = false;
        lastPricesValid = false;

        // Cancel existing orders
        if (currentUpBuyOrderId) {
          await pfClient.cancelOrder(currentUpBuyOrderId);
          currentUpBuyOrderId = null;
        }
        if (currentDownBuyOrderId) {
          await pfClient.cancelOrder(currentDownBuyOrderId);
          currentDownBuyOrderId = null;
        }
        if (farmingUpOrderId) {
          await pfClient.cancelOrder(farmingUpOrderId);
          farmingUpOrderId = null;
        }
        if (farmingDownOrderId) {
          await pfClient.cancelOrder(farmingDownOrderId);
          farmingDownOrderId = null;
        }

        pfMarket = await pfClient.getMarketDetails(newMarket.id);
        console.log(`\n📈 New predict.fun market: ${pfMarket?.title}\n`);

        // Reset order state
        lastPlacedUpPrice = null;
        lastPlacedDownPrice = null;

        // Resume trading if we have both markets
        if (pfMarket && upTokenId) {
          marketsReady = true;
        }
      }
    }
  }, 10000);
}

main().catch(console.error);
