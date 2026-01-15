/**
 * Search REST API for BTC 15-min markets
 */

import "dotenv/config";
import { config } from "dotenv";
config({ path: ".env.local" });

import { Wallet } from "ethers";

const API_BASE = "https://api.predict.fun/v1";

async function main() {
  const apiKey = process.env.PREDICTFUN_API_KEY!;
  const privateKey = process.env.PREDICTFUN_PRIVATE_KEY!;

  // Get JWT
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
  const token = authData.data?.token;

  console.log("Authenticated!\n");

  const headers = {
    "x-api-key": apiKey,
    "Authorization": `Bearer ${token}`,
  };

  // Get all markets from REST API
  console.log("Fetching markets from REST API...\n");

  const marketsRes = await fetch(`${API_BASE}/markets?first=150`, { headers });
  const marketsData = await marketsRes.json();

  if (!marketsData.success) {
    console.log("Error:", marketsData.message);
    return;
  }

  const markets = marketsData.data || [];
  console.log(`Total markets: ${markets.length}\n`);

  // Filter BTC markets
  const btcMarkets = markets.filter((m: any) =>
    m.title?.includes("BTC") || m.question?.includes("BTC")
  );

  console.log(`BTC markets: ${btcMarkets.length}`);
  btcMarkets.forEach((m: any) => {
    console.log(`  [${m.id}] ${m.title || m.question} (${m.status})`);
  });

  // Filter "Up or Down" markets
  console.log("\n\nUp or Down markets:");
  const upDownMarkets = markets.filter((m: any) =>
    m.title?.includes("Up or Down") || m.question?.includes("Up or Down")
  );

  console.log(`Found ${upDownMarkets.length} Up or Down markets:`);
  upDownMarkets.forEach((m: any) => {
    console.log(`  [${m.id}] ${m.title || m.question} (${m.status})`);
  });

  // Show non-resolved markets
  console.log("\n\nNon-resolved markets:");
  const activeMarkets = markets.filter((m: any) => m.status !== "RESOLVED");
  console.log(`Found ${activeMarkets.length} active markets`);

  // Check if any of them are BTC 15-min
  const btc15min = activeMarkets.filter((m: any) =>
    (m.title?.includes("BTC") || m.question?.includes("BTC")) &&
    (m.title?.includes("Up or Down") || m.question?.includes("Up or Down"))
  );

  if (btc15min.length > 0) {
    console.log("\nActive BTC 15-min markets:");
    btc15min.forEach((m: any) => {
      console.log(`  [${m.id}] ${m.title || m.question}`);
    });
  }
}

main().catch(console.error);
