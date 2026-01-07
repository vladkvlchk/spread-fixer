"use client";

import { useQuery } from "@tanstack/react-query";

export type Market = {
  id: string;
  question: string;
  conditionId: string;
  slug: string;
  endDate: string;
  image: string;
  icon: string;
  outcomes: string;
  outcomePrices: string;
  volume: string;
  volume24hr: number;
  liquidity: string;
  active: boolean;
  closed: boolean;
  acceptingOrders: boolean;
  bestBid: number;
  bestAsk: number;
  spread: number;
  description?: string;
  clobTokenIds?: string;
};

export type Event = {
  id: string;
  title: string;
  slug: string;
  endDate: string;
  image: string;
  markets: Market[];
};

type OrderBookEntry = {
  price: string;
  size: string;
};

type OrderBook = {
  bids: OrderBookEntry[];
  asks: OrderBookEntry[];
};

type PricePoint = {
  t: number;
  p: number;
};

// Fetch markets via local API proxy
async function fetchMarkets(offset = 0, limit = 50) {
  const res = await fetch(`/api/polymarket/markets?offset=${offset}&limit=${limit}`);
  if (!res.ok) throw new Error("Failed to fetch markets");

  const json = await res.json();
  const markets = json.data.flatMap((event: Event) =>
    event.markets.filter(
      (m: Market) =>
        m.active && !m.closed && m.acceptingOrders && m.outcomes && m.outcomePrices
    )
  );

  return { markets, hasMore: json.pagination?.hasMore ?? false };
}

async function fetchAllMarkets(): Promise<Market[]> {
  const allMarkets: Market[] = [];
  let offset = 0;
  const limit = 50;

  for (let i = 0; i < 10; i++) {
    const { markets, hasMore } = await fetchMarkets(offset, limit);
    allMarkets.push(...markets);
    if (!hasMore) break;
    offset += limit;
  }

  return allMarkets;
}

async function searchMarketsApi(query: string): Promise<Market[]> {
  const res = await fetch(`/api/polymarket/markets?q=${encodeURIComponent(query)}`);
  if (!res.ok) return [];

  const json = await res.json();
  const events = (json.events || []) as Event[];

  return events.flatMap((event) =>
    event.markets.filter(
      (m) => m.active && !m.closed && m.acceptingOrders && m.outcomes && m.outcomePrices
    )
  );
}

// Hooks
export function useMarkets(query?: string) {
  return useQuery({
    queryKey: ["markets", query || "all"],
    queryFn: () => (query ? searchMarketsApi(query) : fetchAllMarkets()),
    staleTime: 30 * 1000,
  });
}

export function useMarket(id: string) {
  return useQuery({
    queryKey: ["market", id],
    queryFn: async (): Promise<Market | null> => {
      const res = await fetch(`/api/polymarket/markets/${id}`);
      if (!res.ok) return null;
      return res.json();
    },
    staleTime: 30 * 1000,
  });
}

export function useOrderBook(tokenId: string | undefined) {
  return useQuery({
    queryKey: ["orderbook", tokenId],
    queryFn: async (): Promise<OrderBook | null> => {
      if (!tokenId) return null;
      const res = await fetch(`/api/polymarket/orderbook?tokenId=${tokenId}`);
      if (!res.ok) return null;
      return res.json();
    },
    enabled: !!tokenId,
    staleTime: 5 * 1000,
    refetchInterval: 10 * 1000,
  });
}

export function usePriceHistory(tokenId: string | undefined) {
  return useQuery({
    queryKey: ["priceHistory", tokenId],
    queryFn: async (): Promise<PricePoint[]> => {
      if (!tokenId) return [];
      const res = await fetch(`/api/polymarket/prices?tokenId=${tokenId}`);
      if (!res.ok) return [];
      const json = await res.json();
      return json.history || [];
    },
    enabled: !!tokenId,
    staleTime: 60 * 1000,
  });
}
