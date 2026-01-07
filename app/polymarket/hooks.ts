"use client";

import { useQuery, useInfiniteQuery } from "@tanstack/react-query";

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

type FetchOptions = {
  offset?: number;
  limit?: number;
  order?: string;
  tagSlug?: string;
};

// Fetch markets via local API proxy
async function fetchMarkets(opts: FetchOptions = {}) {
  const { offset = 0, limit = 50, order, tagSlug } = opts;
  const params = new URLSearchParams();
  params.set("offset", String(offset));
  params.set("limit", String(limit));
  if (order) params.set("order", order);
  if (tagSlug) params.set("tag_slug", tagSlug);

  const res = await fetch(`/api/polymarket/markets?${params}`);
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

const PAGE_SIZE = 20;

// Fetch all markets for strategies (loads all pages)
async function fetchAllMarkets(tagSlug?: string): Promise<Market[]> {
  const allMarkets: Market[] = [];
  let offset = 0;
  const limit = 100;

  for (let i = 0; i < 20; i++) {
    const { markets, hasMore } = await fetchMarkets({ offset, limit, tagSlug });
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

export type Strategy = "spread-finder" | null;

type UseMarketsOptions = {
  query?: string;
  order?: string;
  tagSlug?: string;
  strategy?: Strategy;
};

// Hooks
export function useMarkets(opts: UseMarketsOptions = {}) {
  const { query, order, tagSlug, strategy } = opts;

  // Search uses regular query (no pagination from API)
  const searchQuery = useQuery({
    queryKey: ["markets-search", query],
    queryFn: () => searchMarketsApi(query!),
    enabled: !!query && !strategy,
    staleTime: 30 * 1000,
  });

  // Strategy: Spread Finder - fetch all and sort by spread
  const strategyQuery = useQuery({
    queryKey: ["markets-strategy", strategy, tagSlug || ""],
    queryFn: async () => {
      const markets = await fetchAllMarkets(tagSlug);
      if (strategy === "spread-finder") {
        // Sort by spread descending (highest spread first)
        return markets
          .filter((m) => m.spread > 0)
          .sort((a, b) => b.spread - a.spread);
      }
      return markets;
    },
    enabled: !!strategy && !query,
    staleTime: 30 * 1000,
  });

  // Browse uses infinite query
  const infiniteQuery = useInfiniteQuery({
    queryKey: ["markets-infinite", order || "volume24hr", tagSlug || ""],
    queryFn: async ({ pageParam = 0 }) => {
      const { markets, hasMore } = await fetchMarkets({
        offset: pageParam,
        limit: PAGE_SIZE,
        order,
        tagSlug,
      });
      return { markets, hasMore, nextOffset: pageParam + PAGE_SIZE };
    },
    initialPageParam: 0,
    getNextPageParam: (lastPage) => (lastPage.hasMore ? lastPage.nextOffset : undefined),
    enabled: !query && !strategy,
    staleTime: 30 * 1000,
  });

  // Strategy mode
  if (strategy && !query) {
    return {
      data: strategyQuery.data,
      isLoading: strategyQuery.isLoading,
      error: strategyQuery.error,
      hasNextPage: false,
      fetchNextPage: () => {},
      isFetchingNextPage: false,
    };
  }

  // Search mode
  if (query) {
    return {
      data: searchQuery.data,
      isLoading: searchQuery.isLoading,
      error: searchQuery.error,
      hasNextPage: false,
      fetchNextPage: () => {},
      isFetchingNextPage: false,
    };
  }

  // Browse mode (infinite scroll)
  return {
    data: infiniteQuery.data?.pages.flatMap((p) => p.markets),
    isLoading: infiniteQuery.isLoading,
    error: infiniteQuery.error,
    hasNextPage: infiniteQuery.hasNextPage,
    fetchNextPage: infiniteQuery.fetchNextPage,
    isFetchingNextPage: infiniteQuery.isFetchingNextPage,
  };
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
