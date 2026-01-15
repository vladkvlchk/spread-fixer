/**
 * Predict.fun platform adapter
 *
 * API Docs: https://dev.predict.fun/
 * SDK: @predictdotfun/sdk
 *
 * Note: Predict.fun runs on BNB Chain, not Polygon like Polymarket
 */

import { OrderBuilder, ChainId, Side } from "@predictdotfun/sdk";
import { Wallet } from "ethers";
import type {
  PlatformAdapter,
  Market,
  OrderBook,
  Order,
  Position,
  OrderSide,
} from "./types";

// Use testnet by default (no auth required for read operations)
const USE_MAINNET = process.env.PREDICTFUN_USE_MAINNET === "true";
const API_BASE = USE_MAINNET
  ? "https://api.predict.fun/v1"
  : "https://api-testnet.predict.fun/v1";
const GRAPHQL_URL = "https://graphql.predict.fun/graphql";

let cachedOrderBuilder: OrderBuilder | null = null;
let cachedSigner: Wallet | null = null;
let cachedJwtToken: string | null = null;
let jwtExpiresAt: number = 0;

async function getOrderBuilder(): Promise<OrderBuilder | null> {
  const privateKey = process.env.PREDICTFUN_PRIVATE_KEY;
  const predictAccount = process.env.PREDICTFUN_ADDRESS; // Smart wallet address if using Predict Account

  if (!privateKey) return null;
  if (cachedOrderBuilder) return cachedOrderBuilder;

  try {
    const signer = new Wallet(privateKey);
    cachedSigner = signer;

    // If using Predict smart wallet (recommended)
    const options = predictAccount ? { predictAccount } : undefined;

    cachedOrderBuilder = await OrderBuilder.make(ChainId.BnbMainnet, signer, options);

    // Set approvals (only needed once)
    const result = await cachedOrderBuilder.setApprovals();
    if (!result.success) {
      console.warn("Failed to set approvals - may already be set");
    }

    return cachedOrderBuilder;
  } catch (error) {
    console.error("Failed to initialize OrderBuilder:", error);
    cachedOrderBuilder = null;
    return null;
  }
}

/**
 * Get JWT token for authenticated requests
 * Flow: 1) Get message 2) Sign with wallet 3) Submit signer+message+signature 4) Get JWT
 */
async function getJwtToken(): Promise<string | null> {
  // Return cached token if still valid (with 1 min buffer)
  if (cachedJwtToken && Date.now() < jwtExpiresAt - 60000) {
    return cachedJwtToken;
  }

  const apiKey = process.env.PREDICTFUN_API_KEY;
  const privateKey = process.env.PREDICTFUN_PRIVATE_KEY;

  if (!apiKey || !privateKey) return null;

  try {
    // Normalize private key
    let normalizedKey = privateKey.trim();
    if (!normalizedKey.startsWith("0x")) {
      normalizedKey = "0x" + normalizedKey;
    }

    // Step 1: Get message to sign
    const msgRes = await fetch(`${API_BASE}/auth/message`, {
      headers: { "x-api-key": apiKey },
    });
    if (!msgRes.ok) {
      console.error("Failed to get auth message:", await msgRes.text());
      return null;
    }
    const msgData = await msgRes.json();
    const message = msgData.data?.message;
    if (!message) return null;

    // Step 2: Sign message with wallet (use EVM wallet, not Privy)
    const signer = new Wallet(normalizedKey);
    const signature = await signer.signMessage(message);

    // Step 3: Submit signer + message + signature to get JWT
    const authRes = await fetch(`${API_BASE}/auth`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
      },
      body: JSON.stringify({
        signer: signer.address,
        message,
        signature,
      }),
    });

    if (!authRes.ok) {
      console.error("Failed to authenticate:", await authRes.text());
      return null;
    }

    const authData = await authRes.json();
    if (!authData.success) {
      console.error("Auth failed:", authData.message);
      return null;
    }

    cachedJwtToken = authData.data?.token;
    // JWT valid for 24h, refresh every hour to be safe
    jwtExpiresAt = Date.now() + 60 * 60 * 1000;

    console.log("Successfully authenticated with predict.fun");
    return cachedJwtToken;
  } catch (error) {
    console.error("JWT auth error:", error);
    return null;
  }
}

async function getApiHeaders(): Promise<Record<string, string>> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  // For testnet, no auth needed for read operations
  if (!USE_MAINNET) {
    return headers;
  }

  // For mainnet, always include API key
  const apiKey = process.env.PREDICTFUN_API_KEY;
  if (apiKey) {
    headers["x-api-key"] = apiKey;
  }

  // Add JWT token for authenticated requests
  const jwt = await getJwtToken();
  if (jwt) {
    headers["Authorization"] = `Bearer ${jwt}`;
  }

  return headers;
}

