/**
 * Polymarket platform adapter
 */

import { ClobClient, Side, OrderType as ClobOrderType, AssetType } from "@polymarket/clob-client";
import { Wallet } from "@ethersproject/wallet";
import type {
  PlatformAdapter,
  Market,
  OrderBook,
  Order,
  Position,
  OrderSide,
} from "./types";

const CLOB_HOST = "https://clob.polymarket.com";
const DATA_API = "https://data-api.polymarket.com";
const CHAIN_ID = 137;

let cachedClient: ClobClient | null = null;

async function getClient(): Promise<ClobClient | null> {
  const privateKey = process.env.POLYMARKET_PRIVATE_KEY;
  const funderAddress = process.env.POLYMARKET_FUNDER_ADDRESS;

  if (!privateKey || !funderAddress) return null;
  if (cachedClient) return cachedClient;

  try {
    const wallet = new Wallet(privateKey);
    const tempClient = new ClobClient(CLOB_HOST, CHAIN_ID, wallet);
    const creds = await tempClient.createOrDeriveApiKey();

    cachedClient = new ClobClient(
      CLOB_HOST,
      CHAIN_ID,
      wallet,
      creds,
      2,
      funderAddress
    );
    return cachedClient;
  } catch {
    cachedClient = null;
    return null;
  }
}

