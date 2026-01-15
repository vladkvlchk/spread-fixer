/**
 * Shared client for predict.fun BTC 15-min trading
 */

import "dotenv/config";
import { config } from "dotenv";
config({ path: ".env.local" });

import { Wallet } from "ethers";
import { OrderBuilder, ChainId, Side } from "@predictdotfun/sdk";
import { HttpsProxyAgent } from "https-proxy-agent";
import nodeFetch, { RequestInit } from "node-fetch";

const API_BASE = "https://api.predict.fun/v1";
const PYTH_BTC_FEED = "https://hermes.pyth.network/v2/updates/price/latest?ids[]=e62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43";

// Proxy configuration
const PROXY_URL = "http://fstj6mzg:pEMhnpSm@166.1.150.62:62496";
const proxyAgent = new HttpsProxyAgent(PROXY_URL);

export function fetchWithProxy(url: string, options: RequestInit = {}) {
  return nodeFetch(url, { ...options, agent: proxyAgent });
}

export interface Market {
  id: number;
  title: string;
  status: string;
  feeRateBps: number;
  isNegRisk?: boolean;
  isYieldBearing?: boolean;
  description?: string;
  outcomes: { name: string; indexSet: number; onChainId: string }[];
}

export interface PredictClient {
  orderBuilder: OrderBuilder;
  token: string;
  predictAccount: string;
  getHeaders: () => Record<string, string>;
  placeLimitOrder: (market: Market, outcome: { name: string; onChainId: string }, price: number, size: number) => Promise<{ success: boolean; orderId?: string; error?: string }>;
  cancelOrder: (orderId: string) => Promise<boolean>;
  getActiveMarket: () => Promise<Market | null>;
  getMarketDetails: (marketId: number) => Promise<Market | null>;
}

export async function createClient(): Promise<PredictClient> {
  const apiKey = process.env.PREDICTFUN_API_KEY!;
  const predictAccount = process.env.PREDICTFUN_ADDRESS!;
  const privyKey = process.env.PREDICTFUN_PRIVYWALLET_KEY!;

  if (!privyKey || !predictAccount || !apiKey) {
    throw new Error("Missing env vars: PREDICTFUN_API_KEY, PREDICTFUN_ADDRESS, PREDICTFUN_PRIVYWALLET_KEY");
  }

  const normalizedPrivyKey = privyKey.trim().startsWith("0x")
    ? privyKey.trim()
    : "0x" + privyKey.trim();

  const signer = new Wallet(normalizedPrivyKey);

  // Initialize OrderBuilder with Predict Account
  const orderBuilder = await OrderBuilder.make(ChainId.BnbMainnet, signer, { predictAccount });
  await orderBuilder.setApprovals();

  // Authenticate
  const msgRes = await fetchWithProxy(`${API_BASE}/auth/message`, {
    headers: { "x-api-key": apiKey },
  });
  const msgData = await msgRes.json() as { data?: { message?: string } };
  const message = msgData.data?.message;

  const authSignature = await orderBuilder.signPredictAccountMessage(message!);

  const authRes = await fetchWithProxy(`${API_BASE}/auth`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": apiKey },
    body: JSON.stringify({
      signer: predictAccount,
      message,
      signature: authSignature
    }),
  });
  const authData = await authRes.json() as { success: boolean; data?: { token?: string }; message?: string };

  if (!authData.success) {
    throw new Error(`Auth failed: ${authData.message}`);
  }

  const token = authData.data?.token!;

  const getHeaders = () => ({
    "Content-Type": "application/json",
    "x-api-key": apiKey,
    Authorization: `Bearer ${token}`,
  });

  const getActiveMarket = async (): Promise<Market | null> => {
    const res = await fetchWithProxy(`${API_BASE}/markets?first=150`, {
      headers: getHeaders(),
    });
    const data = await res.json() as { success: boolean; data?: Market[] };
    if (!data.success) return null;

    const btcMarkets = (data.data || []).filter(
      (m: Market) =>
        m.title?.includes("BTC/USD") &&
        m.title?.includes("Up or Down") &&
        m.status === "REGISTERED"
    );
    return btcMarkets[0] || null;
  };

  const getMarketDetails = async (marketId: number): Promise<Market | null> => {
    const res = await fetchWithProxy(`${API_BASE}/markets/${marketId}`, {
      headers: getHeaders(),
    });
    const data = await res.json() as { success: boolean; data?: Market };
    return data.success ? data.data! : null;
  };

  const placeLimitOrder = async (
    market: Market,
    outcome: { name: string; onChainId: string },
    price: number,
    size: number
  ): Promise<{ success: boolean; orderId?: string; error?: string }> => {
    try {
      const priceWei = BigInt(Math.floor(price * 1e18));
      const quantityWei = BigInt(Math.floor(size * 1e18));

      const { makerAmount, takerAmount, pricePerShare } =
        orderBuilder.getLimitOrderAmounts({
          side: Side.BUY,
          pricePerShareWei: priceWei,
          quantityWei,
        });

      const order = orderBuilder.buildOrder("LIMIT", {
        side: Side.BUY,
        tokenId: outcome.onChainId,
        makerAmount,
        takerAmount,
        nonce: 0n,
        feeRateBps: market.feeRateBps || 0,
      });

      const typedData = orderBuilder.buildTypedData(order, {
        isNegRisk: market.isNegRisk ?? false,
        isYieldBearing: market.isYieldBearing ?? false,
      });
      const signedOrder = await orderBuilder.signTypedDataOrder(typedData);
      const hash = orderBuilder.buildTypedDataHash(typedData);

      const requestBody = {
        data: {
          order: { ...signedOrder, hash },
          pricePerShare: pricePerShare.toString(),
          strategy: "LIMIT",
        },
      };

      const bodyStr = JSON.stringify(requestBody, (_key, value) =>
        typeof value === 'bigint' ? value.toString() : value
      );

      const createRes = await fetchWithProxy(`${API_BASE}/orders`, {
        method: "POST",
        headers: getHeaders(),
        body: bodyStr,
      });

      const result = await createRes.json() as { success: boolean; data?: { orderId?: string }; message?: string };

      if (result.success) {
        return { success: true, orderId: result.data?.orderId || hash };
      } else {
        return { success: false, error: result.message || "Unknown error" };
      }
    } catch (error) {
      return { success: false, error: String(error) };
    }
  };

  const cancelOrder = async (orderId: string): Promise<boolean> => {
    try {
      const res = await fetchWithProxy(`${API_BASE}/orders`, {
        method: "DELETE",
        headers: getHeaders(),
        body: JSON.stringify({ data: { orderIds: [orderId] } }),
      });
      const result = await res.json() as { success: boolean };
      return result.success;
    } catch {
      return false;
    }
  };

  return {
    orderBuilder,
    token,
    predictAccount,
    getHeaders,
    placeLimitOrder,
    cancelOrder,
    getActiveMarket,
    getMarketDetails,
  };
}

// Get current BTC price from Pyth
export async function getBtcPrice(): Promise<number> {
  const res = await fetchWithProxy(PYTH_BTC_FEED);
  const data = await res.json() as { parsed?: Array<{ price?: { price?: string; expo?: number } }> };
  const priceData = data.parsed?.[0]?.price;
  if (!priceData) throw new Error("Failed to get BTC price");

  const price = Number(priceData.price) * Math.pow(10, priceData.expo || 0);
  return price;
}

// Parse starting price from market description
export function parseStartingPrice(description: string): number | null {
  const match = description.match(/starting price of \$([0-9,]+\.?\d*)/);
  if (!match) return null;
  return parseFloat(match[1].replace(/,/g, ''));
}
