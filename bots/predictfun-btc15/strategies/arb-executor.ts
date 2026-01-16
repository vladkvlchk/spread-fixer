/**
 * Arbitrage Executor - Buy on the cheaper platform
 *
 * Monitors both platforms and places BUY limit orders when:
 * - PM bid > PF ask → Buy on PF (it's cheaper)
 * - PF bid > PM ask → Buy on PM (it's cheaper)
 *
 * npx tsx bots/predictfun-btc15/strategies/arb-executor.ts
 */

import "dotenv/config";
import { config } from "dotenv";
config({ path: ".env.local" });

import WebSocket from "ws";
import { createClient, type Market, type PredictClient } from "../lib/client";
import { ClobClient, Side, type TickSize } from "@polymarket/clob-client";
import { Wallet } from "@ethersproject/wallet";

const PF_WS_URL = "wss://ws.predict.fun/ws";
const CLOB_HOST = "https://clob.polymarket.com";
const CHAIN_ID = 137;

// Config
// IMPORTANT: Minimum order value is $1!
const MIN_PROFIT_CENTS = 1; // Minimum profit in cents to execute
const MIN_ORDER_VALUE = 1; // $1 minimum order value
const MAX_POSITION = 500; // Max total spent per side

// Polymarket state
let pmClient: ClobClient | null = null;
let pmUpBid: number | null = null;
let pmUpAsk: number | null = null;
let pmDownBid: number | null = null;
let pmDownAsk: number | null = null;
let pmUpTokenId: string | null = null;
let pmDownTokenId: string | null = null;
let pmTickSize: TickSize = "0.01";
let pmNegRisk: boolean = false;
let pmWs: WebSocket | null = null;

// predict.fun state
let pfClient: PredictClient | null = null;
let pfMarket: Market | null = null;
let pfMarketId: number | null = null;
let pfUpBid: number | null = null;
let pfUpAsk: number | null = null;
let pfDownBid: number | null = null;
let pfDownAsk: number | null = null;
let pfWs: WebSocket | null = null;
let pfRequestId = 1;

// Position tracking
let pfUpSpent = 0;
let pfDownSpent = 0;
let pmUpSpent = 0;
let pmDownSpent = 0;
let pendingOrder = false;

// Initialize Polymarket client
async function initPolymarketClient(): Promise<boolean> {
  const privateKey = process.env.POLYMARKET_PRIVATE_KEY;
  const funderAddress = process.env.POLYMARKET_FUNDER_ADDRESS;

  if (!privateKey || !funderAddress) {
    console.log("Missing Polymarket credentials");
    return false;
  }

  try {
    const wallet = new Wallet(privateKey);
    const tempClient = new ClobClient(CLOB_HOST, CHAIN_ID, wallet);
    const creds = await tempClient.createOrDeriveApiKey();

    pmClient = new ClobClient(
      CLOB_HOST,
      CHAIN_ID,
      wallet,
      creds,
      2,
      funderAddress
    );
    return true;
  } catch (error) {
    console.log(`Polymarket init error: ${error}`);
    return false;
  }
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

    // Get tick size
    if (pmClient && pmUpTokenId) {
      pmTickSize = await pmClient.getTickSize(pmUpTokenId) as TickSize;
      pmNegRisk = await pmClient.getNegRisk(pmUpTokenId);
    }

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

      if (msg.type === "M" && msg.topic === "heartbeat") {
        pfWs!.send(JSON.stringify({ method: "heartbeat", data: msg.data }));
        return;
      }

      if (msg.type === "R") return;

      if (msg.type === "M" && msg.topic?.startsWith("predictOrderbook/")) {
        updatePredictFunOrderbook(msg.data);
        checkAndExecute();
      }
    } catch {
      // Ignore
    }
  });

  pfWs.on("error", () => {});
  pfWs.on("close", () => setTimeout(connectPredictFunWS, 5000));
}

