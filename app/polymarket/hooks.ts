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
  icon?: string;
  markets: Market[];
  volume: number;
  volume24hr: number;
  liquidity: number;
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

// Fetch events via local API proxy
async function fetchEvents(opts: FetchOptions = {}) {
  const { offset = 0, limit = 50, order, tagSlug } = opts;
  const params = new URLSearchParams();
  params.set("offset", String(offset));
  params.set("limit", String(limit));
  if (order) params.set("order", order);
  if (tagSlug) params.set("tag_slug", tagSlug);

  const res = await fetch(`/api/polymarket/markets?${params}`);
  if (!res.ok) throw new Error("Failed to fetch events");

  const json = await res.json();
  // Filter events that have active markets
  const events = (json.data as Event[]).filter((event) =>
    event.markets.some(
      (m) => m.active && !m.closed && m.acceptingOrders && m.outcomes && m.outcomePrices
    )
  ).map((event) => ({
    ...event,
    // Keep only active markets within each event
    markets: event.markets.filter(
      (m) => m.active && !m.closed && m.acceptingOrders && m.outcomes && m.outcomePrices
    ),
  }));

  return { events, hasMore: json.pagination?.hasMore ?? false };
}

const PAGE_SIZE = 20;

// Fetch all events for strategies (loads all pages)
async function fetchAllEvents(tagSlug?: string): Promise<Event[]> {
  const allEvents: Event[] = [];
  let offset = 0;
  const limit = 100;

  for (let i = 0; i < 20; i++) {
    const { events, hasMore } = await fetchEvents({ offset, limit, tagSlug });
    allEvents.push(...events);
    if (!hasMore) break;
    offset += limit;
  }

  return allEvents;
}

// Extract all markets from events (for strategies that sort by market properties)
function flattenEventsToMarkets(events: Event[]): Market[] {
  return events.flatMap((event) => event.markets);
}

async function searchEventsApi(query: string): Promise<Event[]> {
  const res = await fetch(`/api/polymarket/markets?q=${encodeURIComponent(query)}`);
  if (!res.ok) return [];

  const json = await res.json();
  const events = (json.events || []) as Event[];

  return events
    .filter((event) =>
      event.markets.some(
        (m) => m.active && !m.closed && m.acceptingOrders && m.outcomes && m.outcomePrices
      )
    )
    .map((event) => ({
      ...event,
      markets: event.markets.filter(
        (m) => m.active && !m.closed && m.acceptingOrders && m.outcomes && m.outcomePrices
      ),
    }));
}

export type Strategy = "spread-finder" | "smallest-spread" | null;

type UseEventsOptions = {
  query?: string;
  order?: string;
  tagSlug?: string;
  strategy?: Strategy;
};

type UseEventsResult = {
  events?: Event[];
  markets?: Market[];  // Only for strategy mode
  isLoading: boolean;
  error: Error | null;
  hasNextPage: boolean;
  fetchNextPage: () => void;
  isFetchingNextPage: boolean;
  mode: "events" | "markets";
};

// Hooks
export function useEvents(opts: UseEventsOptions = {}): UseEventsResult {
  const { query, order, tagSlug, strategy } = opts;

  // Search uses regular query
  const searchQuery = useQuery({
    queryKey: ["events-search", query],
    queryFn: () => searchEventsApi(query!),
    enabled: !!query && !strategy,
    staleTime: 30 * 1000,
  });

  // Strategy queries - fetch all markets and sort by spread
  const strategyQuery = useQuery({
    queryKey: ["markets-strategy", strategy, tagSlug || ""],
    queryFn: async () => {
      const events = await fetchAllEvents(tagSlug);
      const markets = flattenEventsToMarkets(events);
      const withSpread = markets.filter((m) => m.spread > 0);

      if (strategy === "spread-finder") {
        return withSpread.sort((a, b) => b.spread - a.spread);
      }
      if (strategy === "smallest-spread") {
        return withSpread.sort((a, b) => a.spread - b.spread);
      }
      return markets;
    },
    enabled: !!strategy && !query,
    staleTime: 30 * 1000,
  });

  // Browse uses infinite query for events
  const infiniteQuery = useInfiniteQuery({
    queryKey: ["events-infinite", order || "volume24hr", tagSlug || ""],
    queryFn: async ({ pageParam = 0 }) => {
      const { events, hasMore } = await fetchEvents({
        offset: pageParam,
        limit: PAGE_SIZE,
        order,
        tagSlug,
      });
      return { events, hasMore, nextOffset: pageParam + PAGE_SIZE };
    },
    initialPageParam: 0,
    getNextPageParam: (lastPage) => (lastPage.hasMore ? lastPage.nextOffset : undefined),
    enabled: !query && !strategy,
    staleTime: 30 * 1000,
  });

  // Strategy mode - returns markets
  if (strategy && !query) {
    return {
      markets: strategyQuery.data,
      isLoading: strategyQuery.isLoading,
      error: strategyQuery.error,
      hasNextPage: false,
      fetchNextPage: () => {},
      isFetchingNextPage: false,
      mode: "markets",
    };
  }

  // Search mode - returns events
  if (query) {
    return {
      events: searchQuery.data,
      isLoading: searchQuery.isLoading,
      error: searchQuery.error,
      hasNextPage: false,
      fetchNextPage: () => {},
      isFetchingNextPage: false,
      mode: "events",
    };
  }

  // Browse mode - returns events
  return {
    events: infiniteQuery.data?.pages.flatMap((p) => p.events),
    isLoading: infiniteQuery.isLoading,
    error: infiniteQuery.error,
    hasNextPage: infiniteQuery.hasNextPage,
    fetchNextPage: infiniteQuery.fetchNextPage,
    isFetchingNextPage: infiniteQuery.isFetchingNextPage,
    mode: "events",
  };
}

// Keep old hook for backward compatibility (deprecated)
export function useMarkets(opts: UseEventsOptions = {}) {
  const result = useEvents(opts);
  // For strategies, return markets directly
  if (result.mode === "markets") {
    return {
      data: result.markets,
      isLoading: result.isLoading,
      error: result.error,
      hasNextPage: result.hasNextPage,
      fetchNextPage: result.fetchNextPage,
      isFetchingNextPage: result.isFetchingNextPage,
    };
  }
  // For events mode, flatten to markets (old behavior)
  return {
    data: result.events?.flatMap((e) => e.markets),
    isLoading: result.isLoading,
    error: result.error,
    hasNextPage: result.hasNextPage,
    fetchNextPage: result.fetchNextPage,
    isFetchingNextPage: result.isFetchingNextPage,
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
