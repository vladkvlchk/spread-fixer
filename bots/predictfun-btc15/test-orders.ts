/**
 * Test order placement and cancellation on predict.fun
 * Places orders at 1¢ (won't fill) then cancels them
 *
 * npx tsx bots/predictfun-btc15/test-orders.ts
 */

import { createClient, type Market } from "./lib/client";

// IMPORTANT: Minimum order value is $1!
const TEST_PRICE = 0.01; // 1¢ - won't fill
const TEST_SIZE = 100;   // 100 shares * 0.01 = $1 minimum

async function main() {
  console.log("═".repeat(50));
  console.log("  Test Orders - predict.fun");
  console.log("═".repeat(50));

  // Initialize
  console.log("\n1. Initializing client...");
  const client = await createClient();
  console.log("   ✅ Client ready");

  // Get market
  console.log("\n2. Getting active market...");
  const market = await client.getActiveMarket();
  if (!market) {
    console.log("   ❌ No active market");
    return;
  }
  console.log(`   ✅ Market: ${market.title}`);

  const details = await client.getMarketDetails(market.id);
  if (!details) {
    console.log("   ❌ No market details");
    return;
  }

  const upOutcome = details.outcomes?.find(o => o.name === "Up");
  const downOutcome = details.outcomes?.find(o => o.name === "Down");

  if (!upOutcome) {
    console.log("   ❌ No Up outcome");
    return;
  }
  console.log(`   ✅ Up outcome: ${upOutcome.onChainId.slice(0, 20)}...`);

  if (!downOutcome) {
    console.log("   ❌ No Down outcome");
  } else {
    console.log(`   ✅ Down outcome: ${downOutcome.onChainId.slice(0, 20)}...`);
  }

  // Test UP order
  console.log("\n3. Placing UP order (1¢ x 10 shares = $0.10)...");
  const upResult = await client.placeLimitOrder(details, upOutcome, TEST_PRICE, TEST_SIZE);

  if (!upResult.success) {
    console.log(`   ❌ UP order failed: ${upResult.error}`);
  } else {
    console.log(`   ✅ UP order placed: ${upResult.orderId}`);
  }

  // Test DOWN order (if available)
  let downOrderId: string | null = null;
  if (downOutcome) {
    console.log("\n4. Placing DOWN order (1¢ x 10 shares = $0.10)...");
    const downResult = await client.placeLimitOrder(details, downOutcome, TEST_PRICE, TEST_SIZE);

    if (!downResult.success) {
      console.log(`   ❌ DOWN order failed: ${downResult.error}`);
    } else {
      console.log(`   ✅ DOWN order placed: ${downResult.orderId}`);
      downOrderId = downResult.orderId || null;
    }
  }

  // Wait
  console.log("\n5. Waiting 3 seconds...");
  await new Promise(r => setTimeout(r, 3000));

  // Cancel UP order
  if (upResult.success && upResult.orderId) {
    console.log("\n6. Canceling UP order...");
    const canceled = await client.cancelOrder(upResult.orderId);
    console.log(`   ${canceled ? "✅ Canceled" : "❌ Cancel failed"}`);
  }

  // Cancel DOWN order
  if (downOrderId) {
    console.log("\n7. Canceling DOWN order...");
    const canceled = await client.cancelOrder(downOrderId);
    console.log(`   ${canceled ? "✅ Canceled" : "❌ Cancel failed"}`);
  }

  console.log("\n═".repeat(50));
  console.log("  Test Complete");
  console.log("═".repeat(50));

  console.log("\nSummary:");
  console.log(`  UP order:   ${upResult.success ? "✅ Works" : "❌ Failed"}`);
  if (downOutcome) {
    console.log(`  DOWN order: ${downOrderId ? "✅ Works" : "❌ Failed"}`);
  }
}

main().catch(console.error);
