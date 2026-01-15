/**
 * Test script for Predict.fun API
 */

import "dotenv/config";
import { config } from "dotenv";
config({ path: ".env.local" });

// Enable mainnet for this test
process.env.PREDICTFUN_USE_MAINNET = "true";

async function main() {
  // Import after setting env var
  const { predictfunAdapter } = await import("../lib/platforms/predictfun");

  console.log("Testing Predict.fun API (MAINNET)...\n");

  // Check if configured
  console.log("1. Checking configuration...");
  const isConfigured = predictfunAdapter.isConfigured();
  console.log(`   Configured: ${isConfigured ? "✅" : "❌"}`);

  if (!isConfigured) {
    console.log("\n   Missing env vars. Check PREDICTFUN_PRIVATE_KEY and PREDICTFUN_API_KEY");
    return;
  }

  // Try to get markets
  console.log("\n2. Fetching markets...");
  try {
    const markets = await predictfunAdapter.getMarkets();
    console.log(`   Found ${markets.length} markets`);
    if (markets.length > 0) {
      console.log("\n   Sample markets:");
      markets.slice(0, 3).forEach((m, i) => {
        console.log(`   ${i + 1}. ${m.title}`);
        console.log(`      ID: ${m.id}`);
        console.log(`      Slug: ${m.slug}`);
      });
    }
  } catch (error) {
    console.log(`   ❌ Error fetching markets:`, error);
  }

  // Try to get orderbook for an active market
  console.log("\n3. Fetching orderbook...");
  try {
    const markets = await predictfunAdapter.getMarkets();
    // Find a non-resolved market (status is included in our mapping)
    const activeMarket = markets.find((m: any) => m.status && m.status !== "RESOLVED");
    const market = activeMarket || markets[0];
    if (market) {
      console.log(`   Market: ${market.title}`);
      console.log(`   Status: ${(market as any).status || "unknown"}`);
      console.log(`   Outcomes: ${market.outcomes?.length || 0}`);

      const orderbook = await predictfunAdapter.getOrderBook(market.id, 0);
      if (orderbook) {
        console.log(`   ✅ Orderbook received`);
        console.log(`   Bids: ${orderbook.bids.length}`);
        console.log(`   Asks: ${orderbook.asks.length}`);

        if (orderbook.bids.length > 0) {
          console.log(`   Best bid: ${orderbook.bids[0].price} (${orderbook.bids[0].size} shares)`);
        }
        if (orderbook.asks.length > 0) {
          console.log(`   Best ask: ${orderbook.asks[0].price} (${orderbook.asks[0].size} shares)`);
        }
      } else {
        console.log(`   ❌ No orderbook data`);
      }
    }
  } catch (error) {
    console.log(`   ❌ Error fetching orderbook:`, error);
  }

  // Try to get positions
  console.log("\n4. Fetching positions...");
  try {
    const positions = await predictfunAdapter.getPositions();
    console.log(`   Found ${positions.length} positions`);
    positions.forEach((p, i) => {
      console.log(`   ${i + 1}. ${p.marketId}: ${p.size} @ ${p.avgPrice}`);
    });
  } catch (error) {
    console.log(`   ❌ Error fetching positions:`, error);
  }

  // Try to get open orders
  console.log("\n5. Fetching open orders...");
  try {
    const orders = await predictfunAdapter.getOpenOrders();
    console.log(`   Found ${orders.length} open orders`);
  } catch (error) {
    console.log(`   ❌ Error fetching open orders:`, error);
  }

  console.log("\n✅ Test complete!");
}

main().catch(console.error);
