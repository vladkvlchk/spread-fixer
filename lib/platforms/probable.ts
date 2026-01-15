/**
 * Probable.markets platform adapter
 *
 * Docs: https://developer.probable.markets/
 * Chain: BNB Chain (chainId: 56)
 * Backed by: PancakeSwap, YZi Labs
 *
 * Authentication:
 * - L1: EIP-712 signature (for API key generation)
 * - L2: HMAC-SHA256 (for order operations)
 */

import crypto from "crypto";
import type {
  PlatformAdapter,
  Market,
  OrderBook,
  Order,
  Position,
  OrderSide,
  OrderStatus,
} from "./types";

const API_BASE = "https://api.probable.markets";
const CHAIN_ID = 56; // BSC Mainnet

// Contract addresses on BSC
const CONTRACTS = {
  USDT: "0x364d05055614B506e2b9A287E4ac34167204cA83",
  CTF_TOKEN: "0xc53a8b3bF7934fe94305Ed7f84a2ea8ce1028a12",
  CTF_EXCHANGE: "0xF99F5367ce708c66F0860B77B4331301A5597c86",
} as const;

interface ProbableCredentials {
  apiKey: string;
  secret: string;
  passphrase: string;
  eoaAddress: string;
  proxyWalletAddress?: string;
}

function getCredentials(): ProbableCredentials | null {
  const apiKey = process.env.PROBABLE_API_KEY;
  const secret = process.env.PROBABLE_API_SECRET;
  const passphrase = process.env.PROBABLE_PASSPHRASE;
  const eoaAddress = process.env.PROBABLE_ADDRESS;
  const proxyWalletAddress = process.env.PROBABLE_PROXY_WALLET;

  if (!apiKey || !secret || !passphrase || !eoaAddress) {
    return null;
  }

  return { apiKey, secret, passphrase, eoaAddress, proxyWalletAddress };
}

/**
 * Create HMAC-SHA256 signature for L2 authentication
 * Format: timestamp + method + path + body
 */
function createL2Signature(
  timestamp: string,
  method: string,
  path: string,
  body: object | null,
  secret: string
): string {
  const message = `${timestamp}${method}${path}${body ? JSON.stringify(body) : ""}`;
  const hmac = crypto.createHmac("sha256", secret);
  hmac.update(message);
  return hmac.digest("hex");
}

/**
 * Get L2 authentication headers for API requests
 */
function getL2Headers(
  method: string,
  path: string,
  body: object | null,
  creds: ProbableCredentials
): Record<string, string> {
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const signature = createL2Signature(timestamp, method, path, body, creds.secret);

  return {
    "Content-Type": "application/json",
    prob_address: creds.eoaAddress,
    prob_signature: signature,
    prob_timestamp: timestamp,
    prob_api_key: creds.apiKey,
    prob_passphrase: creds.passphrase,
  };
}

/**
 * Map Probable position to common Position type
 */
function mapPosition(p: any): Position {
  return {
    platform: "probable",
    marketId: p.conditionId,
    outcomeIndex: p.outcomeIndex,
    size: p.size,
    avgPrice: p.avgPrice,
    currentPrice: p.curPrice,
    pnl: p.cashPnl,
  };
}

/**
 * Map Probable order to common Order type
 */
function mapOrder(o: any): Order {
  return {
    platform: "probable",
    id: String(o.orderId),
    marketId: o.tokenId || o.ctfTokenId,
    outcomeIndex: 0, // Not provided in response
    side: (o.side?.toUpperCase() || "BUY") as OrderSide,
    type: "LIMIT" as const,
    price: parseFloat(o.price || "0"),
    size: parseFloat(o.origQty || "0"),
    filledSize: parseFloat(o.executedQty || "0"),
    status: mapOrderStatus(o.status),
    createdAt: o.time,
  };
}

function mapOrderStatus(status: string): OrderStatus {
  switch (status?.toUpperCase()) {
    case "NEW":
      return "OPEN";
    case "PARTIALLY_FILLED":
      return "PARTIALLY_FILLED";
    case "FILLED":
      return "FILLED";
    case "CANCELED":
    case "CANCELLED":
      return "CANCELLED";
    default:
      return "PENDING";
  }
}

