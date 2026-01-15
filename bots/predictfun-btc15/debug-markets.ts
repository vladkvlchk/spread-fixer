/**
 * Debug: check what markets API returns
 * npx tsx bots/predictfun-btc15/debug-markets.ts
 */

import { createClient } from "./lib/client";
import { fetchWithProxy } from "./lib/client";

const API_BASE = "https://api.predict.fun/v1";

async function main() {
  const client = await createClient();

  const res = await fetchWithProxy(`${API_BASE}/markets?first=150`, {
    headers: client.getHeaders(),
  });
  const data = await res.json() as { success: boolean; data?: Array<{ title: string; status: string; id: number }>; message?: string };

  console.log("Raw response:", JSON.stringify(data, null, 2).slice(0, 2000));
  console.log("\n---\n");

  // Daily markets (old format)
  const dailyMarkets = (data.data || []).filter(m =>
    m.title?.includes("BTC/USD") && m.title?.includes("Up or Down on")
  );

  // 15-min markets (new format with AM/PM ET)
  const btcMarkets = (data.data || []).filter(m =>
    m.title?.includes("BTC/USD") &&
    m.title?.includes("Up or Down") &&
    (m.title?.includes("PM ET") || m.title?.includes("AM ET"))
  );

  console.log(`Daily markets: ${dailyMarkets.length}`);
  console.log(`15-min markets: ${btcMarkets.length}`);

  if (btcMarkets.length === 0) {
    console.log("No 15-min markets found");
  } else {
    console.log("\n15-min markets (last 10):");
    btcMarkets.slice(-10).forEach(m => console.log(`  [${m.status}] ID:${m.id} ${m.title}`));
  }

  // Show all BTC markets regardless of format
  const allBtc = (data.data || []).filter(m => m.title?.includes("BTC"));
  console.log(`\nAll BTC markets: ${allBtc.length}`);
  allBtc.slice(-15).forEach(m => console.log(`  [${m.status}] ID:${m.id} ${m.title}`));

  // Show first 10 markets to see what's returned
  console.log(`\nFirst 10 markets (of ${data.data?.length || 0} total):`);
  data.data?.slice(0, 10).forEach(m => console.log(`  [${m.status}] ID:${m.id} ${m.title}`));
}


main().catch(console.error);
