/**
 * Cross-Platform Spread Bot (Infinity)
 *
 * Buys YES on one platform + NO on the other when total cost < $1
 * Guaranteed profit: one side always wins and pays $1
 * Sends Telegram alert when balance drops below $20
 *
 * Example: PM UP @ 50¢ + PF DOWN @ 45¢ = 95¢ → 5¢ profit guaranteed
 *
 * npx tsx bots/predictfun-btc15/strategies/cross-spread-infinity.ts
 */

import "dotenv/config";
import { config } from "dotenv";
config({ path: ".env.local" });

import fs from "fs";
import path from "path";
import WebSocket from "ws";

// Log file
const LOG_FILE = path.join(__dirname, "cross-spread-infinity.log");

// Telegram config
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;
const LOW_BALANCE_THRESHOLD = 20; // Alert when balance drops below $20
const lowBalanceAlertSent = { pm: false, pf: false }; // Don't spam alerts

async function sendTelegram(message: string): Promise<boolean> {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
    console.log("  [Telegram not configured]");
    return false;
  }

  try {
    const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: TELEGRAM_CHAT_ID,
        text: message,
        parse_mode: "HTML",
      }),
    });

    const data = await res.json() as { ok: boolean };
    return data.ok;
  } catch {
    return false;
  }
}

async function checkLowBalance() {
  const pmRemaining = PM_BALANCE - pmSpent;
  const pfRemaining = PF_BALANCE - pfSpent;

  if (pmRemaining < LOW_BALANCE_THRESHOLD && !lowBalanceAlertSent.pm) {
    lowBalanceAlertSent.pm = true;
    const msg = `⚠️ <b>Low Polymarket Balance!</b>\n\nRemaining: $${pmRemaining.toFixed(2)}\nThreshold: $${LOW_BALANCE_THRESHOLD}`;
    await sendTelegram(msg);
    log(`LOW BALANCE ALERT: PM $${pmRemaining.toFixed(2)}`);
  }

  if (pfRemaining < LOW_BALANCE_THRESHOLD && !lowBalanceAlertSent.pf) {
    lowBalanceAlertSent.pf = true;
    const msg = `⚠️ <b>Low predict.fun Balance!</b>\n\nRemaining: $${pfRemaining.toFixed(2)}\nThreshold: $${LOW_BALANCE_THRESHOLD}`;
    await sendTelegram(msg);
    log(`LOW BALANCE ALERT: PF $${pfRemaining.toFixed(2)}`);
  }
}

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
  console.log(`  [logged to cross-spread.log]`);
}
import { createClient, type Market, type PredictClient } from "../lib/client";
import { ClobClient, Side, type TickSize } from "@polymarket/clob-client";
import { Wallet } from "@ethersproject/wallet";

const PF_WS_URL = "wss://ws.predict.fun/ws";
const CLOB_HOST = "https://clob.polymarket.com";
const CHAIN_ID = 137;

// Config
// IMPORTANT: Minimum order value is $1!
const MIN_PROFIT_CENTS = 2; // Minimum profit in cents to execute (2¢ = 2%)
const MIN_ORDER_VALUE = 1; // $1 minimum order value
const MAX_TRADES = 15; // Max number of spread trades per session
const COOLDOWN_MS = 5000; // Cooldown between trades

// Available balance on each platform (update manually)
const PM_BALANCE = 53; // Polymarket USDC balance
const PF_BALANCE = 108; // predict.fun USDC balance

// Track spent amounts
let pmSpent = 0;
let pfSpent = 0;

// Polymarket state
let pmClient: ClobClient | null = null;
let pmUpAsk: number | null = null;
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
let pfUpAsk: number | null = null;
let pfDownAsk: number | null = null;
let pfWs: WebSocket | null = null;
let pfRequestId = 1;

// Market titles for sync detection
let pmTitle: string | null = null;
let pfTitle: string | null = null;

// Trading state
let tradesExecuted = 0;
let pendingTrade = false;
let lastTradeTime = 0;

