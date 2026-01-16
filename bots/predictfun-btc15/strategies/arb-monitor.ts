/**
 * Arbitrage Monitor - predict.fun vs Polymarket
 *
 * Shows real-time arbitrage opportunities between the two platforms
 * Uses WebSocket for both platforms for real-time data
 *
 * npx tsx bots/predictfun-btc15/strategies/arb-monitor.ts
 */

import "dotenv/config";
import { config } from "dotenv";
config({ path: ".env.local" });

import WebSocket from "ws";
import { createClient, type PredictClient } from "../lib/client";

const PF_WS_URL = "wss://ws.predict.fun/ws";

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

interface OrderbookLevel {
  price: number;
  size: number;
}

interface Orderbook {
  bids: OrderbookLevel[];
  asks: OrderbookLevel[];
}

// Polymarket state
let pmUpBid: number | null = null;
let pmUpAsk: number | null = null;
let pmDownBid: number | null = null;
let pmDownAsk: number | null = null;
let pmTitle: string | null = null;
let upTokenId: string | null = null;
let downTokenId: string | null = null;

// predict.fun state
let pfClient: PredictClient | null = null;
let pfMarketId: number | null = null;
let pfUpBid: number | null = null;
let pfUpAsk: number | null = null;
let pfDownBid: number | null = null;
let pfDownAsk: number | null = null;
let pfTitle: string | null = null;
let pfWs: WebSocket | null = null;
let pfRequestId = 1;

let pmWs: WebSocket | null = null;

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

// Find current BTC 15-min market on Polymarket
async function findPolymarketMarket(): Promise<boolean> {
  try {
    const expectedTitle = getExpectedMarketTitle();

    const searchQuery = encodeURIComponent(expectedTitle);
    const res = await fetch(
      `https://gamma-api.polymarket.com/public-search?q=${searchQuery}&type=events&limit_per_type=5`
    );
    const searchResult = await res.json() as { events?: PolymarketEvent[] };
    const events = searchResult.events || [];

    if (!events || events.length === 0) {
      return false;
    }

    const event = events[0];
    const market = event.markets?.[0];
    if (!market) return false;

    let outcomes = market.outcomes;
    if (typeof outcomes === "string") {
      outcomes = JSON.parse(outcomes);
    }

    const clobTokenIds = typeof market.clobTokenIds === "string"
      ? JSON.parse(market.clobTokenIds)
      : market.clobTokenIds;

    if (!clobTokenIds || clobTokenIds.length < 2) return false;

    const upIdx = outcomes?.findIndex((o: string) => o === "Up");
    const downIdx = outcomes?.findIndex((o: string) => o === "Down");

    if (upIdx === -1 || downIdx === -1) return false;

    upTokenId = clobTokenIds[upIdx];
    downTokenId = clobTokenIds[downIdx];
    pmTitle = event.title;
    return true;
  } catch {
    return false;
  }
}

// Connect to predict.fun WebSocket
function connectPredictFunWS() {
  if (!pfMarketId) return;

  const apiKey = process.env.PREDICTFUN_API_KEY;
  const wsUrl = apiKey ? `${PF_WS_URL}?apiKey=${apiKey}` : PF_WS_URL;

  pfWs = new WebSocket(wsUrl);

  pfWs.on("open", () => {
    // Subscribe to orderbook
    const subscribeMsg = {
      method: "subscribe",
      requestId: pfRequestId++,
      params: [`predictOrderbook/${pfMarketId}`]
    };
    pfWs!.send(JSON.stringify(subscribeMsg));
  });

  pfWs.on("message", (data) => {
    try {
      const msg = JSON.parse(data.toString());

      // Handle heartbeat
      if (msg.type === "M" && msg.topic === "heartbeat") {
        pfWs!.send(JSON.stringify({ method: "heartbeat", data: msg.data }));
        return;
      }

      // Handle subscription response
      if (msg.type === "R") {
        return;
      }

      // Handle orderbook data
      if (msg.type === "M" && msg.topic?.startsWith("predictOrderbook/")) {
        updatePredictFunOrderbook(msg.data);
        displayArbitrage();
      }
    } catch (e) {
      // Ignore parse errors
    }
  });

  pfWs.on("error", () => {});

  pfWs.on("close", () => {
    setTimeout(connectPredictFunWS, 5000);
  });
}