// Update predict.fun orderbook
function updatePredictFunOrderbook(data: { bids?: [number, number][]; asks?: [number, number][] }) {
  if (!data || !data.bids || !data.asks) return;

  const bids = data.bids;
  const asks = data.asks;

  let bestBid: number | null = null;
  for (const [price] of bids) {
    if (bestBid === null || price > bestBid) bestBid = price;
  }

  let bestAsk: number | null = null;
  for (const [price] of asks) {
    if (bestAsk === null || price < bestAsk) bestAsk = price;
  }

  pfUpBid = bestBid;
  pfUpAsk = bestAsk;

  // Binary market: DOWN = 1 - UP
  if (bestAsk !== null) pfDownBid = Math.round((1 - bestAsk) * 100) / 100;
  if (bestBid !== null) pfDownAsk = Math.round((1 - bestBid) * 100) / 100;
}

// Connect to Polymarket WebSocket
function connectPolymarketWS() {
  if (!pmUpTokenId || !pmDownTokenId) return;

  pmWs = new WebSocket("wss://ws-subscriptions-clob.polymarket.com/ws/market");

  pmWs.on("open", () => {
    pmWs!.send(JSON.stringify({ type: "Market", assets_ids: [pmUpTokenId] }));
    pmWs!.send(JSON.stringify({ type: "Market", assets_ids: [pmDownTokenId] }));
  });

  pmWs.on("message", (data) => {
    try {
      const msg = JSON.parse(data.toString());

      if (Array.isArray(msg)) {
        for (const book of msg) updatePolymarketBook(book);
        checkAndExecute();
        return;
      }

      if (msg.price_changes) {
        for (const change of msg.price_changes) {
          if (change.asset_id === pmUpTokenId) {
            if (change.best_bid) pmUpBid = parseFloat(change.best_bid);
            if (change.best_ask) pmUpAsk = parseFloat(change.best_ask);
          } else if (change.asset_id === pmDownTokenId) {
            if (change.best_bid) pmDownBid = parseFloat(change.best_bid);
            if (change.best_ask) pmDownAsk = parseFloat(change.best_ask);
          }
        }
        checkAndExecute();
        return;
      }

      if (msg.asset_id && (msg.bids || msg.asks)) {
        updatePolymarketBook(msg);
        checkAndExecute();
      }
    } catch {
      // Ignore
    }
  });

  pmWs.on("error", () => {});
  pmWs.on("close", () => setTimeout(connectPolymarketWS, 5000));
}

function updatePolymarketBook(book: { asset_id?: string; bids?: Array<{ price: string }>; asks?: Array<{ price: string }> }) {
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

  if (assetId === pmUpTokenId) {
    pmUpBid = bestBid;
    pmUpAsk = bestAsk;
  } else if (assetId === pmDownTokenId) {
    pmDownBid = bestBid;
    pmDownAsk = bestAsk;
  }
}

