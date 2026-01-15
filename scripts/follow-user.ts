#!/usr/bin/env npx tsx

/**
 * Polymarket User Activity Tracker + Auto-Copy
 *
 * Usage:
 *   Watch only:  npx tsx scripts/follow-user.ts <address> [interval-ms]
 *   Auto-copy:   npx tsx scripts/follow-user.ts <address> [interval-ms] --copy [percent]
 *
 * Examples:
 *   npx tsx scripts/follow-user.ts 0x818f214c7f3e479cce1d964d53fe3db7297558cb 1500
 *   npx tsx scripts/follow-user.ts 0x818f214c7f3e479cce1d964d53fe3db7297558cb 1500 --copy 10
 */

// Load .env.local
import { config } from "dotenv";
config({ path: ".env.local" });

import { executeCopyTrade, checkAndAlertRedeemable } from "../lib/polymarket-trading";

const DATA_API_BASE = "https://data-api.polymarket.com";
const CLOB_API_BASE = "https://clob.polymarket.com";
const DEFAULT_POLL_INTERVAL = 2000;
const DEFAULT_COPY_PERCENT = 10;
const REDEEM_CHECK_INTERVAL = 60000; // Check for redeemable every 60 seconds

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
}

const seenTransactions = new Set<string>();
let autoCopyEnabled = false;
let copyPercent = DEFAULT_COPY_PERCENT;

const c = {
  reset: "\x1b[0m",
  green: "\x1b[32m",
  red: "\x1b[31m",
  yellow: "\x1b[33m",
  cyan: "\x1b[36m",
  dim: "\x1b[2m",
};

function formatTime(ts: number): string {
  return new Date(ts * 1000).toLocaleTimeString();
}

async function fetchActivity(user: string): Promise<Activity[]> {
  const res = await fetch(
    `${DATA_API_BASE}/activity?user=${user}&limit=50&sortBy=TIMESTAMP&sortDirection=DESC`
  );
  if (!res.ok) return [];
  return res.json();
}