export const probableAdapter: PlatformAdapter = {
  platform: "probable",

  isConfigured(): boolean {
    return getCredentials() !== null;
  },

  async getMarkets(query?: string): Promise<Market[]> {
    try {
      // Public endpoint - no auth required
      // Note: Exact endpoint may vary - using events endpoint as common pattern
      const url = query
        ? `${API_BASE}/public/api/v1/events?search=${encodeURIComponent(query)}`
        : `${API_BASE}/public/api/v1/events`;

      const res = await fetch(url, {
        headers: { "Content-Type": "application/json" },
      });

      if (!res.ok) {
        console.error("probable.getMarkets failed:", res.status);
        return [];
      }

      const data = await res.json();
      // TODO: Map response to Market type when we have actual API response
      console.log("probable.getMarkets response sample:", data?.slice?.(0, 1));

      // Map events to markets (structure depends on actual API response)
      if (Array.isArray(data)) {
        return data.map((event: any) => ({
          platform: "probable" as const,
          id: event.conditionId || event.id,
          slug: event.slug,
          title: event.title || event.question,
          outcomes: event.outcomes || ["Yes", "No"],
          volume: event.volume || 0,
          endDate: event.endDate,
        }));
      }

      return [];
    } catch (error) {
      console.error("probable.getMarkets error:", error);
      return [];
    }
  },

  async getOrderBook(marketId: string, outcomeIndex: number): Promise<OrderBook | null> {
    try {
      // Note: Orderbook endpoint not explicitly documented
      // Common patterns: /orderbook/{tokenId} or /markets/{id}/orderbook
      // Using tokenId-based endpoint as seen in other prediction market APIs
      const url = `${API_BASE}/public/api/v1/orderbook?tokenId=${marketId}`;

      const res = await fetch(url, {
        headers: { "Content-Type": "application/json" },
      });

      if (!res.ok) {
        console.error("probable.getOrderBook failed:", res.status, await res.text());
        return null;
      }

      const data = await res.json();

      // Map response based on common orderbook format
      return {
        platform: "probable",
        marketId,
        outcomeIndex,
        bids: (data.bids || []).map((b: any) => ({
          price: parseFloat(b.price || b[0]),
          size: parseFloat(b.size || b.quantity || b[1]),
        })),
        asks: (data.asks || []).map((a: any) => ({
          price: parseFloat(a.price || a[0]),
          size: parseFloat(a.size || a.quantity || a[1]),
        })),
        timestamp: Date.now(),
      };
    } catch (error) {
      console.error("probable.getOrderBook error:", error);
      return null;
    }
  },

  async placeLimitOrder(params: {
    marketId: string;
    outcomeIndex: number;
    side: OrderSide;
    price: number;
    size: number;
  }): Promise<Order | null> {
    try {
      const creds = getCredentials();
      if (!creds) {
        console.error("probable.placeLimitOrder: not configured");
        return null;
      }

      if (!creds.proxyWalletAddress) {
        console.error("probable.placeLimitOrder: proxy wallet not configured");
        return null;
      }

      const path = `/public/api/v1/order/${CHAIN_ID}`;

      // Convert price/size to wei (18 decimals)
      const makerAmount = BigInt(Math.floor(params.size * 1e18)).toString();
      const takerAmount = BigInt(Math.floor(params.size * params.price * 1e18)).toString();

      // Generate random salt
      const salt = Date.now().toString() + Math.random().toString(36).substring(2, 15);

      // Expiration: 1 year from now
      const expiration = Math.floor(Date.now() / 1000 + 365 * 24 * 60 * 60).toString();

      // TODO: Implement EIP-712 order signing
      // For now, this is a placeholder - actual signing requires ethers/viem
      const orderSignature = "0x"; // Placeholder - needs actual signing implementation

      const orderData = {
        deferExec: false,
        order: {
          salt,
          maker: creds.proxyWalletAddress,
          signer: creds.eoaAddress,
          taker: "0x0000000000000000000000000000000000000000",
          tokenId: params.marketId,
          makerAmount,
          takerAmount,
          side: params.side.toUpperCase(),
          expiration,
          nonce: "0",
          feeRateBps: "30",
          signatureType: 0,
          signature: orderSignature,
        },
        owner: creds.proxyWalletAddress,
        orderType: "GTC",
      };

      const headers = getL2Headers("POST", path, orderData, creds);

      const res = await fetch(`${API_BASE}${path}`, {
        method: "POST",
        headers,
        body: JSON.stringify(orderData),
      });

      if (!res.ok) {
        const errorText = await res.text();
        console.error("probable.placeLimitOrder failed:", res.status, errorText);
        return null;
      }

      const data = await res.json();
      return mapOrder(data);
    } catch (error) {
      console.error("probable.placeLimitOrder error:", error);
      return null;
    }
  },

  async placeMarketOrder(params: {
    marketId: string;
    outcomeIndex: number;
    side: OrderSide;
    size: number;
  }): Promise<Order | null> {
    // Probable uses IOC (Immediate Or Cancel) for market orders
    // Get current best price and use IOC order type
    try {
      const orderBook = await this.getOrderBook(params.marketId, params.outcomeIndex);
      if (!orderBook) {
        console.error("probable.placeMarketOrder: could not get orderbook");
        return null;
      }

      // For BUY: use best ask price + slippage
      // For SELL: use best bid price - slippage
      const slippage = 0.02; // 2%
      let price: number;

      if (params.side === "BUY") {
        const bestAsk = orderBook.asks[0]?.price;
        if (!bestAsk) {
          console.error("probable.placeMarketOrder: no asks available");
          return null;
        }
        price = bestAsk * (1 + slippage);
      } else {
        const bestBid = orderBook.bids[0]?.price;
        if (!bestBid) {
          console.error("probable.placeMarketOrder: no bids available");
          return null;
        }
        price = bestBid * (1 - slippage);
      }

      // Place as IOC order
      const creds = getCredentials();
      if (!creds || !creds.proxyWalletAddress) {
        console.error("probable.placeMarketOrder: not configured");
        return null;
      }

      const path = `/public/api/v1/order/${CHAIN_ID}`;
      const makerAmount = BigInt(Math.floor(params.size * 1e18)).toString();
      const takerAmount = BigInt(Math.floor(params.size * price * 1e18)).toString();
      const salt = Date.now().toString() + Math.random().toString(36).substring(2, 15);
      const expiration = Math.floor(Date.now() / 1000 + 300).toString(); // 5 min expiration

      const orderData = {
        deferExec: false,
        order: {
          salt,
          maker: creds.proxyWalletAddress,
          signer: creds.eoaAddress,
          taker: "0x0000000000000000000000000000000000000000",
          tokenId: params.marketId,
          makerAmount,
          takerAmount,
          side: params.side.toUpperCase(),
          expiration,
          nonce: "0",
          feeRateBps: "30",
          signatureType: 0,
          signature: "0x", // Placeholder
        },
        owner: creds.proxyWalletAddress,
        orderType: "IOC", // Immediate Or Cancel
      };

      const headers = getL2Headers("POST", path, orderData, creds);

      const res = await fetch(`${API_BASE}${path}`, {
        method: "POST",
        headers,
        body: JSON.stringify(orderData),
      });

      if (!res.ok) {
        const errorText = await res.text();
        console.error("probable.placeMarketOrder failed:", res.status, errorText);
        return null;
      }

      const data = await res.json();
      return mapOrder(data);
    } catch (error) {
      console.error("probable.placeMarketOrder error:", error);
      return null;
    }
  },

  async cancelOrder(orderId: string): Promise<boolean> {
    try {
      const creds = getCredentials();
      if (!creds) {
        console.error("probable.cancelOrder: not configured");
        return false;
      }

      // Note: Cancel requires tokenId - we'd need to track this from the original order
      // For now, using a placeholder approach
      const path = `/public/api/v1/order/${CHAIN_ID}/${orderId}`;
      const headers = getL2Headers("DELETE", path, null, creds);

      const res = await fetch(`${API_BASE}${path}`, {
        method: "DELETE",
        headers,
      });

      if (!res.ok) {
        console.error("probable.cancelOrder failed:", res.status, await res.text());
        return false;
      }

      const data = await res.json();
      return data.status === "CANCELED" || data.status === "CANCELLED";
    } catch (error) {
      console.error("probable.cancelOrder error:", error);
      return false;
    }
  },

  async getPositions(): Promise<Position[]> {
    try {
      const creds = getCredentials();
      if (!creds) {
        console.error("probable.getPositions: not configured");
        return [];
      }

      // Use the user address for position query
      const userAddress = creds.proxyWalletAddress || creds.eoaAddress;
      const url = `${API_BASE}/public/api/v1/position/current?user=${userAddress}&limit=100`;

      const res = await fetch(url, {
        headers: { "Content-Type": "application/json" },
      });

      if (!res.ok) {
        console.error("probable.getPositions failed:", res.status);
        return [];
      }

      const data = await res.json();

      if (Array.isArray(data)) {
        return data.map(mapPosition);
      }

      return [];
    } catch (error) {
      console.error("probable.getPositions error:", error);
      return [];
    }
  },

  async getOpenOrders(): Promise<Order[]> {
    try {
      const creds = getCredentials();
      if (!creds) {
        console.error("probable.getOpenOrders: not configured");
        return [];
      }

      const path = `/public/api/v1/orders/${CHAIN_ID}/open`;
      const headers = getL2Headers("GET", path, null, creds);

      const res = await fetch(`${API_BASE}${path}?page=1&limit=100`, {
        headers,
      });

      if (!res.ok) {
        console.error("probable.getOpenOrders failed:", res.status);
        return [];
      }

      const data = await res.json();

      if (data.orders && Array.isArray(data.orders)) {
        return data.orders.map(mapOrder);
      }

      return [];
    } catch (error) {
      console.error("probable.getOpenOrders error:", error);
      return [];
    }
  },
};

