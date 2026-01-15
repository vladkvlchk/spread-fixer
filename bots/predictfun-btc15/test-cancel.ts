/**
 * Test order placement and cancellation
 * npx tsx bots/predictfun-btc15/test-cancel.ts
 */

import { createClient, type Market } from "./lib/client";
import { fetchWithProxy } from "./lib/client";

const API_BASE = "https://api.predict.fun/v1";

async function main() {
  console.log("═".repeat(50));
  console.log("  Test Order Cancel - predict.fun");
  console.log("═".repeat(50));

  console.log("\n1. Initializing client...");
  const client = await createClient();
  console.log("   ✅ Client ready");

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
  if (!upOutcome) {
    console.log("   ❌ No Up outcome");
    return;
  }

  console.log("\n3. Placing test order (1¢ x 100 shares = $1)...");
  const result = await client.placeLimitOrder(details, upOutcome, 0.01, 100);

  if (!result.success) {
    console.log(`   ❌ Order failed: ${result.error}`);
    return;
  }
  console.log(`   ✅ Order placed: ${result.orderId}`);

  console.log("\n4. Checking order status...");
  const ordersRes = await fetchWithProxy(`${API_BASE}/orders?maker=${client.predictAccount}`, {
    headers: client.getHeaders(),
  });
  const ordersData = await ordersRes.json() as { success: boolean; data?: Array<{ id: string; status: string; hash: string }> };
  console.log(`   Orders response:`, JSON.stringify(ordersData, null, 2));

  console.log("\n5. Waiting 2 seconds...");
  await new Promise(r => setTimeout(r, 2000));

  console.log("\n6. Trying to cancel order...");
  console.log(`   Order ID: ${result.orderId}`);

  // Try different cancel methods

  // Cancel via POST /orders/remove with ids
  console.log("\n   Calling POST /orders/remove...");
  const cancelRes = await fetchWithProxy(`${API_BASE}/orders/remove`, {
    method: "POST",
    headers: client.getHeaders(),
    body: JSON.stringify({ data: { ids: [result.orderId] } }),
  });
  const cancelData = await cancelRes.json();
  console.log(`   Response:`, JSON.stringify(cancelData, null, 2));

  console.log("\n7. Final order status check...");
  const finalRes = await fetchWithProxy(`${API_BASE}/orders?maker=${client.predictAccount}`, {
    headers: client.getHeaders(),
  });
  const finalData = await finalRes.json();
  console.log(`   Orders:`, JSON.stringify(finalData, null, 2));

  console.log("\n═".repeat(50));
  console.log("  Done");
  console.log("═".repeat(50));
}

main().catch(console.error);