// Extract time window from market title
// PM format: "Bitcoin Up or Down - January 17, 9:15AM-9:30AM ET"
// PF format: "BTC/USD Up or Down - January 17, 9:15-9:30AM ET"
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

  // Parse times: format is like "9:15AM-9:30AM" or "9:15-9:30AM"
  const pmMatch = pmWindow.match(/(\d{1,2}:\d{2})(?:AM|PM)?-(\d{1,2}:\d{2})(AM|PM)/);
  const pfMatch = pfWindow.match(/(\d{1,2}:\d{2})(?:AM|PM)?-(\d{1,2}:\d{2})(AM|PM)/);

  if (!pmMatch || !pfMatch) return false;

  // Compare start time, end time, and AM/PM
  return pmMatch[1] === pfMatch[1] && pmMatch[2] === pfMatch[2] && pmMatch[3] === pfMatch[3];
}

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
    pmTitle = event.title; // Store title for sync detection
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

  // Best bid (highest)
  let bestBid: number | null = null;
  for (const [price] of bids) {
    if (bestBid === null || price > bestBid) bestBid = price;
  }

  // Best ask (lowest)
  let bestAsk: number | null = null;
  for (const [price] of asks) {
    if (bestAsk === null || price < bestAsk) bestAsk = price;
  }

  // This is UP (Yes) orderbook
  pfUpAsk = bestAsk;

  // Binary market: DOWN = 1 - UP
  // DOWN ask = 1 - UP bid (to buy DOWN, someone sells UP)
  if (bestBid !== null) {
    pfDownAsk = Math.round((1 - bestBid) * 100) / 100;
  }
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
            if (change.best_ask) pmUpAsk = parseFloat(change.best_ask);
          } else if (change.asset_id === pmDownTokenId) {
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

  const asks = book.asks || [];

  // Best ask (lowest)
  let bestAsk: number | null = null;
  for (const ask of asks) {
    const price = parseFloat(ask.price);
    if (bestAsk === null || price < bestAsk) bestAsk = price;
  }

  if (assetId === pmUpTokenId) {
    pmUpAsk = bestAsk;
  } else if (assetId === pmDownTokenId) {
    pmDownAsk = bestAsk;
  }
}