// Update predict.fun orderbook from WebSocket data
function updatePredictFunOrderbook(data: any) {
  if (!data) return;

  // Format: bids/asks are arrays of [price, size] tuples
  // This is for "Yes" (Up) outcome only
  // For binary market: DOWN price = 1 - UP price
  if (data.bids && data.asks) {
    const bids = data.bids as [number, number][];
    const asks = data.asks as [number, number][];

    // Best bid = highest bid price (first element of tuple is price)
    let bestBid: number | null = null;
    for (const [price] of bids) {
      if (bestBid === null || price > bestBid) bestBid = price;
    }

    // Best ask = lowest ask price
    let bestAsk: number | null = null;
    for (const [price] of asks) {
      if (bestAsk === null || price < bestAsk) bestAsk = price;
    }

    // This is UP (Yes) orderbook
    pfUpBid = bestBid;
    pfUpAsk = bestAsk;

    // For binary market, DOWN prices are inverse:
    // - DOWN bid = 1 - UP ask (if you can buy UP at ask, you can "sell" DOWN at that price)
    // - DOWN ask = 1 - UP bid (if you can sell UP at bid, you can "buy" DOWN at that price)
    if (bestAsk !== null) {
      pfDownBid = Math.round((1 - bestAsk) * 100) / 100;
    }
    if (bestBid !== null) {
      pfDownAsk = Math.round((1 - bestBid) * 100) / 100;
    }
  }
}

// Connect to Polymarket WebSocket
function connectPolymarketWS() {
  if (!upTokenId || !downTokenId) return;

  pmWs = new WebSocket("wss://ws-subscriptions-clob.polymarket.com/ws/market");

  pmWs.on("open", () => {
    pmWs!.send(JSON.stringify({ type: "Market", assets_ids: [upTokenId] }));
    pmWs!.send(JSON.stringify({ type: "Market", assets_ids: [downTokenId] }));
  });

  pmWs.on("message", (data) => {
    try {
      const msg = JSON.parse(data.toString());

      if (Array.isArray(msg)) {
        for (const book of msg) {
          updateFromBook(book);
        }
        displayArbitrage();
        return;
      }

      if (msg.price_changes) {
        for (const change of msg.price_changes) {
          if (change.asset_id === upTokenId) {
            if (change.best_bid) pmUpBid = parseFloat(change.best_bid);
            if (change.best_ask) pmUpAsk = parseFloat(change.best_ask);
          } else if (change.asset_id === downTokenId) {
            if (change.best_bid) pmDownBid = parseFloat(change.best_bid);
            if (change.best_ask) pmDownAsk = parseFloat(change.best_ask);
          }
        }
        displayArbitrage();
        return;
      }

      if (msg.asset_id && (msg.bids || msg.asks)) {
        updateFromBook(msg);
        displayArbitrage();
      }
    } catch (e) {
      // Ignore
    }
  });

  pmWs.on("error", () => {});

  pmWs.on("close", () => {
    setTimeout(connectPolymarketWS, 5000);
  });
}

function updateFromBook(book: { asset_id?: string; bids?: Array<{ price: string }>; asks?: Array<{ price: string }> }) {
  const assetId = book.asset_id;
  if (!assetId) return;

  const bids = book.bids || [];
  const asks = book.asks || [];

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
    pmUpBid = bestBid;
    pmUpAsk = bestAsk;
  } else if (assetId === downTokenId) {
    pmDownBid = bestBid;
    pmDownAsk = bestAsk;
  }
}

// Track last alert time to avoid spam
let lastAlertTime = 0;

