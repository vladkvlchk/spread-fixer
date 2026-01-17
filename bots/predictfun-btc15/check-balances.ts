/**
 * Check balances on predict.fun and Polymarket
 *
 * npx tsx bots/predictfun-btc15/check-balances.ts
 */

import "dotenv/config";
import { config } from "dotenv";
config({ path: ".env.local" });

import { ClobClient, AssetType } from "@polymarket/clob-client";
import { Wallet } from "@ethersproject/wallet";
import { createClient } from "./lib/client";

const CLOB_HOST = "https://clob.polymarket.com";
const CHAIN_ID = 137;

async function checkPolymarketBalance(): Promise<number | null> {
  const privateKey = process.env.POLYMARKET_PRIVATE_KEY;
  const funderAddress = process.env.POLYMARKET_FUNDER_ADDRESS;

  if (!privateKey || !funderAddress) {
    console.log("  Missing POLYMARKET_PRIVATE_KEY or POLYMARKET_FUNDER_ADDRESS");
    return null;
  }

  try {
    const wallet = new Wallet(privateKey);
    const tempClient = new ClobClient(CLOB_HOST, CHAIN_ID, wallet);
    const creds = await tempClient.createOrDeriveApiKey();

    const client = new ClobClient(
      CLOB_HOST,
      CHAIN_ID,
      wallet,
      creds,
      2,
      funderAddress
    );

    const balanceData = await client.getBalanceAllowance({
      asset_type: AssetType.COLLATERAL,
    });

    let balance = parseFloat(balanceData?.balance || "0");
    // Handle if balance is in wei (6 decimals for USDC)
    if (balance > 1_000_000) balance = balance / 1e6;

    return balance;
  } catch (error) {
    console.log(`  Error: ${error}`);
    return null;
  }
}

async function checkPredictFunBalance(): Promise<number | null> {
  try {
    // Use the existing client which handles auth
    const client = await createClient();

    // Try to get balance via authenticated API
    const res = await fetch("https://api.predict.fun/v1/users/me/balance", {
      headers: client.getHeaders(),
    });

    if (!res.ok) {
      // Try alternative endpoint
      const res2 = await fetch("https://api.predict.fun/v1/account/balance", {
        headers: client.getHeaders(),
      });

      if (res2.ok) {
        const data = await res2.json() as { data?: { balance?: string; available?: string } };
        const balanceStr = data.data?.available || data.data?.balance || "0";
        return parseFloat(balanceStr);
      }

      console.log(`  API returned ${res.status}`);
      console.log(`  Check balance at: https://predict.fun/portfolio`);
      return null;
    }

    const data = await res.json() as { data?: { balance?: string; available?: string } };
    const balanceStr = data.data?.available || data.data?.balance || "0";
    return parseFloat(balanceStr);
  } catch (error) {
    console.log(`  Error: ${error}`);
    console.log(`  Check balance at: https://predict.fun/portfolio`);
    return null;
  }
}

async function main() {
  console.log("═══════════════════════════════════════");
  console.log("  Balance Check");
  console.log("═══════════════════════════════════════\n");

  console.log("Polymarket:");
  const pmBalance = await checkPolymarketBalance();
  if (pmBalance !== null) {
    console.log(`  $${pmBalance.toFixed(2)} USDC`);
  } else {
    console.log("  Failed to get balance");
  }

  console.log("\npredict.fun:");
  const pfBalance = await checkPredictFunBalance();
  if (pfBalance !== null) {
    console.log(`  $${pfBalance.toFixed(2)} USDC`);
  } else {
    console.log("  Failed to get balance");
  }

  console.log("\n═══════════════════════════════════════");

  console.log(`\nFor cross-spread.ts:`);
  if (pmBalance !== null) {
    console.log(`const PM_BALANCE = ${Math.floor(pmBalance)}; // Polymarket`);
  } else {
    console.log(`const PM_BALANCE = ???; // Check manually`);
  }
  if (pfBalance !== null) {
    console.log(`const PF_BALANCE = ${Math.floor(pfBalance)}; // predict.fun`);
  } else {
    console.log(`const PF_BALANCE = ???; // Check at https://predict.fun/portfolio`);
  }
}

main().catch(console.error);