export const predictfunAdapter: PlatformAdapter = {
  platform: "predictfun",

  isConfigured(): boolean {
    return !!(process.env.PREDICTFUN_PRIVATE_KEY || process.env.PREDICTFUN_API_KEY);
  },

  async getMarkets(query?: string): Promise<Market[]> {
    try {
      // Use REST API - it returns all markets including BTC 15-min markets
      const headers = await getApiHeaders();
      const url = `${API_BASE}/markets?first=150`;

      const res = await fetch(url, { headers });
      if (!res.ok) {
        console.error("predictfun.getMarkets failed:", res.status);
        return [];
      }

      const data = await res.json();
      if (!data.success) {
        console.error("predictfun.getMarkets error:", data.message);
        return [];
      }

      const markets = data.data || [];

      // Filter by query if provided (client-side)
      const filtered = query
        ? markets.filter((m: { title?: string; question?: string }) =>
            (m.title || m.question || "").toLowerCase().includes(query.toLowerCase())
          )
        : markets;

      // Map to common Market format
      return filtered.map((m: {
        id: number;
        slug?: string;
        categorySlug?: string;
        title?: string;
        question?: string;
        status: string;
        conditionId: string;
        outcomes: { name: string; indexSet: number; onChainId: string }[];
      }) => ({
        platform: "predictfun" as const,
        id: String(m.id),
        conditionId: m.conditionId,
        slug: m.slug || m.categorySlug || "",
        title: m.title || m.question || "",
        outcomes: (m.outcomes || []).map((o, i) => ({
          index: i,
          name: o.name,
          tokenId: o.onChainId,
        })),
        externalIds: { predictfun: String(m.id) },
        status: m.status,
      }));
    } catch (error) {
      console.error("predictfun.getMarkets error:", error);
      return [];
    }
  },

  async getOrderBook(marketId: string, outcomeIndex: number): Promise<OrderBook | null> {
    try {
      const headers = await getApiHeaders();
      const res = await fetch(`${API_BASE}/markets/${marketId}/orderbook`, { headers });
      if (!res.ok) {
        console.error("predictfun.getOrderBook failed:", res.status, await res.text());
        return null;
      }

      const data = await res.json();
      const book = data.data || data;

      // Predict.fun orderbook format: [[price, quantity], ...]
      // Prices are for Yes outcome. For No, use complement.
      return {
        platform: "predictfun",
        marketId,
        outcomeIndex,
        // Bids: buy orders (sorted high to low)
        bids: (book.bids || []).map((b: [string, string]) => ({
          price: parseFloat(b[0]),
          size: parseFloat(b[1]),
        })),
        // Asks: sell orders (sorted low to high)
        asks: (book.asks || []).map((a: [string, string]) => ({
          price: parseFloat(a[0]),
          size: parseFloat(a[1]),
        })),
        timestamp: book.updateTimestampMs || Date.now(),
      };
    } catch (error) {
      console.error("predictfun.getOrderBook error:", error);
      return null;
    }
  },

  async placeLimitOrder(params): Promise<Order | null> {
    const orderBuilder = await getOrderBuilder();
    if (!orderBuilder || !cachedSigner) {
      console.error("OrderBuilder not initialized");
      return null;
    }

    try {
      // Get market info to find feeRateBps
      const headers = await getApiHeaders();
      const marketRes = await fetch(`${API_BASE}/markets/${params.marketId}`, { headers });
      if (!marketRes.ok) return null;

      const marketData = await marketRes.json();
      const market = marketData.data || marketData;
      const feeRateBps = market.feeRateBps || 0;

      // Convert price and size to wei (18 decimals)
      const priceWei = BigInt(Math.floor(params.price * 1e18));
      const quantityWei = BigInt(Math.floor(params.size * 1e18));

      // Calculate order amounts
      const { makerAmount, takerAmount, pricePerShare } = orderBuilder.getLimitOrderAmounts({
        side: params.side === "BUY" ? Side.BUY : Side.SELL,
        pricePerShareWei: priceWei,
        quantityWei,
      });

      // Determine maker address (use predict account if set)
      const predictAccount = process.env.PREDICTFUN_ADDRESS;
      const makerAddress = predictAccount || cachedSigner.address;

      // Build order
      const order = orderBuilder.buildOrder("LIMIT", {
        maker: makerAddress,
        signer: makerAddress,
        side: params.side === "BUY" ? Side.BUY : Side.SELL,
        tokenId: params.marketId, // TODO: Get correct token ID for outcome
        makerAmount,
        takerAmount,
        nonce: BigInt(0), // Should track nonce properly
        feeRateBps,
      });

      // Get market properties for signing
      const isNegRisk = market.isNegRisk ?? true;
      const isYieldBearing = market.isYieldBearing ?? true;

      // Build typed data and sign
      const typedData = orderBuilder.buildTypedData(order, { isNegRisk, isYieldBearing });
      const signedOrder = await orderBuilder.signTypedDataOrder(typedData);
      const hash = orderBuilder.buildTypedDataHash(typedData);

      // Submit to API
      const createRes = await fetch(`${API_BASE}/v1/orders`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          data: {
            order: { ...signedOrder, hash },
            pricePerShare: pricePerShare.toString(),
            strategy: "LIMIT",
          },
        }),
      });

      if (!createRes.ok) {
        const errorData = await createRes.json();
        console.error("Order creation failed:", errorData);
        return null;
      }

      const result = await createRes.json();
      const orderId = result.data?.orderId || hash;

      return {
        platform: "predictfun",
        id: orderId,
        marketId: params.marketId,
        outcomeIndex: params.outcomeIndex,
        side: params.side,
        type: "LIMIT",
        price: params.price,
        size: params.size,
        filledSize: 0,
        status: "OPEN",
        createdAt: Date.now(),
      };
    } catch (error) {
      console.error("predictfun.placeLimitOrder error:", error);
      return null;
    }
  },

  async placeMarketOrder(params): Promise<Order | null> {
    // Similar to limit order but with strategy: "MARKET" and slippageBps
    const orderBuilder = await getOrderBuilder();
    if (!orderBuilder || !cachedSigner) return null;

    try {
      // TODO: Implement market order
      // Key differences:
      // - strategy: "MARKET"
      // - slippageBps: "100" (1% slippage)
      // - isFillOrKill: true

      console.log("predictfun.placeMarketOrder - TODO", params);
      return null;
    } catch (error) {
      console.error("predictfun.placeMarketOrder error:", error);
      return null;
    }
  },

  async cancelOrder(orderId: string): Promise<boolean> {
    try {
      const headers = await getApiHeaders();
      const res = await fetch(`${API_BASE}/v1/orders/${orderId}`, {
        method: "DELETE",
        headers,
      });
      return res.ok;
    } catch (error) {
      console.error("predictfun.cancelOrder error:", error);
      return false;
    }
  },

  async getPositions(): Promise<Position[]> {
    try {
      const headers = await getApiHeaders();
      const res = await fetch(`${API_BASE}/positions`, { headers });
      if (!res.ok) {
        console.error("predictfun.getPositions failed:", res.status);
        return [];
      }

      const data = await res.json();
      const positions = data.data || [];

      // API returns: { id, market: {...}, outcome: {...}, amount, valueUsd }
      return positions.map((p: {
        id: string;
        market: { id: number; title: string };
        outcome: { name: string; indexSet: number };
        amount: string;
        valueUsd: string;
      }) => ({
        platform: "predictfun" as const,
        marketId: String(p.market.id),
        outcomeIndex: p.outcome.indexSet - 1, // indexSet is 1 or 2
        size: parseFloat(p.amount) / 1e18, // Convert from wei
        avgPrice: 0, // Not provided in response
        currentPrice: parseFloat(p.valueUsd) / (parseFloat(p.amount) / 1e18) || 0,
      }));
    } catch (error) {
      console.error("predictfun.getPositions error:", error);
      return [];
    }
  },

  async getOpenOrders(): Promise<Order[]> {
    try {
      const headers = await getApiHeaders();
      const res = await fetch(`${API_BASE}/orders?status=OPEN`, { headers });
      if (!res.ok) {
        console.error("predictfun.getOpenOrders failed:", res.status);
        return [];
      }

      const data = await res.json();
      const orders = data.data || [];

      // API returns: { id, marketId, order: {...}, amount, amountFilled, strategy, status }
      return orders.map((o: {
        id: string;
        marketId: number;
        order: { side: number; tokenId: string; makerAmount: string; takerAmount: string };
        amount: string;
        amountFilled: string;
        strategy: string;
        status: string;
      }) => {
        const makerAmount = parseFloat(o.order.makerAmount) / 1e18;
        const takerAmount = parseFloat(o.order.takerAmount) / 1e18;
        const price = o.order.side === 0 ? takerAmount / makerAmount : makerAmount / takerAmount;

        return {
          platform: "predictfun" as const,
          id: o.id,
          marketId: String(o.marketId),
          outcomeIndex: 0,
          side: (o.order.side === 0 ? "BUY" : "SELL") as OrderSide,
          type: o.strategy === "LIMIT" ? "LIMIT" as const : "MARKET" as const,
          price,
          size: parseFloat(o.amount) / 1e18,
          filledSize: parseFloat(o.amountFilled) / 1e18,
          status: "OPEN" as const,
          createdAt: Date.now(),
        };
      });
    } catch (error) {
      console.error("predictfun.getOpenOrders error:", error);
      return [];
    }
  },
};

/**
 * Market mapping between Polymarket and Predict.fun
 */
export interface MarketMapping {
  polymarketConditionId: string;
  predictfunMarketId: string;
  title: string;
  outcomes: {
    name: string;
    polymarketTokenId: string;
    predictfunTokenId: string;
  }[];
}

// Manual mappings - update as needed
export const KNOWN_MARKET_MAPPINGS: MarketMapping[] = [
  // TODO: Add mappings once you identify matching markets
  // Example:
  // {
  //   polymarketConditionId: "0x...",
  //   predictfunMarketId: "...",
  //   title: "BTC 15-min Up/Down",
  //   outcomes: [
  //     { name: "Up", polymarketTokenId: "...", predictfunTokenId: "..." },
  //     { name: "Down", polymarketTokenId: "...", predictfunTokenId: "..." },
  //   ],
  // },
];

export function findPredictFunMarket(polymarketConditionId: string): MarketMapping | null {
  return KNOWN_MARKET_MAPPINGS.find(m => m.polymarketConditionId === polymarketConditionId) || null;
}