// Check for spread opportunities and execute
async function checkAndExecute() {
  const timestamp = new Date().toLocaleTimeString();
  const fmt = (p: number | null) => p !== null ? `${(p * 100).toFixed(1)}¢` : "  ?  ";

  // Calculate cross-spread opportunities
  // Option 1: PM UP + PF DOWN
  let spread1: { pmUp: number; pfDown: number; total: number; profit: number } | null = null;
  if (pmUpAsk !== null && pfDownAsk !== null) {
    const total = pmUpAsk + pfDownAsk;
    if (total < 1) {
      spread1 = { pmUp: pmUpAsk, pfDown: pfDownAsk, total, profit: (1 - total) * 100 };
    }
  }

  // Option 2: PF UP + PM DOWN
  let spread2: { pfUp: number; pmDown: number; total: number; profit: number } | null = null;
  if (pfUpAsk !== null && pmDownAsk !== null) {
    const total = pfUpAsk + pmDownAsk;
    if (total < 1) {
      spread2 = { pfUp: pfUpAsk, pmDown: pmDownAsk, total, profit: (1 - total) * 100 };
    }
  }

  // Check market sync
  const inSync = areMarketsInSync();
  const syncStatus = inSync ? '\x1B[32m✓ IN SYNC\x1B[0m' : '\x1B[31m✗ OUT OF SYNC\x1B[0m';

  // Check if we can trade
  const canTrade = !pendingTrade && tradesExecuted < MAX_TRADES && (Date.now() - lastTradeTime >= COOLDOWN_MS);
  const cooldownRemaining = Math.max(0, COOLDOWN_MS - (Date.now() - lastTradeTime));

  // Display status (ALWAYS update display)
  process.stdout.write('\x1B[2J\x1B[H');
  console.log(`═══════════════════════════════════════════════════════════`);
  console.log(`  Cross-Platform Spread Bot   ${timestamp}`);
  console.log(`═══════════════════════════════════════════════════════════`);
  console.log(`PM: ${pmTitle || 'searching...'}`);
  console.log(`PF: ${pfTitle || 'searching...'}`);
  console.log(`Status: ${syncStatus}`);
  console.log(`───────────────────────────────────────────────────────────`);

  // If out of sync, don't trade - wait for markets to align
  if (!inSync) {
    console.log(`\n\x1B[43m\x1B[30m  ⏳ WAITING FOR MARKETS TO SYNC - NO TRADING  \x1B[0m`);
    console.log(`\nBoth platforms must be on the same 15-minute window.`);
    console.log(`Trades: ${tradesExecuted}/${MAX_TRADES}`);
    console.log(`Balance: PM $${(PM_BALANCE - pmSpent).toFixed(2)} / PF $${(PF_BALANCE - pfSpent).toFixed(2)}`);
    return;
  }

  console.log(`                      UP              DOWN`);
  console.log(`───────────────────────────────────────────────────────────`);
  console.log(`Polymarket ASK   ${fmt(pmUpAsk)}            ${fmt(pmDownAsk)}`);
  console.log(`predict.fun ASK  ${fmt(pfUpAsk)}            ${fmt(pfDownAsk)}`);
  console.log(`───────────────────────────────────────────────────────────`);

  console.log(`\nCross-Spread Opportunities (need >= ${MIN_PROFIT_CENTS}¢):`);

  if (spread1) {
    const color = spread1.profit >= MIN_PROFIT_CENTS ? '\x1B[32m' : '\x1B[33m';
    console.log(`  ${color}PM UP ${fmt(spread1.pmUp)} + PF DOWN ${fmt(spread1.pfDown)} = ${(spread1.total * 100).toFixed(1)}¢ → +${spread1.profit.toFixed(1)}¢\x1B[0m`);
  } else {
    console.log(`  PM UP + PF DOWN: No opportunity`);
  }

  if (spread2) {
    const color = spread2.profit >= MIN_PROFIT_CENTS ? '\x1B[32m' : '\x1B[33m';
    console.log(`  ${color}PF UP ${fmt(spread2.pfUp)} + PM DOWN ${fmt(spread2.pmDown)} = ${(spread2.total * 100).toFixed(1)}¢ → +${spread2.profit.toFixed(1)}¢\x1B[0m`);
  } else {
    console.log(`  PF UP + PM DOWN: No opportunity`);
  }

  console.log(`───────────────────────────────────────────────────────────`);
  console.log(`Trades: ${tradesExecuted}/${MAX_TRADES}`);
  console.log(`Balance: PM $${(PM_BALANCE - pmSpent).toFixed(2)} / PF $${(PF_BALANCE - pfSpent).toFixed(2)}`);
  console.log(`───────────────────────────────────────────────────────────`);

  // Show status message based on state
  if (pendingTrade) {
    console.log(`\n\x1B[44m\x1B[37m  ⏳ EXECUTING TRADE...  \x1B[0m`);
    return;
  }

  if (tradesExecuted >= MAX_TRADES) {
    console.log(`\n\x1B[45m\x1B[37m  MAX TRADES REACHED (${MAX_TRADES})  \x1B[0m`);
    return;
  }

  if (cooldownRemaining > 0) {
    console.log(`\n\x1B[46m\x1B[30m  ⏳ COOLDOWN: ${(cooldownRemaining / 1000).toFixed(1)}s  \x1B[0m`);
    return;
  }

  // Execute best opportunity (only if we can trade)
  if (canTrade && spread1 && spread1.profit >= MIN_PROFIT_CENTS) {
    if (!spread2 || spread1.profit >= spread2.profit) {
      await executeSpread("PM_UP_PF_DOWN", spread1.pmUp, spread1.pfDown, spread1.profit);
      return;
    }
  }

  if (canTrade && spread2 && spread2.profit >= MIN_PROFIT_CENTS) {
    await executeSpread("PF_UP_PM_DOWN", spread2.pfUp, spread2.pmDown, spread2.profit);
    return;
  }

  console.log(`\nWaiting for spread opportunity...`);
}