/**
 * Helper to get public trades (no auth required)
 */
export async function getPublicTrades(options?: {
  user?: string;
  limit?: number;
  side?: "BUY" | "SELL";
  eventId?: string;
}): Promise<any[]> {
  try {
    const params = new URLSearchParams();
    if (options?.user) params.set("user", options.user);
    if (options?.limit) params.set("limit", options.limit.toString());
    if (options?.side) params.set("side", options.side);
    if (options?.eventId) params.set("eventId", options.eventId);

    const url = `${API_BASE}/public/api/v1/trades?${params.toString()}`;
    const res = await fetch(url);

    if (!res.ok) {
      console.error("getPublicTrades failed:", res.status);
      return [];
    }

    return await res.json();
  } catch (error) {
    console.error("getPublicTrades error:", error);
    return [];
  }
}

/**
 * Helper to get user activity (no auth required)
 */
export async function getUserActivity(
  userAddress: string,
  options?: {
    limit?: number;
    type?: ("TRADE" | "SPLIT" | "MERGE" | "REDEEM" | "REWARD" | "CONVERSION")[];
    sortBy?: "TIMESTAMP" | "TOKENS" | "CASH";
    sortDirection?: "ASC" | "DESC";
  }
): Promise<any[]> {
  try {
    const params = new URLSearchParams();
    params.set("user", userAddress);
    if (options?.limit) params.set("limit", options.limit.toString());
    if (options?.type) params.set("type", options.type.join(","));
    if (options?.sortBy) params.set("sortBy", options.sortBy);
    if (options?.sortDirection) params.set("sortDirection", options.sortDirection);

    const url = `${API_BASE}/public/api/v1/activity?${params.toString()}`;
    const res = await fetch(url);

    if (!res.ok) {
      console.error("getUserActivity failed:", res.status);
      return [];
    }

    return await res.json();
  } catch (error) {
    console.error("getUserActivity error:", error);
    return [];
  }
}

/**
 * Notes:
 *
 * Contract Addresses (BSC Mainnet):
 * - USDT: 0x364d05055614B506e2b9A287E4ac34167204cA83
 * - CTF Token (ERC1155): 0xc53a8b3bF7934fe94305Ed7f84a2ea8ce1028a12
 * - CTF Exchange: 0xF99F5367ce708c66F0860B77B4331301A5597c86
 *
 * Authentication Flow:
 * 1. L1 (EIP-712): Get nonce → Sign message → Generate API key
 * 2. L2 (HMAC): Use API key + secret to sign requests
 *
 * Order Signing:
 * - Orders must be signed with EIP-712 by the EOA
 * - maker/owner = proxy wallet address
 * - signer = EOA address
 *
 * TODO:
 * - Implement EIP-712 order signing with ethers/viem
 * - Find/confirm orderbook endpoint
 * - Add WebSocket support for real-time data
 */