// Display arbitrage opportunities
function displayArbitrage() {
  const timestamp = new Date().toLocaleTimeString();

  // Format prices
  const fmt = (p: number | null) => p !== null ? `${(p * 100).toFixed(1)}¢` : "  ?  ";

  // Check for arbitrage opportunities
  const opportunities: string[] = [];

  // UP arbitrage
  if (pmUpBid !== null && pfUpAsk !== null && pmUpBid > pfUpAsk) {
    const profit = ((pmUpBid - pfUpAsk) * 100).toFixed(1);
    opportunities.push(`🔥 UP: Buy PF @ ${fmt(pfUpAsk)}, Sell PM @ ${fmt(pmUpBid)} = +${profit}¢`);
  }
  if (pfUpBid !== null && pmUpAsk !== null && pfUpBid > pmUpAsk) {
    const profit = ((pfUpBid - pmUpAsk) * 100).toFixed(1);
    opportunities.push(`🔥 UP: Buy PM @ ${fmt(pmUpAsk)}, Sell PF @ ${fmt(pfUpBid)} = +${profit}¢`);
  }

  // DOWN arbitrage
  if (pmDownBid !== null && pfDownAsk !== null && pmDownBid > pfDownAsk) {
    const profit = ((pmDownBid - pfDownAsk) * 100).toFixed(1);
    opportunities.push(`🔥 DOWN: Buy PF @ ${fmt(pfDownAsk)}, Sell PM @ ${fmt(pmDownBid)} = +${profit}¢`);
  }
  if (pfDownBid !== null && pmDownAsk !== null && pfDownBid > pmDownAsk) {
    const profit = ((pfDownBid - pmDownAsk) * 100).toFixed(1);
    opportunities.push(`🔥 DOWN: Buy PM @ ${fmt(pmDownAsk)}, Sell PF @ ${fmt(pfDownBid)} = +${profit}¢`);
  }

  // Cross-platform spread (buy both sides cheaper than $1)
  if (pmUpAsk !== null && pfDownAsk !== null) {
    const totalCost = pmUpAsk + pfDownAsk;
    if (totalCost < 1) {
      const profit = ((1 - totalCost) * 100).toFixed(1);
      opportunities.push(`💰 CROSS: PM UP @ ${fmt(pmUpAsk)} + PF DOWN @ ${fmt(pfDownAsk)} = ${(totalCost * 100).toFixed(1)}¢ (+${profit}¢)`);
    }
  }
  if (pfUpAsk !== null && pmDownAsk !== null) {
    const totalCost = pfUpAsk + pmDownAsk;
    if (totalCost < 1) {
      const profit = ((1 - totalCost) * 100).toFixed(1);
      opportunities.push(`💰 CROSS: PF UP @ ${fmt(pfUpAsk)} + PM DOWN @ ${fmt(pmDownAsk)} = ${(totalCost * 100).toFixed(1)}¢ (+${profit}¢)`);
    }
  }

  // Calculate gaps
  const upGap = (pmUpBid !== null && pfUpAsk !== null) ? (pfUpAsk - pmUpBid) * 100 : null;
  const downGap = (pmDownBid !== null && pfDownAsk !== null) ? (pfDownAsk - pmDownBid) * 100 : null;

  // Clear screen and move cursor to top
  process.stdout.write('\x1B[2J\x1B[H');

  // Draw dashboard
  console.log(`═══════════════════════════════════════════════════════════`);
  console.log(`  Arbitrage Monitor: predict.fun vs Polymarket   ${timestamp}`);
  console.log(`═══════════════════════════════════════════════════════════`);
  console.log(`                      UP              DOWN`);
  console.log(`───────────────────────────────────────────────────────────`);
  console.log(`Polymarket       ${fmt(pmUpBid)}/${fmt(pmUpAsk)}    ${fmt(pmDownBid)}/${fmt(pmDownAsk)}`);
  console.log(`predict.fun      ${fmt(pfUpBid)}/${fmt(pfUpAsk)}    ${fmt(pfDownBid)}/${fmt(pfDownAsk)}`);
  console.log(`───────────────────────────────────────────────────────────`);

  if (upGap !== null) {
    const upColor = upGap <= 0 ? '\x1B[32m' : (upGap <= 2 ? '\x1B[33m' : '\x1B[0m');
    console.log(`UP gap:   ${upColor}${upGap.toFixed(1)}¢\x1B[0m`);
  }
  if (downGap !== null) {
    const downColor = downGap <= 0 ? '\x1B[32m' : (downGap <= 2 ? '\x1B[33m' : '\x1B[0m');
    console.log(`DOWN gap: ${downColor}${downGap.toFixed(1)}¢\x1B[0m`);
  }

  if (opportunities.length > 0) {
    console.log(`\n\x1B[42m\x1B[30m  ARBITRAGE FOUND!  \x1B[0m\n`);
    opportunities.forEach(o => console.log(o));

    // Sound alert (bell) - max once per 5 seconds
    const now = Date.now();
    if (now - lastAlertTime > 5000) {
      process.stdout.write('\x07'); // Bell sound
      lastAlertTime = now;
    }
  } else {
    console.log(`\nNo arbitrage (need gap ≤ 0)`);
  }
}

async function main() {
  console.log("Initializing...");

  // Initialize predict.fun client
  pfClient = await createClient();

  // Get predict.fun market
  const pfMarket = await pfClient.getActiveMarket();
  if (pfMarket) {
    pfMarketId = pfMarket.id;
    pfTitle = pfMarket.title;
  }

  // Find Polymarket market
  await findPolymarketMarket();

  // Connect to Polymarket WebSocket
  if (upTokenId) {
    connectPolymarketWS();
  }

  // Connect to predict.fun WebSocket
  if (pfMarketId) {
    connectPredictFunWS();
  }

  // Refresh markets every 30 seconds
  setInterval(async () => {
    // Check for new markets
    if (!upTokenId) {
      const found = await findPolymarketMarket();
      if (found) connectPolymarketWS();
    }

    if (pfClient && !pfMarketId) {
      const market = await pfClient.getActiveMarket();
      if (market) {
        pfMarketId = market.id;
        pfTitle = market.title;
        console.log(`Found predict.fun: ${pfTitle}`);
        connectPredictFunWS();
      }
    }
  }, 30000);
}

main().catch(console.error);
