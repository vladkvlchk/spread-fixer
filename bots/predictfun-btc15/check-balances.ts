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
import { Wallet as EthersWallet } from "ethers";
import { OrderBuilder, ChainId } from "@predictdotfun/sdk";

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
  const predictAccount = process.env.PREDICTFUN_ADDRESS;
  let privyKey = process.env.PREDICTFUN_PRIVYWALLET_KEY;

  if (!predictAccount || !privyKey) {
    console.log("  Missing PREDICTFUN_ADDRESS or PREDICTFUN_PRIVYWALLET_KEY");
    return null;
  }

  try {
    // Normalize the key (add 0x if missing)
    if (!privyKey.startsWith("0x")) {
      privyKey = "0x" + privyKey;
    }

    const signer = new EthersWallet(privyKey);
    const orderBuilder = await OrderBuilder.make(ChainId.BnbMainnet, signer, { predictAccount });

    // Get balance in wei (USDT has 18 decimals)
    const balanceWei = await orderBuilder.balanceOf();
    const balance = Number(balanceWei) / 1e18;

    return balance;
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
