/**
 * Monitor BTC/USD 15-minute markets on predict.fun
 *
 * Usage:
 *   npx tsx scripts/btc-15min-monitor.ts          # Single run
 *   npx tsx scripts/btc-15min-monitor.ts --watch  # Auto-refresh every 5s
 */

import "dotenv/config";
import { config } from "dotenv";
config({ path: ".env.local" });

import { Wallet } from "ethers";

const API_BASE = "https://api.predict.fun/v1";

interface Market {
  id: number;
  title: string;
  question: string;
  status: string;
  conditionId: string;
  outcomes: { name: string; indexSet: number; onChainId: string }[];
}

interface OrderBook {
  bids: [number, number][];
  asks: [number, number][];
  updateTimestampMs: number;
}

let cachedToken: string | null = null;
let tokenExpiry = 0;

async function getAuthHeaders(): Promise<Record<string, string>> {
  const apiKey = process.env.PREDICTFUN_API_KEY!;
  const privateKey = process.env.PREDICTFUN_PRIVATE_KEY!;

  // Return cached token if valid
  if (cachedToken && Date.now() < tokenExpiry) {
    return {
      "x-api-key": apiKey,
      "Authorization": `Bearer ${cachedToken}`,
    };
  }

  // Get new JWT
  const normalizedKey = privateKey.trim().startsWith("0x")
    ? privateKey.trim()
    : "0x" + privateKey.trim();

  const msgRes = await fetch(`${API_BASE}/auth/message`, {
    headers: { "x-api-key": apiKey },
  });
  const msgData = await msgRes.json();
  const message = msgData.data?.message;

  const signer = new Wallet(normalizedKey);
  const signature = await signer.signMessage(message);

  const authRes = await fetch(`${API_BASE}/auth`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": apiKey },
    body: JSON.stringify({ signer: signer.address, message, signature }),
  });
  const authData = await authRes.json();

  cachedToken = authData.data?.token;
  tokenExpiry = Date.now() + 30 * 60 * 1000; // 30 min

  return {
    "x-api-key": apiKey,
    "Authorization": `Bearer ${cachedToken}`,
  };
}

async function getBtc15MinMarkets(): Promise<Market[]> {
  const headers = await getAuthHeaders();
  const res = await fetch(`${API_BASE}/markets?first=150`, { headers });
  const data = await res.json();

  if (!data.success) {
    console.error("Error fetching markets:", data.message);
    return [];
  }

  // Filter for BTC 15-min markets
  return (data.data || []).filter((m: Market) =>
    (m.title?.includes("BTC/USD") || m.question?.includes("BTC/USD")) &&
    (m.title?.includes("Up or Down") || m.question?.includes("Up or Down"))
  );
}

async function getOrderBook(marketId: number): Promise<OrderBook | null> {
  const headers = await getAuthHeaders();
  const res = await fetch(`${API_BASE}/markets/${marketId}/orderbook`, { headers });
  const data = await res.json();

  if (!data.success) {
    return null;
  }

  return data.data;
}

function formatTime(title: string): string {
  // Extract time from title like "BTC/USD Up or Down - January 15, 12:45-1:00PM ET"
  const match = title.match(/(\d{1,2}:\d{2}(?:AM|PM)?-\d{1,2}:\d{2}(?:AM|PM)? ET)/);
  return match ? match[1] : "";
}

async function displayMarketData(market: Market, showResolved = false) {
  if (market.status === "RESOLVED" && !showResolved) return;

  const timeSlot = formatTime(market.title);
  const status = market.status === "REGISTERED" ? "🟢 ACTIVE" : "⚪ RESOLVED";

  console.log(`\n${status} [${market.id}] ${timeSlot}`);

  if (market.status !== "REGISTERED") return;

  // Get orderbook for active markets
  const ob = await getOrderBook(market.id);

  if (ob && ob.bids.length > 0 && ob.asks.length > 0) {
    const bestBid = ob.bids[0];
    const bestAsk = ob.asks[0];
    const spread = bestAsk[0] - bestBid[0];
    const midPrice = (bestBid[0] + bestAsk[0]) / 2;

    console.log(`   Up Probability: ${(midPrice * 100).toFixed(1)}%  |  Down: ${((1 - midPrice) * 100).toFixed(1)}%`);
    console.log(`   Bid: ${(bestBid[0] * 100).toFixed(1)}¢ (${bestBid[1].toFixed(0)} shares)`);
    console.log(`   Ask: ${(bestAsk[0] * 100).toFixed(1)}¢ (${bestAsk[1].toFixed(0)} shares)`);
    console.log(`   Spread: ${(spread * 100).toFixed(2)}%`);
  } else {
    console.log(`   ⚠️  No orderbook data`);
  }
}

async function refresh(): Promise<void> {
  // Get all BTC 15-min markets
  const markets = await getBtc15MinMarkets();

  // Separate active and recent resolved
  const activeMarkets = markets.filter(m => m.status === "REGISTERED");
  const recentResolved = markets
    .filter(m => m.status === "RESOLVED")
    .slice(-5); // Last 5 resolved

  // Clear screen for watch mode
  if (process.argv.includes("--watch")) {
    console.clear();
  }

  console.log("=".repeat(60));
  console.log("  BTC/USD 15-Minute Markets Monitor - predict.fun");
  console.log("=".repeat(60));

  console.log(`\nFound ${markets.length} BTC/USD 15-min markets (${activeMarkets.length} active)`);

  // Display active markets
  if (activeMarkets.length > 0) {
    console.log("\n" + "─".repeat(60));
    console.log("  ACTIVE MARKETS");
    console.log("─".repeat(60));

    for (const market of activeMarkets) {
      await displayMarketData(market);
    }
  } else {
    console.log("\n⚠️  No active BTC/USD 15-min markets right now");
    console.log("   Markets are created every 15 minutes during trading hours");
  }

  // Display recent resolved
  if (recentResolved.length > 0) {
    console.log("\n" + "─".repeat(60));
    console.log("  RECENTLY RESOLVED (last 5)");
    console.log("─".repeat(60));

    for (const market of recentResolved) {
      const timeSlot = formatTime(market.title);
      console.log(`   ⚪ [${market.id}] ${timeSlot}`);
    }
  }

  console.log("\n" + "=".repeat(60));
  console.log(`  Last updated: ${new Date().toLocaleString()}`);
  if (process.argv.includes("--watch")) {
    console.log("  Auto-refresh: every 5s (Ctrl+C to stop)");
  }
  console.log("=".repeat(60));
}

async function main() {
  // Authenticate once
  console.log("Authenticating...");
  await getAuthHeaders();
  console.log("✅ Authenticated\n");

  const watchMode = process.argv.includes("--watch");

  if (watchMode) {
    // Watch mode: refresh every 5 seconds
    // 240 RPM = 4 req/s, we use ~2-3 req per refresh, so 5s is very safe
    const REFRESH_INTERVAL = 5000;

    console.log("Starting watch mode (5s refresh interval)...\n");

    // Initial refresh
    await refresh();

    // Set up interval
    setInterval(async () => {
      try {
        await refresh();
      } catch (error) {
        console.error("Refresh error:", error);
      }
    }, REFRESH_INTERVAL);
  } else {
    // Single run
    await refresh();
  }
}

main().catch(console.error);
