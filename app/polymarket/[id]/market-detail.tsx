"use client";

import Link from "next/link";
import Image from "next/image";
import { useMarket, useOrderBook, usePriceHistory } from "../hooks";
import { Spinner } from "@/components/ui/spinner";
import {
  Area,
  AreaChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

function formatCurrency(amount: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(amount);
}

function formatDate(dateString: string) {
  return new Date(dateString).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatTime(timestamp: number) {
  return new Date(timestamp * 1000).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

export function MarketDetail({ id }: { id: string }) {
  const { data: market, isLoading, error } = useMarket(id);

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-24">
        <Spinner className="size-8 text-neutral-400" />
        <p className="mt-4 text-sm text-neutral-500">Loading market...</p>
      </div>
    );
  }

  if (error || !market) {
    return (
      <div className="text-center py-24">
        <p className="text-red-500 mb-4">Market not found</p>
        <Link href="/polymarket" className="text-blue-500 hover:underline">
          Back to markets
        </Link>
      </div>
    );
  }

  const outcomes = JSON.parse(market.outcomes || "[]") as string[];
  const prices = JSON.parse(market.outcomePrices || "[]") as string[];
  const tokenIds = JSON.parse(market.clobTokenIds || "[]") as string[];
  const img = market.image || market.icon;

  return (
    <>
      <Link
        href="/polymarket"
        className="text-sm text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300 mb-6 block"
      >
        &larr; Back to markets
      </Link>

      <div className="bg-white dark:bg-neutral-900 rounded-2xl border border-neutral-200 dark:border-neutral-800 p-6 mb-6">
        <div className="flex items-start gap-4 mb-6">
          {img && (
            <div className="relative w-16 h-16 flex-shrink-0 rounded-xl overflow-hidden">
              <Image
                src={img}
                alt={market.question}
                fill
                className="object-cover"
                unoptimized
              />
            </div>
          )}
          <div>
            <h1 className="text-2xl font-bold text-neutral-900 dark:text-white mb-2">
              {market.question}
            </h1>
            <p className="text-sm text-neutral-500">
              Ends {formatDate(market.endDate)}
            </p>
          </div>
        </div>

        {/* Prices */}
        {outcomes.length >= 2 && prices.length >= 2 && (
          <div className="grid grid-cols-2 gap-4 mb-6">
            <div className="bg-green-50 dark:bg-green-900/20 rounded-xl p-4 border border-green-100 dark:border-green-900/30">
              <div className="text-sm font-medium text-green-700 dark:text-green-400 mb-1">
                {outcomes[0]}
              </div>
              <div className="text-3xl font-bold text-green-800 dark:text-green-300">
                {Math.round(parseFloat(prices[0]) * 100)}%
              </div>
            </div>
            <div className="bg-red-50 dark:bg-red-900/20 rounded-xl p-4 border border-red-100 dark:border-red-900/30">
              <div className="text-sm font-medium text-red-700 dark:text-red-400 mb-1">
                {outcomes[1]}
              </div>
              <div className="text-3xl font-bold text-red-800 dark:text-red-300">
                {Math.round(parseFloat(prices[1]) * 100)}%
              </div>
            </div>
          </div>
        )}

        {/* Stats */}
        <div className="grid grid-cols-3 gap-4 text-center border-t border-neutral-100 dark:border-neutral-800 pt-4">
          <div>
            <div className="text-xs text-neutral-500 mb-1">Volume</div>
            <div className="font-semibold text-neutral-900 dark:text-white">
              {formatCurrency(parseFloat(market.volume || "0"))}
            </div>
          </div>
          <div>
            <div className="text-xs text-neutral-500 mb-1">24h Volume</div>
            <div className="font-semibold text-neutral-900 dark:text-white">
              {formatCurrency(market.volume24hr || 0)}
            </div>
          </div>
          <div>
            <div className="text-xs text-neutral-500 mb-1">Liquidity</div>
            <div className="font-semibold text-neutral-900 dark:text-white">
              {formatCurrency(parseFloat(market.liquidity || "0"))}
            </div>
          </div>
        </div>
      </div>

      {/* Price Chart */}
      {tokenIds[0] && (
        <PriceChart tokenId={tokenIds[0]} outcome={outcomes[0] || "Yes"} />
      )}

      {/* Order Book */}
      {tokenIds[0] && (
        <OrderBookSection tokenId={tokenIds[0]} outcome={outcomes[0] || "Yes"} />
      )}

      {/* Description */}
      {market.description && (
        <div className="bg-white dark:bg-neutral-900 rounded-2xl border border-neutral-200 dark:border-neutral-800 p-6 mt-6">
          <h2 className="text-lg font-bold text-neutral-900 dark:text-white mb-3">
            Resolution Criteria
          </h2>
          <p className="text-sm text-neutral-600 dark:text-neutral-400 whitespace-pre-wrap">
            {market.description}
          </p>
        </div>
      )}
    </>
  );
}

function PriceChart({ tokenId, outcome }: { tokenId: string; outcome: string }) {
  const { data: history, isLoading } = usePriceHistory(tokenId);

  if (isLoading) {
    return (
      <div className="bg-white dark:bg-neutral-900 rounded-2xl border border-neutral-200 dark:border-neutral-800 p-6 mb-6">
        <div className="h-64 flex items-center justify-center">
          <Spinner className="size-6 text-neutral-400" />
        </div>
      </div>
    );
  }

  if (!history || history.length === 0) {
    return null;
  }

  const data = history.map((point) => ({
    time: formatTime(point.t),
    price: point.p * 100,
    timestamp: point.t,
  }));

  const minPrice = Math.max(0, Math.min(...data.map((d) => d.price)) - 5);
  const maxPrice = Math.min(100, Math.max(...data.map((d) => d.price)) + 5);

  return (
    <div className="bg-white dark:bg-neutral-900 rounded-2xl border border-neutral-200 dark:border-neutral-800 p-6 mb-6">
      <h2 className="text-lg font-bold text-neutral-900 dark:text-white mb-4">
        Price History ({outcome})
      </h2>
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data}>
            <defs>
              <linearGradient id="priceGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#22c55e" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
              </linearGradient>
            </defs>
            <XAxis
              dataKey="time"
              axisLine={false}
              tickLine={false}
              tick={{ fontSize: 12, fill: "#a3a3a3" }}
              interval="preserveStartEnd"
            />
            <YAxis
              domain={[minPrice, maxPrice]}
              axisLine={false}
              tickLine={false}
              tick={{ fontSize: 12, fill: "#a3a3a3" }}
              tickFormatter={(value) => `${value}%`}
              width={45}
            />
            <Tooltip
              content={({ active, payload }) => {
                if (active && payload && payload.length) {
                  const point = payload[0].payload;
                  return (
                    <div className="bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-lg px-3 py-2 shadow-lg">
                      <div className="text-xs text-neutral-500">
                        {new Date(point.timestamp * 1000).toLocaleString()}
                      </div>
                      <div className="text-sm font-semibold text-neutral-900 dark:text-white">
                        {point.price.toFixed(1)}%
                      </div>
                    </div>
                  );
                }
                return null;
              }}
            />
            <Area
              type="monotone"
              dataKey="price"
              stroke="#22c55e"
              strokeWidth={2}
              fill="url(#priceGradient)"
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function OrderBookSection({ tokenId, outcome }: { tokenId: string; outcome: string }) {
  const { data: orderBook, isLoading } = useOrderBook(tokenId);

  if (isLoading) {
    return (
      <div className="bg-white dark:bg-neutral-900 rounded-2xl border border-neutral-200 dark:border-neutral-800 p-6">
        <div className="h-48 flex items-center justify-center">
          <Spinner className="size-6 text-neutral-400" />
        </div>
      </div>
    );
  }

  if (!orderBook) {
    return null;
  }

  return (
    <div className="bg-white dark:bg-neutral-900 rounded-2xl border border-neutral-200 dark:border-neutral-800 p-6">
      <h2 className="text-lg font-bold text-neutral-900 dark:text-white mb-4">
        Order Book ({outcome})
      </h2>

      <div className="grid grid-cols-2 gap-6">
        {/* Bids */}
        <div>
          <div className="text-sm font-medium text-green-600 dark:text-green-400 mb-2">
            Bids (Buy)
          </div>
          <div className="space-y-1">
            <div className="grid grid-cols-2 text-xs text-neutral-500 pb-1 border-b border-neutral-100 dark:border-neutral-800">
              <span>Price</span>
              <span className="text-right">Size</span>
            </div>
            {orderBook.bids.slice(0, 10).reverse().map((bid, i) => (
              <div key={i} className="grid grid-cols-2 text-sm py-1 relative">
                <div
                  className="absolute inset-0 bg-green-500/10 rounded"
                  style={{
                    width: `${Math.min(100, (parseFloat(bid.size) / 1000) * 100)}%`,
                  }}
                />
                <span className="relative text-green-600 dark:text-green-400 font-mono">
                  {(parseFloat(bid.price) * 100).toFixed(0)}¢
                </span>
                <span className="relative text-right text-neutral-600 dark:text-neutral-400 font-mono">
                  {parseFloat(bid.size).toFixed(0)}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Asks */}
        <div>
          <div className="text-sm font-medium text-red-600 dark:text-red-400 mb-2">
            Asks (Sell)
          </div>
          <div className="space-y-1">
            <div className="grid grid-cols-2 text-xs text-neutral-500 pb-1 border-b border-neutral-100 dark:border-neutral-800">
              <span>Price</span>
              <span className="text-right">Size</span>
            </div>
            {orderBook.asks.slice(0, 10).map((ask, i) => (
              <div key={i} className="grid grid-cols-2 text-sm py-1 relative">
                <div
                  className="absolute inset-0 bg-red-500/10 rounded right-0 left-auto"
                  style={{
                    width: `${Math.min(100, (parseFloat(ask.size) / 1000) * 100)}%`,
                  }}
                />
                <span className="relative text-red-600 dark:text-red-400 font-mono">
                  {(parseFloat(ask.price) * 100).toFixed(0)}¢
                </span>
                <span className="relative text-right text-neutral-600 dark:text-neutral-400 font-mono">
                  {parseFloat(ask.size).toFixed(0)}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