// Check for arbitrage and execute
async function checkAndExecute() {
  if (pendingOrder) return;

  const timestamp = new Date().toLocaleTimeString();
  const fmt = (p: number | null) => p !== null ? `${(p * 100).toFixed(1)}¢` : "  ?  ";

  // Calculate arbitrage opportunities (BUY only)
  // UP: If PM bid > PF ask → Buy on PF
  // UP: If PF bid > PM ask → Buy on PM
  let buyPfUp = 0, buyPmUp = 0, buyPfDown = 0, buyPmDown = 0;

  if (pmUpBid !== null && pfUpAsk !== null && pmUpBid > pfUpAsk) {
    buyPfUp = (pmUpBid - pfUpAsk) * 100;
  }
  if (pfUpBid !== null && pmUpAsk !== null && pfUpBid > pmUpAsk) {
    buyPmUp = (pfUpBid - pmUpAsk) * 100;
  }
  if (pmDownBid !== null && pfDownAsk !== null && pmDownBid > pfDownAsk) {
    buyPfDown = (pmDownBid - pfDownAsk) * 100;
  }
  if (pfDownBid !== null && pmDownAsk !== null && pfDownBid > pmDownAsk) {
    buyPmDown = (pfDownBid - pmDownAsk) * 100;
  }

  // Display status
  process.stdout.write('\x1B[2J\x1B[H');
  console.log(`═══════════════════════════════════════════════════════════`);
  console.log(`  Arbitrage Executor (BUY only)   ${timestamp}`);
  console.log(`═══════════════════════════════════════════════════════════`);
  console.log(`                      UP              DOWN`);
  console.log(`───────────────────────────────────────────────────────────`);
  console.log(`Polymarket       ${fmt(pmUpBid)}/${fmt(pmUpAsk)}    ${fmt(pmDownBid)}/${fmt(pmDownAsk)}`);
  console.log(`predict.fun      ${fmt(pfUpBid)}/${fmt(pfUpAsk)}    ${fmt(pfDownBid)}/${fmt(pfDownAsk)}`);
  console.log(`───────────────────────────────────────────────────────────`);
  console.log(`Opportunities (need >= ${MIN_PROFIT_CENTS}¢):`);

  const showOpp = (label: string, profit: number) => {
    const color = profit >= MIN_PROFIT_CENTS ? '\x1B[32m' : '\x1B[90m';
    console.log(`  ${label}: ${color}${profit.toFixed(1)}¢\x1B[0m`);
  };

  showOpp("Buy PF UP   (PM bid > PF ask)", buyPfUp);
  showOpp("Buy PM UP   (PF bid > PM ask)", buyPmUp);
  showOpp("Buy PF DOWN (PM bid > PF ask)", buyPfDown);
  showOpp("Buy PM DOWN (PF bid > PM ask)", buyPmDown);

  console.log(`───────────────────────────────────────────────────────────`);
  console.log(`Spent: PF UP $${pfUpSpent.toFixed(2)}, PF DOWN $${pfDownSpent.toFixed(2)}`);
  console.log(`       PM UP $${pmUpSpent.toFixed(2)}, PM DOWN $${pmDownSpent.toFixed(2)}`);
  console.log(`───────────────────────────────────────────────────────────`);

  // Execute best opportunity
  if (buyPfUp >= MIN_PROFIT_CENTS && pfUpSpent < MAX_POSITION && pfUpAsk !== null) {
    await executeBuyPF("Up", pfUpAsk, buyPfUp);
  } else if (buyPmUp >= MIN_PROFIT_CENTS && pmUpSpent < MAX_POSITION && pmUpAsk !== null) {
    await executeBuyPM("Up", pmUpAsk, buyPmUp);
  } else if (buyPfDown >= MIN_PROFIT_CENTS && pfDownSpent < MAX_POSITION && pfDownAsk !== null) {
    await executeBuyPF("Down", pfDownAsk, buyPfDown);
  } else if (buyPmDown >= MIN_PROFIT_CENTS && pmDownSpent < MAX_POSITION && pmDownAsk !== null) {
    await executeBuyPM("Down", pmDownAsk, buyPmDown);
  } else {
    console.log(`\nWaiting for arbitrage...`);
  }
}

// Execute BUY on predict.fun
async function executeBuyPF(side: "Up" | "Down", price: number, profit: number) {
  if (!pfClient || !pfMarket) return;

  pendingOrder = true;
  const timestamp = new Date().toLocaleTimeString();

  // Calculate size to meet $1 minimum
  const orderSize = Math.max(Math.ceil(MIN_ORDER_VALUE / price), 1);
  const orderValue = price * orderSize;
  const roundedPrice = Math.round(price * 100) / 100;

  console.log(`\n\x1B[42m\x1B[30m  BUY ${side.toUpperCase()} on predict.fun  \x1B[0m`);
  console.log(`[${timestamp}] ${orderSize} shares @ ${(roundedPrice * 100).toFixed(0)}¢ = $${orderValue.toFixed(2)} (profit: ${profit.toFixed(1)}¢/share)`);

  process.stdout.write('\x07'); // Bell

  try {
    const outcome = pfMarket.outcomes?.find(o => o.name === side);
    if (!outcome) {
      console.log(`[${timestamp}] ❌ Outcome not found`);
      pendingOrder = false;
      return;
    }

    const result = await pfClient.placeLimitOrder(pfMarket, outcome, roundedPrice, orderSize);

    if (result.success) {
      console.log(`[${timestamp}] ✅ Order placed: ${result.orderId?.slice(0, 16)}...`);
      if (side === "Up") pfUpSpent += orderValue;
      else pfDownSpent += orderValue;
    } else {
      console.log(`[${timestamp}] ❌ Failed: ${result.error}`);
    }
  } catch (error) {
    console.log(`[${timestamp}] ❌ Error: ${error}`);
  }

  setTimeout(() => { pendingOrder = false; }, 2000);
}

