/**
 * Place test limit orders on BTC/USD 15-min markets
 *
 * Places 1 cent limit buy orders for both Up and Down outcomes every minute
 *
 * Usage: npx tsx scripts/btc-15min-orders.ts
 */

import "dotenv/config";
import { config } from "dotenv";
config({ path: ".env.local" });

import { Wallet } from "ethers";
import { OrderBuilder, ChainId, Side } from "@predictdotfun/sdk";
import { HttpsProxyAgent } from "https-proxy-agent";
import nodeFetch, { RequestInit } from "node-fetch";

const API_BASE = "https://api.predict.fun/v1";

// Proxy configuration
const PROXY_URL = "http://fstj6mzg:pEMhnpSm@166.1.150.62:62496";
const proxyAgent = new HttpsProxyAgent(PROXY_URL);

// Wrapper for fetch with proxy
function fetchWithProxy(url: string, options: RequestInit = {}) {
  return nodeFetch(url, { ...options, agent: proxyAgent });
}

interface Market {
  id: number;
  title: string;
  status: string;
  feeRateBps: number;
  isNegRisk?: boolean;
  isYieldBearing?: boolean;
  outcomes: { name: string; indexSet: number; onChainId: string }[];
}

let cachedToken: string | null = null;
let tokenExpiry = 0;
let orderBuilder: OrderBuilder | null = null;
let signer: Wallet | null = null;
let predictAccountAddress: string | null = null;

async function init() {
  const apiKey = process.env.PREDICTFUN_API_KEY!;
  const predictAccount = process.env.PREDICTFUN_ADDRESS; // Smart wallet address
  const privyKey = process.env.PREDICTFUN_PRIVYWALLET_KEY; // Privy wallet for signing

  // Use Predict Account (has USDT balance) with Privy wallet as signer
  if (!privyKey) {
    throw new Error("PREDICTFUN_PRIVYWALLET_KEY required for Predict Account");
  }
  if (!predictAccount) {
    throw new Error("PREDICTFUN_ADDRESS required for Predict Account");
  }

  const normalizedPrivyKey = privyKey.trim().startsWith("0x")
    ? privyKey.trim()
    : "0x" + privyKey.trim();

  signer = new Wallet(normalizedPrivyKey);
  predictAccountAddress = predictAccount;

  // Initialize OrderBuilder with Predict Account
  console.log("Initializing OrderBuilder...");
  console.log(`   Privy Wallet (signer): ${signer.address}`);
  console.log(`   Predict Account (maker): ${predictAccount}`);

  orderBuilder = await OrderBuilder.make(ChainId.BnbMainnet, signer, { predictAccount });

  // Set approvals (only needed once)
  const result = await orderBuilder.setApprovals();
  if (!result.success) {
    console.warn("Approvals may already be set");
  }

  // Get JWT token - for Predict Account use signPredictAccountMessage
  console.log("Authenticating...");

  const msgRes = await fetchWithProxy(`${API_BASE}/auth/message`, {
    headers: { "x-api-key": apiKey },
  });
  const msgData = await msgRes.json();
  const message = msgData.data?.message;

  // Use Predict Account signature method
  const authSignature = await orderBuilder.signPredictAccountMessage(message);

  const authRes = await fetchWithProxy(`${API_BASE}/auth`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": apiKey },
    body: JSON.stringify({
      signer: predictAccount, // Use Predict Account address as signer
      message,
      signature: authSignature
    }),
  });
  const authData = await authRes.json();

  if (!authData.success) {
    console.log("Auth failed:", authData.message);
    throw new Error("Authentication failed");
  }

  cachedToken = authData.data?.token;
  tokenExpiry = Date.now() + 30 * 60 * 1000;
  console.log("✅ Initialized\n");
}

function getHeaders(): Record<string, string> {
  return {
    "Content-Type": "application/json",
    "x-api-key": process.env.PREDICTFUN_API_KEY!,
    Authorization: `Bearer ${cachedToken}`,
  };
}

async function getActiveBtc15MinMarket(): Promise<Market | null> {
  const res = await fetchWithProxy(`${API_BASE}/markets?first=150`, {
    headers: getHeaders(),
  });
  const data = await res.json();

  if (!data.success) return null;

  const btcMarkets = (data.data || []).filter(
    (m: Market) =>
      m.title?.includes("BTC/USD") &&
      m.title?.includes("Up or Down") &&
      m.status === "REGISTERED"
  );

  return btcMarkets[0] || null;
}

async function getMarketDetails(marketId: number): Promise<Market | null> {
  const res = await fetchWithProxy(`${API_BASE}/markets/${marketId}`, {
    headers: getHeaders(),
  });
  const data = await res.json();
  return data.success ? data.data : null;
}