export const polymarketAdapter: PlatformAdapter = {
  platform: "polymarket",

  isConfigured(): boolean {
    return !!(process.env.POLYMARKET_PRIVATE_KEY && process.env.POLYMARKET_FUNDER_ADDRESS);
  },

  async getMarkets(query?: string): Promise<Market[]> {
    try {
      const url = query
        ? `${DATA_API}/markets?_q=${encodeURIComponent(query)}&active=true&closed=false`
        : `${DATA_API}/markets?active=true&closed=false&limit=50`;

      const res = await fetch(url);
      if (!res.ok) return [];

      const data = await res.json();
      return data.map((m: {
        condition_id: string;
        question: string;
        market_slug: string;
        tokens: { token_id: string; outcome: string }[];
      }) => ({
        platform: "polymarket" as const,
        id: m.condition_id,
        conditionId: m.condition_id,
        slug: m.market_slug,
        title: m.question,
        outcomes: m.tokens?.map((t: { token_id: string; outcome: string }, i: number) => ({
          index: i,
          name: t.outcome,
          tokenId: t.token_id,
        })) || [],
        externalIds: { polymarket: m.condition_id },
      }));
    } catch {
      return [];
    }
  },

  async getOrderBook(marketId: string, outcomeIndex: number): Promise<OrderBook | null> {
    try {
      // First get market to find token ID
      const marketRes = await fetch(`${DATA_API}/markets/${marketId}`);
      if (!marketRes.ok) return null;

      const market = await marketRes.json();
      const tokenId = market.tokens?.[outcomeIndex]?.token_id;
      if (!tokenId) return null;

      const bookRes = await fetch(`${CLOB_HOST}/book?token_id=${tokenId}`);
      if (!bookRes.ok) return null;

      const book = await bookRes.json();

      return {
        platform: "polymarket",
        marketId,
        outcomeIndex,
        bids: (book.bids || []).map((b: { price: string; size: string }) => ({
          price: parseFloat(b.price),
          size: parseFloat(b.size),
        })),
        asks: (book.asks || []).map((a: { price: string; size: string }) => ({
          price: parseFloat(a.price),
          size: parseFloat(a.size),
        })),
        timestamp: Date.now(),
      };
    } catch {
      return null;
    }
  },

  async placeLimitOrder(params): Promise<Order | null> {
    const client = await getClient();
    if (!client) return null;

    try {
      // Get token ID from market
      const marketRes = await fetch(`${DATA_API}/markets/${params.marketId}`);
      if (!marketRes.ok) return null;

      const market = await marketRes.json();
      const tokenId = market.tokens?.[params.outcomeIndex]?.token_id;
      if (!tokenId) return null;

      const tickSize = await client.getTickSize(tokenId);
      const negRisk = await client.getNegRisk(tokenId);

      const response = await client.createAndPostOrder({
        tokenID: tokenId,
        price: params.price,
        size: params.size,
        side: params.side === "BUY" ? Side.BUY : Side.SELL,
      }, { tickSize, negRisk });

      if (!response?.orderID) return null;

      return {
        platform: "polymarket",
        id: response.orderID,
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
    } catch {
      return null;
    }
  },

  async placeMarketOrder(params): Promise<Order | null> {
    const client = await getClient();
    if (!client) return null;

    try {
      const marketRes = await fetch(`${DATA_API}/markets/${params.marketId}`);
      if (!marketRes.ok) return null;

      const market = await marketRes.json();
      const tokenId = market.tokens?.[params.outcomeIndex]?.token_id;
      if (!tokenId) return null;

      const tickSize = await client.getTickSize(tokenId);
      const negRisk = await client.getNegRisk(tokenId);

      // Get current price from order book
      const bookRes = await fetch(`${CLOB_HOST}/book?token_id=${tokenId}`);
      const book = await bookRes.json();
      const bestAsk = book.asks?.[0]?.price ? parseFloat(book.asks[0].price) : 1;
      const estimatedCost = params.size * bestAsk;

      const response = await client.createAndPostMarketOrder(
        {
          tokenID: tokenId,
          amount: estimatedCost,
          side: params.side === "BUY" ? Side.BUY : Side.SELL,
        },
        { tickSize, negRisk },
        ClobOrderType.FOK
      );

      if (!response?.orderID) return null;

      return {
        platform: "polymarket",
        id: response.orderID,
        marketId: params.marketId,
        outcomeIndex: params.outcomeIndex,
        side: params.side,
        type: "MARKET",
        price: bestAsk,
        size: params.size,
        filledSize: params.size, // Assume filled for FOK
        status: "FILLED",
        createdAt: Date.now(),
      };
    } catch {
      return null;
    }
  },

  async cancelOrder(orderId: string): Promise<boolean> {
    const client = await getClient();
    if (!client) return false;

    try {
      await client.cancelOrder({ orderID: orderId });
      return true;
    } catch {
      return false;
    }
  },

  async getPositions(): Promise<Position[]> {
    const funderAddress = process.env.POLYMARKET_FUNDER_ADDRESS;
    if (!funderAddress) return [];

    try {
      const res = await fetch(`${DATA_API}/positions?user=${funderAddress}&sizeThreshold=0`);
      if (!res.ok) return [];

      const positions = await res.json();
      return positions.map((p: {
        conditionId: string;
        outcomeIndex: number;
        size: number;
        avgPrice: number;
        curPrice: number;
        cashPnl: number;
      }) => ({
        platform: "polymarket" as const,
        marketId: p.conditionId,
        outcomeIndex: p.outcomeIndex,
        size: p.size,
        avgPrice: p.avgPrice,
        currentPrice: p.curPrice,
        pnl: p.cashPnl,
      }));
    } catch {
      return [];
    }
  },

  async getOpenOrders(): Promise<Order[]> {
    const client = await getClient();
    if (!client) return [];

    try {
      const orders = await client.getOpenOrders();
      return orders.map((o: {
        id: string;
        asset_id: string;
        side: string;
        price: string;
        original_size: string;
        size_matched: string;
        created_at: number;
      }) => ({
        platform: "polymarket" as const,
        id: o.id,
        marketId: o.asset_id,
        outcomeIndex: 0, // Would need to look up
        side: o.side === "BUY" ? "BUY" : "SELL" as OrderSide,
        type: "LIMIT" as const,
        price: parseFloat(o.price),
        size: parseFloat(o.original_size),
        filledSize: parseFloat(o.size_matched),
        status: "OPEN" as const,
        createdAt: o.created_at,
      }));
    } catch {
      return [];
    }
  },
};

// Helper to get order book by token ID directly (for faster access)
export async function getOrderBookByTokenId(tokenId: string): Promise<OrderBook | null> {
  try {
    const res = await fetch(`${CLOB_HOST}/book?token_id=${tokenId}`);
    if (!res.ok) return null;

    const book = await res.json();
    return {
      platform: "polymarket",
      marketId: tokenId,
      outcomeIndex: 0,
      bids: (book.bids || []).map((b: { price: string; size: string }) => ({
        price: parseFloat(b.price),
        size: parseFloat(b.size),
      })),
      asks: (book.asks || []).map((a: { price: string; size: string }) => ({
        price: parseFloat(a.price),
        size: parseFloat(a.size),
      })),
      timestamp: Date.now(),
    };
  } catch {
    return null;
  }
}