async function fetchOrderBook(tokenId: string) {
  try {
    const res = await fetch(`${CLOB_API_BASE}/book?token_id=${tokenId}`);
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

function calcLiquidity(ob: { asks: { price: string; size: string }[]; bids: { price: string; size: string }[] }, side: "BUY" | "SELL", price: number) {
  const orders = side === "BUY" ? ob.asks : ob.bids;
  let shares = 0, cost = 0;
  for (const o of orders) {
    const p = parseFloat(o.price), s = parseFloat(o.size);
    if ((side === "BUY" && p <= price) || (side === "SELL" && p >= price)) {
      shares += s;
      cost += s * p;
    }
  }
  return { shares, avgPrice: shares > 0 ? cost / shares : 0, cost };
}

async function processActivity(a: Activity): Promise<void> {
  const line = "─".repeat(60);
  console.log(line);
  console.log(`[${formatTime(a.timestamp)}] ${a.type}`);
  console.log(`  Market: ${a.title}`);
  if (a.outcome) console.log(`  Outcome: ${a.outcome}`);

  if (a.type === "TRADE" && a.side) {
    const sideColor = a.side === "BUY" ? c.green : c.red;
    console.log(`  ${sideColor}${a.side}${c.reset} ${a.size.toFixed(2)} @ $${a.price.toFixed(4)} = $${a.usdcSize.toFixed(2)}`);

    // Show liquidity
    if (a.asset) {
      const ob = await fetchOrderBook(a.asset);
      if (ob) {
        const liq = calcLiquidity(ob, a.side, a.price);
        if (liq.shares > 0) {
          console.log(`  ${c.cyan}📊 ${c.yellow}${liq.shares.toFixed(2)}${c.reset} shares @ ≤$${a.price.toFixed(2)} ${c.dim}(~$${liq.cost.toFixed(2)})${c.reset}`);
        }
      }
    }

    // Note: Auto-copy is handled via aggregation in poll() to combine small trades
  } else {
    console.log(`  Size: ${a.size.toFixed(2)} | Value: $${a.usdcSize.toFixed(2)}`);
  }
}

async function poll(user: string): Promise<void> {
  try {
    const activities = await fetchActivity(user);
    const newOnes = activities.filter((a) => !seenTransactions.has(a.transactionHash)).reverse();

    // Mark all as seen first
    for (const a of newOnes) {
      seenTransactions.add(a.transactionHash);
    }

    // Show individual trades
    for (const a of newOnes) {
      await processActivity(a);
    }

    // Aggregate trades by asset+side for copy trading
    if (autoCopyEnabled && newOnes.length > 0) {
      const trades = newOnes.filter((a) => a.type === "TRADE" && a.side && a.asset);

      // Group by asset+side
      const grouped = new Map<string, { asset: string; side: "BUY" | "SELL"; totalSize: number; totalValue: number; title: string }>();

      for (const t of trades) {
        const key = `${t.asset}-${t.side}`;
        const existing = grouped.get(key);
        if (existing) {
          existing.totalSize += t.size;
          existing.totalValue += t.usdcSize;
        } else {
          grouped.set(key, {
            asset: t.asset,
            side: t.side!,
            totalSize: t.size,
            totalValue: t.usdcSize,
            title: t.title,
          });
        }
      }

      // Execute aggregated copy trades
      for (const [, group] of grouped) {
        const avgPrice = group.totalValue / group.totalSize;
        const scaledValue = group.totalValue * (copyPercent / 100);

        if (scaledValue < 1) {
          console.log(`  ${c.yellow}⏭️ Aggregated still too small: $${scaledValue.toFixed(2)} < $1${c.reset}`);
          continue;
        }

        console.log(`  ${c.cyan}📦 Aggregated: ${group.totalSize.toFixed(2)} shares @ avg $${avgPrice.toFixed(4)} = $${group.totalValue.toFixed(2)}${c.reset}`);
        process.stdout.write(`  ${c.yellow}⏳ Copying ${copyPercent}%...${c.reset}`);

        const result = await executeCopyTrade({
          tokenId: group.asset,
          side: group.side,
          originalSize: group.totalSize,
          originalPrice: avgPrice,
          copyPercent,
        });

        process.stdout.write("\r" + " ".repeat(50) + "\r");

        if (result.success) {
          console.log(`  ${c.green}✅ Copied! ${result.size} shares @ $${result.price?.toFixed(4)}${c.reset}`);
        } else {
          const isSkip = result.error?.includes("min") || result.error?.includes("small");
          console.log(`  ${isSkip ? c.yellow + "⏭️ Skipped" : c.red + "❌ Failed"}: ${result.error}${c.reset}`);
        }
      }
    }

    // Heartbeat
    if (newOnes.length === 0) {
      process.stdout.write(`\r${c.dim}[${new Date().toLocaleTimeString()}] polling...${c.reset}`);
    } else {
      console.log();
    }
  } catch (e) {
    console.error(`\n${c.red}Error: ${e}${c.reset}`);
  }
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  // Parse arguments
  const copyIndex = args.indexOf("--copy");
  if (copyIndex !== -1) {
    autoCopyEnabled = true;
    const percentArg = args[copyIndex + 1];
    if (percentArg && !percentArg.startsWith("-") && !percentArg.startsWith("0x")) {
      copyPercent = parseInt(percentArg, 10);
      args.splice(copyIndex, 2);
    } else {
      args.splice(copyIndex, 1);
    }
  }

  const [userAddress, pollIntervalArg] = args;

  if (!userAddress) {
    console.log("Usage:");
    console.log("  npx tsx scripts/follow-user.ts <address> [interval-ms]");
    console.log("  npx tsx scripts/follow-user.ts <address> [interval-ms] --copy [percent]");
    console.log("\nExamples:");
    console.log("  npx tsx scripts/follow-user.ts 0x818...cb 1500");
    console.log("  npx tsx scripts/follow-user.ts 0x818...cb 1500 --copy 10");
    process.exit(1);
  }

  if (!/^0x[a-fA-F0-9]{40}$/.test(userAddress)) {
    console.error("Error: Invalid wallet address");
    process.exit(1);
  }

  const pollInterval = pollIntervalArg ? parseInt(pollIntervalArg, 10) : DEFAULT_POLL_INTERVAL;

  console.log("═".repeat(60));
  console.log("  Polymarket Copy Trader");
  console.log("═".repeat(60));
  console.log(`  Following: ${userAddress.slice(0, 10)}...${userAddress.slice(-8)}`);
  console.log(`  Interval:  ${pollInterval}ms`);
  if (autoCopyEnabled) {
    console.log(`  ${c.green}Auto-copy:  ON (${copyPercent}%)${c.reset}`);
  } else {
    console.log(`  Auto-copy: OFF (watch only)`);
  }
  console.log("═".repeat(60));

  // Load initial
  const initial = await fetchActivity(userAddress);
  initial.forEach((a) => seenTransactions.add(a.transactionHash));
  console.log(`Loaded ${initial.length} historical. Watching...\n`);

  // Poll loop
  setInterval(() => poll(userAddress), pollInterval);

  // Redeemable check loop (every 60s)
  const checkRedeemable = async () => {
    const result = await checkAndAlertRedeemable();
    if (result.hasRedeemable) {
      console.log(`\n${"!".repeat(60)}`);
      console.log(`${c.yellow}💰 REDEEMABLE POSITIONS: $${result.totalValue.toFixed(2)}${c.reset}`);
      for (const pos of result.positions) {
        console.log(`   ${pos.title} (${pos.outcome}): ${pos.size.toFixed(2)} shares = $${pos.currentValue.toFixed(2)}`);
        console.log(`   ${c.dim}→ https://polymarket.com/event/${pos.slug}${c.reset}`);
      }
      console.log(`${"!".repeat(60)}\n`);
    }
  };

  // Initial check
  await checkRedeemable();
  setInterval(checkRedeemable, REDEEM_CHECK_INTERVAL);
}

main().catch(console.error);