// Execute BUY on Polymarket
async function executeBuyPM(side: "Up" | "Down", price: number, profit: number) {
  if (!pmClient) return;

  const tokenId = side === "Up" ? pmUpTokenId : pmDownTokenId;
  if (!tokenId) return;

  pendingOrder = true;
  const timestamp = new Date().toLocaleTimeString();

  // Calculate size to meet $1 minimum
  const orderSize = Math.max(Math.ceil(MIN_ORDER_VALUE / price), 1);
  const orderValue = price * orderSize;
  const roundedPrice = Math.round(price * 100) / 100;

  console.log(`\n\x1B[44m\x1B[37m  BUY ${side.toUpperCase()} on Polymarket  \x1B[0m`);
  console.log(`[${timestamp}] ${orderSize} shares @ ${(roundedPrice * 100).toFixed(0)}¢ = $${orderValue.toFixed(2)} (profit: ${profit.toFixed(1)}¢/share)`);

  process.stdout.write('\x07'); // Bell

  try {
    const response = await pmClient.createAndPostOrder({
      tokenID: tokenId,
      price: roundedPrice,
      size: orderSize,
      side: Side.BUY,
    }, { tickSize: pmTickSize, negRisk: pmNegRisk });

    if (response?.orderID) {
      console.log(`[${timestamp}] ✅ Order placed: ${response.orderID.slice(0, 16)}...`);
      if (side === "Up") pmUpSpent += orderValue;
      else pmDownSpent += orderValue;
    } else {
      console.log(`[${timestamp}] ❌ Failed: ${JSON.stringify(response)}`);
    }
  } catch (error) {
    console.log(`[${timestamp}] ❌ Error: ${error}`);
  }

  setTimeout(() => { pendingOrder = false; }, 2000);
}

async function main() {
  console.log("Initializing Arbitrage Executor...\n");

  // Initialize predict.fun
  console.log("1. Initializing predict.fun...");
  pfClient = await createClient();
  const market = await pfClient.getActiveMarket();
  if (market) {
    pfMarket = await pfClient.getMarketDetails(market.id);
    pfMarketId = market.id;
    console.log(`   ✅ ${pfMarket?.title}`);
  } else {
    console.log("   ❌ No market found");
    return;
  }

  // Initialize Polymarket
  console.log("\n2. Initializing Polymarket...");
  const pmOk = await initPolymarketClient();
  if (!pmOk) {
    console.log("   ❌ Failed");
    return;
  }
  console.log("   ✅ Client ready");

  // Find Polymarket market
  console.log("\n3. Finding Polymarket market...");
  const pmFound = await findPolymarketMarket();
  if (!pmFound) {
    console.log("   ❌ No market found");
    return;
  }
  console.log(`   ✅ Found (tick: ${pmTickSize})`);

  // Connect WebSockets
  console.log("\n4. Connecting WebSockets...");
  connectPolymarketWS();
  connectPredictFunWS();
  console.log("   ✅ Connected\n");

  // Refresh markets every 60 seconds
  setInterval(async () => {
    await findPolymarketMarket();
    if (pfClient) {
      const newMarket = await pfClient.getActiveMarket();
      if (newMarket && newMarket.id !== pfMarketId) {
        pfMarket = await pfClient.getMarketDetails(newMarket.id);
        pfMarketId = newMarket.id;
        connectPredictFunWS();
      }
    }
  }, 60000);
}

main().catch(console.error);
