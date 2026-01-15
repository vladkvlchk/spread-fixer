/**
 * Check market structure from predict.fun
 */

import "dotenv/config";
import { config } from "dotenv";
config({ path: ".env.local" });

import { Wallet } from "ethers";

const API_BASE = "https://api.predict.fun/v1";

async function main() {
  const apiKey = process.env.PREDICTFUN_API_KEY!;
  const privateKey = process.env.PREDICTFUN_PRIVATE_KEY!;

  // Normalize key
  const normalizedKey = privateKey.trim().startsWith("0x")
    ? privateKey.trim()
    : "0x" + privateKey.trim();

  // Get JWT
  const msgRes = await fetch(API_BASE + "/auth/message", {
    headers: { "x-api-key": apiKey },
  });
  const msgData = await msgRes.json();
  const message = msgData.data.message;

  const signer = new Wallet(normalizedKey);
  const signature = await signer.signMessage(message);

  const authRes = await fetch(API_BASE + "/auth", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": apiKey },
    body: JSON.stringify({ signer: signer.address, message, signature }),
  });
  const authData = await authRes.json();
  const token = authData.data.token;

  console.log("Authenticated!\n");

  // Get markets with full details
  const res = await fetch(API_BASE + "/markets?limit=50", {
    headers: { "x-api-key": apiKey, Authorization: "Bearer " + token },
  });
  const markets = await res.json();

  // Find non-resolved market
  const activeMarket = markets.data.find((m: any) => m.status !== "RESOLVED");
  if (!activeMarket) {
    console.log("All markets are resolved!");
    console.log("Market statuses:", [...new Set(markets.data.map((m: any) => m.status))]);
    console.log("\nChecking testnet for active markets...");

    // Try testnet
    const testRes = await fetch("https://api-testnet.predict.fun/v1/markets?limit=5");
    const testMarkets = await testRes.json();
    console.log("\nTestnet markets:");
    testMarkets.data?.slice(0, 3).forEach((m: any) => {
      console.log(`  ${m.id}: ${m.title} (${m.status})`);
    });
    return;
  }

  console.log("Non-resolved market found:");
  console.log(JSON.stringify(activeMarket, null, 2));

  // Try orderbook with different ID fields
  const market = activeMarket;
  console.log("\nTrying orderbook with different IDs:");

  const idsToTry = [
    { name: "id", value: market.id },
    { name: "conditionId", value: market.conditionId },
    { name: "oracleQuestionId", value: market.oracleQuestionId },
  ];

  for (const { name, value } of idsToTry) {
    if (!value) {
      console.log(`  ${name}: (not present)`);
      continue;
    }
    const obRes = await fetch(`${API_BASE}/markets/${value}/orderbook`, {
      headers: { "x-api-key": apiKey, Authorization: "Bearer " + token },
    });
    const obData = await obRes.json();
    console.log(`  ${name} (${value}): ${obData.success ? "SUCCESS" : obData.message}`);
  }
}

main().catch(console.error);
