export type Market = {
  id: string;
  question: string;
  conditionId: string;
  slug: string;
  endDate: string;
  image: string;
  icon: string;
  outcomes: string; // JSON string
  outcomePrices: string; // JSON string
  volume: string;
  volume24hr: number;
  liquidity: string;
  active: boolean;
  closed: boolean;
  acceptingOrders: boolean;
  bestBid: number;
  bestAsk: number;
  spread: number;
};

export type Event = {
  id: string;
  title: string;
  slug: string;
  endDate: string;
  image: string;
  markets: Market[];
};

type ApiResponse = {
  data: Event[];
  pagination: {
    hasMore: boolean;
    offset: number;
    limit: number;
    count: number;
  };
};

const GAMMA_HOST = "https://gamma-api.polymarket.com";

export async function fetchMarkets(offset = 0, limit = 50): Promise<{ markets: Market[]; hasMore: boolean }> {
  const url = new URL(`${GAMMA_HOST}/events/pagination`);
  url.searchParams.set("active", "true");
  url.searchParams.set("archived", "false");
  url.searchParams.set("closed", "false");
  url.searchParams.set("order", "volume24hr");
  url.searchParams.set("ascending", "false");
  url.searchParams.set("limit", String(limit));
  url.searchParams.set("offset", String(offset));

  const res = await fetch(url.toString(), {
    next: { revalidate: 30 },
  });

  if (!res.ok) {
    throw new Error("Failed to fetch markets");
  }

  const json: ApiResponse = await res.json();

  // Flatten markets from events and filter
  const markets = json.data.flatMap((event) =>
    event.markets.filter(
      (m) => m.active && !m.closed && m.acceptingOrders && m.outcomes && m.outcomePrices
    )
  );

  return {
    markets,
    hasMore: json.pagination.hasMore,
  };
}

export async function fetchAllMarkets(): Promise<Market[]> {
  const allMarkets: Market[] = [];
  let offset = 0;
  const limit = 50;

  // Fetch up to 10 pages
  for (let i = 0; i < 10; i++) {
    const { markets, hasMore } = await fetchMarkets(offset, limit);
    allMarkets.push(...markets);

    if (!hasMore) break;
    offset += limit;
  }

  return allMarkets;
}

export async function searchMarkets(query?: string): Promise<Market[]> {
  if (query) {
    // Use search API
    const url = new URL(`${GAMMA_HOST}/public-search`);
    url.searchParams.set("q", query);
    url.searchParams.set("type", "events");
    url.searchParams.set("limit_per_type", "50");

    const res = await fetch(url.toString(), {
      next: { revalidate: 30 },
    });

    if (!res.ok) {
      return [];
    }

    const json = await res.json();
    const events = (json.events || []) as Event[];

    return events.flatMap((event) =>
      event.markets.filter(
        (m) => m.active && !m.closed && m.acceptingOrders && m.outcomes && m.outcomePrices
      )
    );
  }

  return fetchAllMarkets();
}
