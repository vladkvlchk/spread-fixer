"use client";

import { useEffect, useRef } from "react";
import Image from "next/image";
import Link from "next/link";
import { useEvents, type Strategy, type Event, type Market } from "./hooks";
import { Spinner } from "@/components/ui/spinner";

function formatDate(dateString: string) {
  return new Date(dateString).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

type Props = {
  query?: string;
  order?: string;
  tagSlug?: string;
  strategy?: string;
};

// Card for a single market (used in strategy mode)
function MarketCard({ market, strategy }: { market: Market; strategy?: string }) {
  if (!market.outcomes || !market.outcomePrices) return null;
  const outcomes = JSON.parse(market.outcomes) as string[];
  const prices = JSON.parse(market.outcomePrices) as string[];
  if (outcomes.length < 2 || prices.length < 2) return null;
  const img = market.image || market.icon;

  return (
    <Link
      href={`/polymarket/${market.id}`}
      className="group relative flex flex-col bg-white dark:bg-neutral-900 rounded-2xl border border-neutral-200 dark:border-neutral-800 p-5 hover:shadow-xl hover:border-neutral-300 dark:hover:border-neutral-700 transition-all duration-300 ease-out"
    >
      <div className="flex items-start gap-4 mb-4">
        {img && (
          <div className="relative w-12 h-12 flex-shrink-0 rounded-full overflow-hidden border border-neutral-100 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-800">
            <Image
              src={img}
              alt={market.question}
              fill
              className="object-cover"
              sizes="48px"
              unoptimized
            />
          </div>
        )}
        <h2 className="text-lg font-bold text-neutral-900 dark:text-neutral-100 leading-snug line-clamp-3 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
          {market.question}
        </h2>
      </div>

      <div className="mt-auto space-y-4">
        <div className="flex gap-3">
          <div className="flex-1 relative overflow-hidden rounded-lg bg-green-50 dark:bg-green-900/20 border border-green-100 dark:border-green-900/30 p-3 transition-colors group-hover:bg-green-100 dark:group-hover:bg-green-900/30">
            <div className="text-xs font-semibold text-green-700 dark:text-green-400 uppercase tracking-wider mb-1 truncate">
              {outcomes[0]}
            </div>
            <div className="text-2xl font-bold text-green-800 dark:text-green-300">
              {Math.round(parseFloat(prices[0]) * 100)}%
            </div>
          </div>
          <div className="flex-1 relative overflow-hidden rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-900/30 p-3 transition-colors group-hover:bg-red-100 dark:group-hover:bg-red-900/30">
            <div className="text-xs font-semibold text-red-700 dark:text-red-400 uppercase tracking-wider mb-1 truncate">
              {outcomes[1]}
            </div>
            <div className="text-2xl font-bold text-red-800 dark:text-red-300">
              {Math.round(parseFloat(prices[1]) * 100)}%
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between text-xs font-medium text-neutral-500 dark:text-neutral-500 pt-4 border-t border-neutral-100 dark:border-neutral-800">
          <div className="flex gap-3">
            <span>${Math.round(parseFloat(market.volume || "0")).toLocaleString()} vol</span>
            <span>(${Math.round(market.volume24hr || 0).toLocaleString()} 24h)</span>
          </div>
          {(strategy === "spread-finder" || strategy === "smallest-spread") && market.spread > 0 ? (
            <div className="px-2 py-0.5 rounded bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 font-semibold">
              {(market.spread * 100).toFixed(1)}% spread
            </div>
          ) : (
            <div>Ends {formatDate(market.endDate)}</div>
          )}
        </div>
      </div>
    </Link>
  );
}

// Extract short name from market question by removing common parts
function getShortName(question: string, allQuestions: string[]): string {
  if (allQuestions.length < 2) return question;

  // Find common prefix
  let prefix = "";
  for (let i = 0; i < allQuestions[0].length; i++) {
    const char = allQuestions[0][i];
    if (allQuestions.every((q) => q[i] === char)) {
      prefix += char;
    } else {
      break;
    }
  }

  // Find common suffix
  let suffix = "";
  for (let i = 1; i <= allQuestions[0].length; i++) {
    const char = allQuestions[0][allQuestions[0].length - i];
    if (allQuestions.every((q) => q[q.length - i] === char)) {
      suffix = char + suffix;
    } else {
      break;
    }
  }

  // Remove common parts
  let short = question;
  if (prefix.length > 5) short = short.slice(prefix.length);
  if (suffix.length > 3) short = short.slice(0, short.length - suffix.length);

  return short.trim() || question;
}

// Card for an event (contains one or more markets)
function EventCard({ event }: { event: Event }) {
  const img = event.image || event.icon;
  const markets = event.markets;

  // Single market event - show like before (binary yes/no)
  if (markets.length === 1) {
    const market = markets[0];
    if (!market.outcomes || !market.outcomePrices) return null;
    const outcomes = JSON.parse(market.outcomes) as string[];
    const prices = JSON.parse(market.outcomePrices) as string[];
    if (outcomes.length < 2 || prices.length < 2) return null;

    return (
      <Link
        href={`/polymarket/${market.id}`}
        className="group relative flex flex-col bg-white dark:bg-neutral-900 rounded-2xl border border-neutral-200 dark:border-neutral-800 p-5 hover:shadow-xl hover:border-neutral-300 dark:hover:border-neutral-700 transition-all duration-300 ease-out"
      >
        <div className="flex items-start gap-4 mb-4">
          {img && (
            <div className="relative w-12 h-12 flex-shrink-0 rounded-full overflow-hidden border border-neutral-100 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-800">
              <Image
                src={img}
                alt={event.title}
                fill
                className="object-cover"
                sizes="48px"
                unoptimized
              />
            </div>
          )}
          <h2 className="text-lg font-bold text-neutral-900 dark:text-neutral-100 leading-snug line-clamp-3 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
            {event.title}
          </h2>
        </div>

        <div className="mt-auto space-y-4">
          <div className="flex gap-3">
            <div className="flex-1 relative overflow-hidden rounded-lg bg-green-50 dark:bg-green-900/20 border border-green-100 dark:border-green-900/30 p-3 transition-colors group-hover:bg-green-100 dark:group-hover:bg-green-900/30">
              <div className="text-xs font-semibold text-green-700 dark:text-green-400 uppercase tracking-wider mb-1 truncate">
                {outcomes[0]}
              </div>
              <div className="text-2xl font-bold text-green-800 dark:text-green-300">
                {Math.round(parseFloat(prices[0]) * 100)}%
              </div>
            </div>
            <div className="flex-1 relative overflow-hidden rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-900/30 p-3 transition-colors group-hover:bg-red-100 dark:group-hover:bg-red-900/30">
              <div className="text-xs font-semibold text-red-700 dark:text-red-400 uppercase tracking-wider mb-1 truncate">
                {outcomes[1]}
              </div>
              <div className="text-2xl font-bold text-red-800 dark:text-red-300">
                {Math.round(parseFloat(prices[1]) * 100)}%
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between text-xs font-medium text-neutral-500 dark:text-neutral-500 pt-4 border-t border-neutral-100 dark:border-neutral-800">
            <div className="flex gap-3">
              <span>${Math.round(event.volume || 0).toLocaleString()} vol</span>
              <span>(${Math.round(event.volume24hr || 0).toLocaleString()} 24h)</span>
            </div>
            <div>Ends {formatDate(event.endDate)}</div>
          </div>
        </div>
      </Link>
    );
  }

  // Multi-market event - show outcomes list
  // Sort markets by price descending to show leaders first
  const sortedMarkets = [...markets].sort((a, b) => {
    const priceA = a.outcomePrices ? parseFloat(JSON.parse(a.outcomePrices)[0]) : 0;
    const priceB = b.outcomePrices ? parseFloat(JSON.parse(b.outcomePrices)[0]) : 0;
    return priceB - priceA;
  });

  const topMarkets = sortedMarkets.slice(0, 4);
  const remainingCount = markets.length - 4;

  // Get all questions to find common parts
  const allQuestions = markets.map((m) => m.question);

  return (
    <Link
      href={`/polymarket/${markets[0].id}`}
      className="group relative flex flex-col bg-white dark:bg-neutral-900 rounded-2xl border border-neutral-200 dark:border-neutral-800 p-5 hover:shadow-xl hover:border-neutral-300 dark:hover:border-neutral-700 transition-all duration-300 ease-out"
    >
      <div className="flex items-start gap-4 mb-4">
        {img && (
          <div className="relative w-12 h-12 flex-shrink-0 rounded-full overflow-hidden border border-neutral-100 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-800">
            <Image
              src={img}
              alt={event.title}
              fill
              className="object-cover"
              sizes="48px"
              unoptimized
            />
          </div>
        )}
        <h2 className="text-lg font-bold text-neutral-900 dark:text-neutral-100 leading-snug line-clamp-3 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
          {event.title}
        </h2>
      </div>

      <div className="mt-auto space-y-3">
        {topMarkets.map((market) => {
          if (!market.outcomePrices) return null;
          const prices = JSON.parse(market.outcomePrices) as string[];
          const price = parseFloat(prices[0]) * 100;

          return (
            <div
              key={market.id}
              className="flex items-center justify-between gap-3 text-sm"
            >
              <span className="text-neutral-700 dark:text-neutral-300 truncate flex-1">
                {getShortName(market.question, allQuestions)}
              </span>
              <div className="flex items-center gap-2">
                <div className="w-16 h-2 bg-neutral-200 dark:bg-neutral-700 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-blue-500 dark:bg-blue-400 rounded-full"
                    style={{ width: `${Math.min(price, 100)}%` }}
                  />
                </div>
                <span className="text-neutral-900 dark:text-neutral-100 font-semibold w-12 text-right">
                  {Math.round(price)}%
                </span>
              </div>
            </div>
          );
        })}
        {remainingCount > 0 && (
          <div className="text-xs text-neutral-500 dark:text-neutral-400">
            +{remainingCount} more options
          </div>
        )}

        <div className="flex items-center justify-between text-xs font-medium text-neutral-500 dark:text-neutral-500 pt-4 border-t border-neutral-100 dark:border-neutral-800">
          <div className="flex gap-3">
            <span>${Math.round(event.volume || 0).toLocaleString()} vol</span>
            <span>(${Math.round(event.volume24hr || 0).toLocaleString()} 24h)</span>
          </div>
          <div>Ends {formatDate(event.endDate)}</div>
        </div>
      </div>
    </Link>
  );
}

export function MarketsGrid({ query, order, tagSlug, strategy }: Props) {
  const {
    events,
    markets,
    isLoading,
    error,
    hasNextPage,
    fetchNextPage,
    isFetchingNextPage,
    mode,
  } = useEvents({ query, order, tagSlug, strategy: strategy as Strategy });

  const loadMoreRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = loadMoreRef.current;
    if (!el || !hasNextPage) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasNextPage && !isFetchingNextPage) {
          fetchNextPage();
        }
      },
      { threshold: 0.1 }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [hasNextPage, fetchNextPage, isFetchingNextPage]);

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-24">
        <Spinner className="size-8 text-neutral-400" />
        <p className="mt-4 text-sm text-neutral-500">Loading markets...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-24 text-red-500">
        Failed to load markets
      </div>
    );
  }

  // Strategy mode - show individual markets
  if (mode === "markets") {
    if (!markets || markets.length === 0) {
      return (
        <div className="text-center py-24 text-neutral-500">
          No markets found
        </div>
      );
    }

    return (
      <>
        <p className="text-sm text-neutral-600 dark:text-neutral-400 mb-6">
          {markets.length} markets sorted by spread
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {markets.map((market, index) => (
            <MarketCard key={market.id || index} market={market} strategy={strategy} />
          ))}
        </div>
      </>
    );
  }

  // Events mode
  if (!events || events.length === 0) {
    return (
      <div className="text-center py-24 text-neutral-500">
        No markets found
      </div>
    );
  }

  return (
    <>
      {query && (
        <p className="text-sm text-neutral-600 dark:text-neutral-400 mb-6">
          {events.length} results for &quot;{query}&quot;
        </p>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {events.map((event, index) => (
          <EventCard key={event.id || index} event={event} />
        ))}
      </div>

      {/* Infinite scroll trigger */}
      <div ref={loadMoreRef} className="py-8 flex justify-center">
        {isFetchingNextPage && (
          <Spinner className="size-6 text-neutral-400" />
        )}
        {!hasNextPage && events.length > 0 && (
          <p className="text-sm text-neutral-500">No more markets</p>
        )}
      </div>
    </>
  );
}