// Execute cross-platform spread trade
async function executeSpread(
  type: "PM_UP_PF_DOWN" | "PF_UP_PM_DOWN",
  price1: number,
  price2: number,
  profit: number
) {
  if (!pfClient || !pfMarket || !pmClient) return;

  pendingTrade = true;
  lastTradeTime = Date.now();
  const timestamp = new Date().toLocaleTimeString();

  // Calculate size so BOTH orders meet minimums:
  // - Polymarket: min 5 shares AND min $1
  // - predict.fun: min $1
  const PM_MIN_SHARES = 5;
  const size = Math.max(
    PM_MIN_SHARES,
    Math.ceil(MIN_ORDER_VALUE / price1),
    Math.ceil(MIN_ORDER_VALUE / price2)
  );

  const total = price1 + price2;
  const totalCost = size * total;
  const expectedProfit = size * (1 - total);

  // Check if we have enough balance
  const pmOrderCost = type === "PM_UP_PF_DOWN" ? size * price1 : size * price2;
  const pfOrderCost = type === "PM_UP_PF_DOWN" ? size * price2 : size * price1;
  const pmRemaining = PM_BALANCE - pmSpent;
  const pfRemaining = PF_BALANCE - pfSpent;

  if (pmOrderCost > pmRemaining) {
    console.log(`\n  Insufficient PM balance: need $${pmOrderCost.toFixed(2)}, have $${pmRemaining.toFixed(2)}`);
    log(`SKIP: Insufficient PM balance (need $${pmOrderCost.toFixed(2)}, have $${pmRemaining.toFixed(2)})`);
    pendingTrade = false;
    return;
  }

  if (pfOrderCost > pfRemaining) {
    console.log(`\n  Insufficient PF balance: need $${pfOrderCost.toFixed(2)}, have $${pfRemaining.toFixed(2)}`);
    log(`SKIP: Insufficient PF balance (need $${pfOrderCost.toFixed(2)}, have $${pfRemaining.toFixed(2)})`);
    pendingTrade = false;
    return;
  }

  console.log(`\n\x1B[42m\x1B[30m  EXECUTING CROSS-SPREAD  \x1B[0m`);
  console.log(`[${timestamp}] ${type}`);
  console.log(`  Size: ${size} shares`);
  console.log(`  Total cost: $${totalCost.toFixed(2)}`);
  console.log(`  Expected profit: $${expectedProfit.toFixed(2)} (${profit.toFixed(1)}¢/share)`);

  process.stdout.write('\x07'); // Bell

  let order1Success = false;
  let order2Success = false;

  if (type === "PM_UP_PF_DOWN") {
    // Buy UP on Polymarket
    console.log(`\n  [1/2] Buying UP on Polymarket @ ${(price1 * 100).toFixed(0)}¢...`);
    try {
      const response = await pmClient.createAndPostOrder({
        tokenID: pmUpTokenId!,
        price: Math.round(price1 * 100) / 100,
        size: size,
        side: Side.BUY,
      }, { tickSize: pmTickSize, negRisk: pmNegRisk });

      if (response?.orderID) {
        console.log(`        Order: ${response.orderID.slice(0, 16)}...`);
        log(`PM order placed: ${response.orderID}`);
        order1Success = true;
        pmSpent += pmOrderCost;
      } else {
        console.log(`        Failed`);
        logError("PM UP order", response);
      }
    } catch (error) {
      console.log(`        Error`);
      logError("PM UP order", error);
    }

    // Buy DOWN on predict.fun (by selling UP - but we do limit buy on DOWN)
    // Actually for predict.fun binary market, to get DOWN exposure we buy at (1 - UP ask)
    // But the API only supports buying YES. So we need to sell YES to get NO exposure.
    // For simplicity, let's just place a limit order on the opposite side
    console.log(`\n  [2/2] Buying DOWN on predict.fun @ ${(price2 * 100).toFixed(0)}¢...`);
    try {
      // For binary market, buying DOWN at X¢ = selling UP at (100-X)¢
      // But client.placeLimitOrder only does BUY
      // We need to find the Down outcome
      const downOutcome = pfMarket.outcomes?.find(o => o.name === "Down");
      if (downOutcome) {
        const result = await pfClient.placeLimitOrder(pfMarket, downOutcome, Math.round(price2 * 100) / 100, size);
        if (result.success) {
          console.log(`        Order: ${result.orderId?.slice(0, 16)}...`);
          log(`PF DOWN order placed: ${result.orderId}`);
          order2Success = true;
          pfSpent += pfOrderCost;
        } else {
          console.log(`        Failed`);
          logError("PF DOWN order", result.error);
        }
      } else {
        console.log(`        Failed: Down outcome not found`);
        logError("PF DOWN order", "Down outcome not found in market");
      }
    } catch (error) {
      console.log(`        Error`);
      logError("PF DOWN order", error);
    }
  } else {
    // Buy UP on predict.fun
    console.log(`\n  [1/2] Buying UP on predict.fun @ ${(price1 * 100).toFixed(0)}¢...`);
    try {
      const upOutcome = pfMarket.outcomes?.find(o => o.name === "Up");
      if (upOutcome) {
        const result = await pfClient.placeLimitOrder(pfMarket, upOutcome, Math.round(price1 * 100) / 100, size);
        if (result.success) {
          console.log(`        Order: ${result.orderId?.slice(0, 16)}...`);
          log(`PF UP order placed: ${result.orderId}`);
          order1Success = true;
          pfSpent += pfOrderCost;
        } else {
          console.log(`        Failed`);
          logError("PF UP order", result.error);
        }
      } else {
        console.log(`        Failed: Up outcome not found`);
        logError("PF UP order", "Up outcome not found in market");
      }
    } catch (error) {
      console.log(`        Error`);
      logError("PF UP order", error);
    }

    // Buy DOWN on Polymarket
    console.log(`\n  [2/2] Buying DOWN on Polymarket @ ${(price2 * 100).toFixed(0)}¢...`);
    try {
      const response = await pmClient.createAndPostOrder({
        tokenID: pmDownTokenId!,
        price: Math.round(price2 * 100) / 100,
        size: size,
        side: Side.BUY,
      }, { tickSize: pmTickSize, negRisk: pmNegRisk });

      if (response?.orderID) {
        console.log(`        Order: ${response.orderID.slice(0, 16)}...`);
        log(`PM DOWN order placed: ${response.orderID}`);
        order2Success = true;
        pmSpent += pmOrderCost;
      } else {
        console.log(`        Failed`);
        logError("PM DOWN order", response);
      }
    } catch (error) {
      console.log(`        Error`);
      logError("PM DOWN order", error);
    }
  }

  if (order1Success && order2Success) {
    tradesExecuted++;
    console.log(`\n  SPREAD COMPLETE`);
    log(`SPREAD COMPLETE: ${type}, size=${size}, cost=$${totalCost.toFixed(2)}, profit=$${expectedProfit.toFixed(2)}`);
    await checkLowBalance();
  } else if (order1Success || order2Success) {
    console.log(`\n  PARTIAL - Only one leg filled!`);
    log(`PARTIAL FILL: ${type}, order1=${order1Success}, order2=${order2Success}`);
    tradesExecuted++; // Still count it
    await checkLowBalance();
  } else {
    console.log(`\n  BOTH ORDERS FAILED`);
    log(`BOTH FAILED: ${type}`);
  }

  setTimeout(() => { pendingTrade = false; }, COOLDOWN_MS);
}