async function placeLimitOrder(
  market: Market,
  outcome: { name: string; onChainId: string },
  price: number,
  size: number
): Promise<{ success: boolean; orderId?: string; error?: string }> {
  if (!orderBuilder || !signer || !predictAccountAddress) {
    return { success: false, error: "Not initialized" };
  }

  try {
    // Convert to wei (18 decimals)
    const priceWei = BigInt(Math.floor(price * 1e18));
    const quantityWei = BigInt(Math.floor(size * 1e18));

    // Calculate order amounts
    const { makerAmount, takerAmount, pricePerShare } =
      orderBuilder.getLimitOrderAmounts({
        side: Side.BUY,
        pricePerShareWei: priceWei,
        quantityWei,
      });

    // Build order - for Predict Account, SDK sets maker/signer automatically
    const order = orderBuilder.buildOrder("LIMIT", {
      side: Side.BUY,
      tokenId: outcome.onChainId,
      makerAmount,
      takerAmount,
      nonce: 0n,
      feeRateBps: market.feeRateBps || 0,
    });

    // Build typed data and sign - use actual market values!
    const typedData = orderBuilder.buildTypedData(order, {
      isNegRisk: market.isNegRisk ?? false,
      isYieldBearing: market.isYieldBearing ?? false,
    });
    const signedOrder = await orderBuilder.signTypedDataOrder(typedData);
    const hash = orderBuilder.buildTypedDataHash(typedData);

    // Submit to API
    const requestBody = {
      data: {
        order: { ...signedOrder, hash },
        pricePerShare: pricePerShare.toString(),
        strategy: "LIMIT",
      },
    };

    console.log(`   Debug: Full request body:`);
    console.log(JSON.stringify(requestBody, (key, value) =>
      typeof value === 'bigint' ? value.toString() : value, 2));

    // Serialize with BigInt support
    const bodyStr = JSON.stringify(requestBody, (key, value) =>
      typeof value === 'bigint' ? value.toString() : value
    );

    const createRes = await fetchWithProxy(`${API_BASE}/orders`, {
      method: "POST",
      headers: getHeaders(),
      body: bodyStr,
    });

    const result = await createRes.json();

    if (result.success) {
      return { success: true, orderId: result.data?.orderId || hash };
    } else {
      console.log(`   Debug response:`, JSON.stringify(result, null, 2));
      return { success: false, error: result.message || "Unknown error" };
    }
  } catch (error) {
    return { success: false, error: String(error) };
  }
}

async function placeTestOrders() {
  console.log("─".repeat(60));
  console.log(`[${new Date().toLocaleTimeString()}] Placing test orders...`);

  // Get active market
  const market = await getActiveBtc15MinMarket();

  if (!market) {
    console.log("⚠️  No active BTC/USD 15-min market found");
    return;
  }

  // Get full market details
  const details = await getMarketDetails(market.id);
  if (!details) {
    console.log("⚠️  Could not get market details");
    return;
  }

  console.log(`\n📈 Market: ${market.title}`);
  console.log(`   ID: ${market.id}`);
  console.log(`   isNegRisk: ${(details as any).isNegRisk}`);
  console.log(`   isYieldBearing: ${(details as any).isYieldBearing}`);
  console.log(`   feeRateBps: ${details.feeRateBps}`);
  console.log(`   Full details:`, JSON.stringify(details, null, 2).slice(0, 500));

  const upOutcome = details.outcomes?.find((o) => o.name === "Up");
  const downOutcome = details.outcomes?.find((o) => o.name === "Down");

  if (!upOutcome || !downOutcome) {
    console.log("⚠️  Could not find Up/Down outcomes");
    console.log("   Outcomes:", details.outcomes?.map((o) => o.name));
    return;
  }

  // Place limit orders at 1 cent for 100 shares
  const PRICE = 0.01; // 1 cent
  const SIZE = 100; // 100 shares

  console.log(`\n   Placing orders: ${PRICE * 100}¢ x ${SIZE} shares\n`);

  // Place Up order
  const upResult = await placeLimitOrder(details, upOutcome, PRICE, SIZE);
  if (upResult.success) {
    console.log(`   ✅ Up order placed: ${upResult.orderId?.slice(0, 16)}...`);
  } else {
    console.log(`   ❌ Up order failed: ${upResult.error}`);
  }

  // Place Down order
  const downResult = await placeLimitOrder(details, downOutcome, PRICE, SIZE);
  if (downResult.success) {
    console.log(`   ✅ Down order placed: ${downResult.orderId?.slice(0, 16)}...`);
  } else {
    console.log(`   ❌ Down order failed: ${downResult.error}`);
  }

  console.log("");
}

async function main() {
  console.log("=".repeat(60));
  console.log("  BTC/USD 15-Min Order Placer - predict.fun");
  console.log("=".repeat(60));
  console.log("\nThis script places 1¢ limit buy orders for Up and Down");
  console.log("every 60 seconds on the active BTC 15-min market.\n");

  await init();

  // Place initial orders
  await placeTestOrders();

  // Set up interval for every minute
  console.log("\n📍 Running every 60 seconds (Ctrl+C to stop)\n");

  setInterval(async () => {
    try {
      await placeTestOrders();
    } catch (error) {
      console.error("Error placing orders:", error);
    }
  }, 60 * 1000);
}

main().catch(console.error);
