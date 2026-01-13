#!/usr/bin/env npx tsx

/**
 * Polymarket User Activity Tracker
 *
 * Monitors a user's activity on Polymarket in real-time by polling the Data API.
 * Shows available liquidity at same or better prices for copy-trading.
 *
 * Usage: npx tsx scripts/follow-user.ts <wallet-address> [poll-interval-ms]
 *
 * Example: npx tsx scripts/follow-user.ts 0x1234...abcd 5000
 */

const DATA_API_BASE = "https://data-api.polymarket.com";
const CLOB_API_BASE = "https://clob.polymarket.com";
const DEFAULT_POLL_INTERVAL = 5000; // 5 seconds

interface Activity {
  proxyWallet: string;
  timestamp: number;
  conditionId: string;
  type: "TRADE" | "SPLIT" | "MERGE" | "REDEEM" | "REWARD" | "CONVERSION" | "MAKER_REBATE";
  size: number;
  usdcSize: number;
  transactionHash: string;
  price: number;
  asset: string;
  side?: "BUY" | "SELL";
  outcomeIndex: number;
  title: string;
  slug: string;
  outcome?: string;
  profileImage?: string;
}

interface OrderBookEntry {
  price: string;
  size: string;
}

interface OrderBook {
  bids: OrderBookEntry[];
  asks: OrderBookEntry[];
}

const seenTransactions = new Set<string>();

function formatTimestamp(ts: number): string {
  return new Date(ts * 1000).toLocaleString();
}

async function fetchOrderBook(tokenId: string): Promise<OrderBook | null> {
  try {
    const response = await fetch(`${CLOB_API_BASE}/book?token_id=${tokenId}`);
    if (!response.ok) return null;
    return response.json();
  } catch {
    return null;
  }
}

function calculateAvailableLiquidity(
  orderBook: OrderBook,
  side: "BUY" | "SELL",
  price: number
): { shares: number; avgPrice: number; cost: number } {
  // For BUY: look at asks at same or better (lower) price
  // For SELL: look at bids at same or better (higher) price
  const orders = side === "BUY" ? orderBook.asks : orderBook.bids;

  let totalShares = 0;
  let totalCost = 0;

  for (const order of orders) {
    const orderPrice = parseFloat(order.price);
    const orderSize = parseFloat(order.size);

    if (side === "BUY" && orderPrice <= price) {
      totalShares += orderSize;
      totalCost += orderSize * orderPrice;
    } else if (side === "SELL" && orderPrice >= price) {
      totalShares += orderSize;
      totalCost += orderSize * orderPrice;
    }
  }

  return {
    shares: totalShares,
    avgPrice: totalShares > 0 ? totalCost / totalShares : 0,
    cost: totalCost,
  };
}

async function formatActivity(activity: Activity): Promise<string> {
  const lines: string[] = [];
  const separator = "─".repeat(60);

  lines.push(separator);
  lines.push(`[${formatTimestamp(activity.timestamp)}] ${activity.type}`);
  lines.push(`  Market: ${activity.title}`);
  if (activity.outcome) {
    lines.push(`  Outcome: ${activity.outcome}`);
  }

  if (activity.type === "TRADE" && activity.side) {
    const color = activity.side === "BUY" ? "\x1b[32m" : "\x1b[31m"; // green/red
    const reset = "\x1b[0m";
    lines.push(`  ${color}${activity.side}${reset} ${activity.size.toFixed(2)} shares @ $${activity.price.toFixed(4)}`);
    lines.push(`  Total: $${activity.usdcSize.toFixed(2)}`);

    // Fetch order book and show available liquidity
    if (activity.asset) {
      const orderBook = await fetchOrderBook(activity.asset);
      if (orderBook) {
        const liquidity = calculateAvailableLiquidity(orderBook, activity.side, activity.price);
        const cyan = "\x1b[36m";
        const yellow = "\x1b[33m";

        if (liquidity.shares > 0) {
          lines.push(`  ${cyan}📊 Copy opportunity:${reset}`);
          lines.push(`     ${yellow}${liquidity.shares.toFixed(2)}${reset} shares available @ ≤$${activity.price.toFixed(2)}`);
          lines.push(`     Avg price: $${liquidity.avgPrice.toFixed(4)} | Total cost: $${liquidity.cost.toFixed(2)}`);
        } else {
          lines.push(`  ${cyan}📊 No liquidity at this price${reset}`);
        }
      }
    }
  } else {
    lines.push(`  Size: ${activity.size.toFixed(2)} | Value: $${activity.usdcSize.toFixed(2)}`);
  }

  lines.push(`  Tx: ${activity.transactionHash}`);
  lines.push(`  URL: https://polymarket.com/event/${activity.slug}`);

  return lines.join("\n");
}

async function fetchUserActivity(userAddress: string, limit = 50): Promise<Activity[]> {
  const url = new URL(`${DATA_API_BASE}/activity`);
  url.searchParams.set("user", userAddress);
  url.searchParams.set("limit", limit.toString());
  url.searchParams.set("sortBy", "TIMESTAMP");
  url.searchParams.set("sortDirection", "DESC");

  const response = await fetch(url.toString());

  if (!response.ok) {
    throw new Error(`API error: ${response.status} ${response.statusText}`);
  }

  return response.json();
}

async function pollForNewActivity(userAddress: string): Promise<void> {
  try {
    const activities = await fetchUserActivity(userAddress);

    // Process in reverse order (oldest first) so new activities appear at the bottom
    const newActivities = activities
      .filter((a) => !seenTransactions.has(a.transactionHash))
      .reverse();

    for (const activity of newActivities) {
      seenTransactions.add(activity.transactionHash);
      console.log(await formatActivity(activity));
    }

    if (newActivities.length > 0) {
      console.log(`\n[${new Date().toLocaleTimeString()}] Found ${newActivities.length} new action(s)\n`);
    }
  } catch (error) {
    console.error(`[${new Date().toLocaleTimeString()}] Error fetching activity:`, error);
  }
}

async function main(): Promise<void> {
  const [, , userAddress, pollIntervalArg] = process.argv;

  if (!userAddress) {
    console.error("Usage: npx tsx scripts/follow-user.ts <wallet-address> [poll-interval-ms]");
    console.error("\nExample: npx tsx scripts/follow-user.ts 0x1234...abcd 5000");
    process.exit(1);
  }

  // Validate wallet address format
  if (!/^0x[a-fA-F0-9]{40}$/.test(userAddress)) {
    console.error("Error: Invalid wallet address format. Must be 0x followed by 40 hex characters.");
    process.exit(1);
  }

  const pollInterval = pollIntervalArg ? parseInt(pollIntervalArg, 10) : DEFAULT_POLL_INTERVAL;

  console.log("═".repeat(60));
  console.log("  Polymarket User Activity Tracker");
  console.log("═".repeat(60));
  console.log(`  Tracking: ${userAddress}`);
  console.log(`  Poll interval: ${pollInterval}ms`);
  console.log(`  Started: ${new Date().toLocaleString()}`);
  console.log("═".repeat(60));
  console.log("\nWaiting for activity...\n");

  // Initial fetch to populate seen transactions
  const initialActivities = await fetchUserActivity(userAddress);
  initialActivities.forEach((a) => seenTransactions.add(a.transactionHash));
  console.log(`Loaded ${initialActivities.length} historical activities. Now watching for new ones...\n`);

  // Start polling
  setInterval(() => pollForNewActivity(userAddress), pollInterval);
}

main().catch(console.error);
