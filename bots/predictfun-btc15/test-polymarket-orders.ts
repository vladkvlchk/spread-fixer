/**
 * Test order placement and cancellation on Polymarket
 * Places orders at 1¢ (won't fill) then cancels them
 *
 * npx tsx bots/predictfun-btc15/test-polymarket-orders.ts
 */

import "dotenv/config";
import { config } from "dotenv";
config({ path: ".env.local" });

import { ClobClient, Side, AssetType } from "@polymarket/clob-client";
import { Wallet } from "@ethersproject/wallet";

const CLOB_HOST = "https://clob.polymarket.com";
const CHAIN_ID = 137;

// IMPORTANT: Minimum order value is $1!
const TEST_PRICE = 0.01; // 1¢ - won't fill
const TEST_SIZE = 100;   // 100 shares * 0.01 = $1 minimum

async function getClient(): Promise<ClobClient | null> {
  const privateKey = process.env.POLYMARKET_PRIVATE_KEY;
  const funderAddress = process.env.POLYMARKET_FUNDER_ADDRESS;

  if (!privateKey || !funderAddress) {
    console.log("Missing POLYMARKET_PRIVATE_KEY or POLYMARKET_FUNDER_ADDRESS");
    return null;
  }

  try {
    const wallet = new Wallet(privateKey);
    const walletAddress = await wallet.getAddress();
    console.log(`   Wallet: ${walletAddress}`);
    console.log(`   Funder: ${funderAddress}`);

    const tempClient = new ClobClient(CLOB_HOST, CHAIN_ID, wallet);
    const creds = await tempClient.createOrDeriveApiKey();

    const client = new ClobClient(
      CLOB_HOST,
      CHAIN_ID,
      wallet,
      creds,
      2, // GNOSIS_SAFE signature type
      funderAddress
    );

    return client;
  } catch (error) {
    console.log(`   Error: ${error}`);
    return null;
  }
}

// Find current BTC 15-min market
async function findBtcMarket(): Promise<{ tokenId: string; title: string } | null> {
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
  console.log(`   Looking for: "${expectedTitle}"`);

  try {
    const searchQuery = encodeURIComponent(expectedTitle);
    const res = await fetch(
      `https://gamma-api.polymarket.com/public-search?q=${searchQuery}&type=events&limit_per_type=5`
    );
    const searchResult = await res.json() as { events?: Array<{ title: string; markets: Array<{ clobTokenIds: string[] | string; outcomes: string[] | string }> }> };
    const events = searchResult.events || [];

    if (!events.length) return null;

    const event = events[0];
    const market = event.markets?.[0];
    if (!market) return null;

    let outcomes = market.outcomes;
    if (typeof outcomes === "string") outcomes = JSON.parse(outcomes);

    const clobTokenIds = typeof market.clobTokenIds === "string"
      ? JSON.parse(market.clobTokenIds)
      : market.clobTokenIds;

    const upIdx = outcomes?.findIndex((o: string) => o === "Up");
    if (upIdx === -1 || !clobTokenIds?.[upIdx]) return null;

    return { tokenId: clobTokenIds[upIdx], title: event.title };
  } catch {
    return null;
  }
}

async function main() {
  console.log("═".repeat(50));
  console.log("  Test Orders - Polymarket");
  console.log("═".repeat(50));

  // Initialize
  console.log("\n1. Initializing client...");
  const client = await getClient();
  if (!client) {
    console.log("   ❌ Failed to initialize client");
    return;
  }
  console.log("   ✅ Client ready");

  // Check balance
  console.log("\n2. Checking balance...");
  try {
    const balanceData = await client.getBalanceAllowance({
      asset_type: AssetType.COLLATERAL,
    });
    let balance = parseFloat(balanceData?.balance || "0");
    if (balance > 1_000_000) balance = balance / 1e6;
    console.log(`   ✅ USDC Balance: $${balance.toFixed(2)}`);
  } catch (error) {
    console.log(`   ⚠️ Balance check failed: ${error}`);
  }

  // Find market
  console.log("\n3. Finding BTC 15-min market...");
  const market = await findBtcMarket();
  if (!market) {
    console.log("   ❌ No market found");
    return;
  }
  console.log(`   ✅ Found: ${market.title}`);
  console.log(`   Token ID: ${market.tokenId.slice(0, 30)}...`);

  // Get tick size
  console.log("\n4. Getting market params...");
  let tickSize: number;
  let negRisk: boolean;
  try {
    tickSize = await client.getTickSize(market.tokenId);
    negRisk = await client.getNegRisk(market.tokenId);
    console.log(`   ✅ Tick size: ${tickSize}, Neg risk: ${negRisk}`);
  } catch (error) {
    console.log(`   ❌ Failed to get params: ${error}`);
    return;
  }

  // Place order
  console.log("\n5. Placing UP order (1¢ x 100 shares = $1.00)...");
  let orderId: string | null = null;
  try {
    const response = await client.createAndPostOrder({
      tokenID: market.tokenId,
      price: TEST_PRICE,
      size: TEST_SIZE,
      side: Side.BUY,
    }, { tickSize, negRisk });

    if (response?.orderID) {
      orderId = response.orderID;
      console.log(`   ✅ Order placed: ${orderId}`);
    } else {
      console.log(`   ❌ Order failed: ${JSON.stringify(response)}`);
    }
  } catch (error) {
    console.log(`   ❌ Order error: ${error}`);
  }

  // Wait
  if (orderId) {
    console.log("\n6. Waiting 3 seconds...");
    await new Promise(r => setTimeout(r, 3000));

    // Cancel order
    console.log("\n7. Canceling order...");
    try {
      await client.cancelOrder({ orderID: orderId });
      console.log("   ✅ Order canceled");
    } catch (error) {
      console.log(`   ❌ Cancel failed: ${error}`);
    }
  }

  console.log("\n═".repeat(50));
  console.log("  Test Complete");
  console.log("═".repeat(50));
}

main().catch(console.error);
