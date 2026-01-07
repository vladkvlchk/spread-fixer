"use client";

import { useEffect, useState } from "react";
import {
  Area,
  AreaChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

type PricePoint = {
  t: number;
  p: number;
};

type ChartData = {
  time: string;
  price: number;
  timestamp: number;
};

const CLOB_HOST = "https://clob.polymarket.com";

async function getPriceHistory(tokenId: string): Promise<PricePoint[]> {
  const startTs = Math.floor(Date.now() / 1000) - 30 * 24 * 60 * 60; // 30 days ago
  const res = await fetch(
    `${CLOB_HOST}/prices-history?market=${tokenId}&startTs=${startTs}&fidelity=720`
  );

  if (!res.ok) return [];

  const json = await res.json();
  return json.history || [];
}

function formatTime(timestamp: number) {
  return new Date(timestamp * 1000).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

export function PriceChart({ tokenId, outcome }: { tokenId: string; outcome: string }) {
  const [data, setData] = useState<ChartData[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getPriceHistory(tokenId).then((history) => {
      const chartData = history.map((point) => ({
        time: formatTime(point.t),
        price: point.p * 100,
        timestamp: point.t,
      }));
      setData(chartData);
      setLoading(false);
    });
  }, [tokenId]);

  if (loading) {
    return (
      <div className="h-64 flex items-center justify-center text-neutral-500">
        Loading chart...
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div className="h-64 flex items-center justify-center text-neutral-500">
        No price history available
      </div>
    );
  }

  const minPrice = Math.max(0, Math.min(...data.map((d) => d.price)) - 5);
  const maxPrice = Math.min(100, Math.max(...data.map((d) => d.price)) + 5);

  return (
    <div className="bg-white dark:bg-neutral-900 rounded-2xl border border-neutral-200 dark:border-neutral-800 p-6">
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
                  const point = payload[0].payload as ChartData;
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
