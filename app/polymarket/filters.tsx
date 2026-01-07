"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";

const SORT_OPTIONS = [
  { label: "Trending", value: "volume24hr" },
  { label: "New", value: "startDate" },
  { label: "Ending Soon", value: "endDate" },
] as const;

const CATEGORIES = [
  { label: "All", value: "" },
  { label: "Politics", value: "politics" },
  { label: "Sports", value: "sports" },
  { label: "Crypto", value: "crypto" },
  { label: "Pop Culture", value: "pop-culture" },
  { label: "Economy", value: "economy" },
  { label: "Geopolitics", value: "geopolitics" },
  { label: "Science", value: "science" },
] as const;

const STRATEGIES = [
  { label: "Biggest Spread", value: "spread-finder", description: "Find markets with highest spreads" },
  { label: "Smallest Spread", value: "smallest-spread", description: "Find markets with lowest spreads" },
] as const;

function buildHref(params: { order?: string; tag_slug?: string; strategy?: string }) {
  const sp = new URLSearchParams();
  if (params.strategy) {
    sp.set("strategy", params.strategy);
    // Keep tag_slug for strategies
    if (params.tag_slug) {
      sp.set("tag_slug", params.tag_slug);
    }
  } else {
    if (params.order && params.order !== "volume24hr") {
      sp.set("order", params.order);
    }
    if (params.tag_slug) {
      sp.set("tag_slug", params.tag_slug);
    }
  }
  const qs = sp.toString();
  return qs ? `/polymarket?${qs}` : "/polymarket";
}

export function Filters() {
  const searchParams = useSearchParams();
  const currentOrder = searchParams.get("order") || "volume24hr";
  const currentTagSlug = searchParams.get("tag_slug") || "";
  const currentStrategy = searchParams.get("strategy") || "";

  return (
    <div className="space-y-4">
      <div className="flex justify-between flex-wrap gap-4">
        {/* Sort buttons */}
        <div className="flex flex-wrap gap-2">
          {SORT_OPTIONS.map((opt) => (
            <Link
              key={opt.value}
              href={buildHref({ order: opt.value, tag_slug: currentTagSlug })}
              className={cn(
                "px-4 py-2 rounded-full text-sm font-medium transition-colors",
                currentOrder === opt.value && !currentStrategy
                  ? "bg-blue-600 text-white"
                  : "bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 hover:bg-neutral-200 dark:hover:bg-neutral-700"
              )}
            >
              {opt.label}
            </Link>
          ))}
        </div>

        {/* Category pills */}
        <div className="flex flex-wrap gap-2">
          {CATEGORIES.map((cat) => (
            <Link
              key={cat.value}
              href={buildHref({
                order: currentStrategy ? undefined : currentOrder,
                tag_slug: cat.value,
                strategy: currentStrategy || undefined
              })}
              className={cn(
                "px-3 py-1.5 rounded-lg text-sm font-medium transition-colors border h-fit",
                currentTagSlug === cat.value
                  ? "border-blue-600 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400"
                  : "border-neutral-200 dark:border-neutral-700 text-neutral-600 dark:text-neutral-400 hover:border-neutral-300 dark:hover:border-neutral-600"
              )}
            >
              {cat.label}
            </Link>
          ))}
        </div>
      </div>

      {/* Strategies */}
      <div className="flex flex-wrap gap-2 pt-2 border-t border-neutral-200 dark:border-neutral-800">
        <span className="text-xs font-medium text-neutral-500 dark:text-neutral-400 self-center mr-2">
          Strategies:
        </span>
        {STRATEGIES.map((strat) => (
          <Link
            key={strat.value}
            href={buildHref({
              strategy: currentStrategy === strat.value ? undefined : strat.value,
              tag_slug: currentTagSlug
            })}
            className={cn(
              "px-4 py-2 rounded-full text-sm font-medium transition-colors",
              currentStrategy === strat.value
                ? "bg-purple-600 text-white"
                : "bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 hover:bg-purple-200 dark:hover:bg-purple-900/50"
            )}
          >
            {strat.label}
          </Link>
        ))}
      </div>
    </div>
  );
}