async function main() {
  console.log("Initializing Cross-Platform Spread Bot...\n");
  console.log(`Log file: ${LOG_FILE}\n`);
  log("=== Bot started ===");

  // Initialize predict.fun
  console.log("1. Initializing predict.fun...");
  pfClient = await createClient();
  const market = await pfClient.getActiveMarket();
  if (market) {
    pfMarket = await pfClient.getMarketDetails(market.id);
    pfMarketId = market.id;
    pfTitle = pfMarket?.title || null; // Store title for sync detection
    console.log(`   ${pfTitle}`);
  } else {
    console.log("   No market found");
    return;
  }

  // Initialize Polymarket
  console.log("\n2. Initializing Polymarket...");
  const pmOk = await initPolymarketClient();
  if (!pmOk) {
    console.log("   Failed");
    return;
  }
  console.log("   Client ready");

  // Find Polymarket market
  console.log("\n3. Finding Polymarket market...");
  const pmFound = await findPolymarketMarket();
  if (!pmFound) {
    console.log("   No market found");
    return;
  }
  console.log(`   Found (tick: ${pmTickSize})`);

  // Connect WebSockets
  console.log("\n4. Connecting WebSockets...");
  connectPolymarketWS();
  connectPredictFunWS();
  console.log("   Connected\n");

  // Refresh markets every 15 seconds to detect new 15-minute windows quickly
  setInterval(async () => {
    const oldPmTokenId = pmUpTokenId;
    const oldPfMarketId = pfMarketId;

    // Check Polymarket
    await findPolymarketMarket();
    if (pmUpTokenId !== oldPmTokenId) {
      log(`PM market changed: ${pmTitle}`);
      if (pmWs) pmWs.close();
      connectPolymarketWS();
      // Reset counters for new 15-min window
      tradesExecuted = 0;
      pmSpent = 0;
      pfSpent = 0;
      lowBalanceAlertSent.pm = false;
      lowBalanceAlertSent.pf = false;
      log(`Reset counters for new 15-min window`);
    }

    // Check predict.fun
    if (pfClient) {
      const newMarket = await pfClient.getActiveMarket();
      if (newMarket && newMarket.id !== oldPfMarketId) {
        pfMarket = await pfClient.getMarketDetails(newMarket.id);
        pfMarketId = newMarket.id;
        pfTitle = pfMarket?.title || null;
        log(`PF market changed: ${pfTitle}`);
        if (pfWs) pfWs.close();
        connectPredictFunWS();
      }
    }
  }, 15000);
}

main().catch(console.error);
