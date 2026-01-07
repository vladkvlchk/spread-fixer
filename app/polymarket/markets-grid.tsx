"use client";

import { useEffect, useRef } from "react";
import Image from "next/image";
import Link from "next/link";
import { useMarkets } from "./hooks";
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
};

export function MarketsGrid({ query, order, tagSlug }: Props) {
  const {
    data: markets,
    isLoading,
    error,
    hasNextPage,
    fetchNextPage,
    isFetchingNextPage,
  } = useMarkets({ query, order, tagSlug });

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

  if (!markets || markets.length === 0) {
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
          {markets.length} results for &quot;{query}&quot;
        </p>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {markets.map((market, index) => {
          if (!market.outcomes || !market.outcomePrices) return null;
          const outcomes = JSON.parse(market.outcomes) as string[];
          const prices = JSON.parse(market.outcomePrices) as string[];
          if (outcomes.length < 2 || prices.length < 2) return null;
          const img = market.image || market.icon;

          return (
            <Link
              href={`/polymarket/${market.id}`}
              key={market.id || index}
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
                  <div>Ends {formatDate(market.endDate)}</div>
                </div>
              </div>
            </Link>
          );
        })}
      </div>

      {/* Infinite scroll trigger */}
      <div ref={loadMoreRef} className="py-8 flex justify-center">
        {isFetchingNextPage && (
          <Spinner className="size-6 text-neutral-400" />
        )}
        {!hasNextPage && markets.length > 0 && (
          <p className="text-sm text-neutral-500">No more markets</p>
        )}
      </div>
    </>
  );
}
