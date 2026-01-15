/**
 * Check wallet balances and approvals on predict.fun
 */

import "dotenv/config";
import { config } from "dotenv";
config({ path: ".env.local" });

import { Wallet, JsonRpcProvider, Contract } from "ethers";
import { OrderBuilder, ChainId } from "@predictdotfun/sdk";

const API_BASE = "https://api.predict.fun/v1";
const BNB_RPC = "https://bsc-dataseed.binance.org/";

// USDT on BSC
const USDT_ADDRESS = "0x55d398326f99059fF775485246999027B3197955";
const USDT_ABI = [
  "function balanceOf(address) view returns (uint256)",
  "function allowance(address owner, address spender) view returns (uint256)",
];

async function main() {
  const apiKey = process.env.PREDICTFUN_API_KEY!;
  const privateKey = process.env.PREDICTFUN_PRIVATE_KEY!;
  const predictAccount = process.env.PREDICTFUN_ADDRESS;

  const normalizedKey = privateKey.trim().startsWith("0x")
    ? privateKey.trim()
    : "0x" + privateKey.trim();

  const provider = new JsonRpcProvider(BNB_RPC);
  const wallet = new Wallet(normalizedKey, provider);

  console.log("=".repeat(60));
  console.log("  Wallet Check - predict.fun");
  console.log("=".repeat(60));

  console.log(`\nEOA Wallet: ${wallet.address}`);
  console.log(`Predict Account: ${predictAccount || "N/A"}`);

  // Check BNB balance
  const bnbBalance = await provider.getBalance(wallet.address);
  console.log(`\nBNB Balance: ${Number(bnbBalance) / 1e18} BNB`);

  // Check USDT balance
  const usdt = new Contract(USDT_ADDRESS, USDT_ABI, provider);
  const usdtBalance = await usdt.balanceOf(wallet.address);
  console.log(`USDT Balance: ${Number(usdtBalance) / 1e18} USDT`);

  // Check if Predict Account exists and its balance
  if (predictAccount) {
    const paUsdtBalance = await usdt.balanceOf(predictAccount);
    console.log(`\nPredict Account USDT: ${Number(paUsdtBalance) / 1e18} USDT`);
  }

  // Initialize OrderBuilder and check approvals
  console.log("\n--- Checking SDK ---");
  const orderBuilder = await OrderBuilder.make(ChainId.BnbMainnet, wallet);

  console.log("\nSetting/checking approvals...");
  const result = await orderBuilder.setApprovals();
  console.log(`Approvals result: ${JSON.stringify(result)}`);

  // Get active market to test
  console.log("\n--- Checking API Access ---");

  // Auth
  const msgRes = await fetch(`${API_BASE}/auth/message`, {
    headers: { "x-api-key": apiKey },
  });
  const msgData = await msgRes.json();
  const message = msgData.data?.message;
  const signature = await wallet.signMessage(message);

  const authRes = await fetch(`${API_BASE}/auth`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": apiKey },
    body: JSON.stringify({ signer: wallet.address, message, signature }),
  });
  const authData = await authRes.json();
  const token = authData.data?.token;

  console.log(`JWT Auth: ${token ? "✅" : "❌"}`);

  // Get account info
  const accountRes = await fetch(`${API_BASE}/account`, {
    headers: {
      "x-api-key": apiKey,
      Authorization: `Bearer ${token}`,
    },
  });
  const accountData = await accountRes.json();
  console.log("\nAccount info:");
  console.log(JSON.stringify(accountData, null, 2));

  console.log("\n" + "=".repeat(60));
}

main().catch(console.error);
