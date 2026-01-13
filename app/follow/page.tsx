"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";

type Trade = {
  timestamp: number;
  activityType: string;
  title: string;
  outcome?: string;
  side?: "BUY" | "SELL";
  size: number;
  price: number;
  total: number;
  tx: string;
  slug: string;
  asset?: string;
  liquidity?: {
    shares: number;
    avgPrice: number;
    cost: number;
  };
  copyStatus?: "pending" | "success" | "failed" | "skipped";
  copyError?: string;
};

export default function FollowPage() {
  const [address, setAddress] = useState("");
  const [interval, setInterval] = useState(2000);
  const [isRunning, setIsRunning] = useState(false);
  const [trades, setTrades] = useState<Trade[]>([]);
  const [status, setStatus] = useState("");
  const [autoCopy, setAutoCopy] = useState(false);
  const [copyPercent, setCopyPercent] = useState(10);
  const eventSourceRef = useRef<EventSource | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const start = () => {
    if (!address || !/^0x[a-fA-F0-9]{40}$/.test(address)) {
      setStatus("Invalid address");
      return;
    }

    setIsRunning(true);
    setTrades([]);
    setStatus("Connecting...");

    const params = new URLSearchParams({
      user: address,
      interval: interval.toString(),
      autoCopy: autoCopy.toString(),
      copyPercent: copyPercent.toString(),
    });
    const es = new EventSource(`/api/follow?${params}`);
    eventSourceRef.current = es;

    es.onmessage = (e) => {
      const msg = JSON.parse(e.data);
      if (msg.type === "init") {
        setStatus(`Loaded ${msg.count} historical. Watching${autoCopy ? " + Auto-copy ON" : ""}...`);
      } else if (msg.type === "trade") {
        setTrades((prev) => [...prev, msg.data]);
      } else if (msg.type === "copy") {
        // Update the trade with copy status
        setTrades((prev) =>
          prev.map((t) =>
            t.tx === msg.tx ? { ...t, copyStatus: msg.status, copyError: msg.error } : t
          )
        );
      } else if (msg.type === "error") {
        setStatus(`Error: ${msg.message}`);
      }
    };

    es.onerror = () => {
      setStatus("Connection lost. Reconnecting...");
    };
  };

  const stop = () => {
    eventSourceRef.current?.close();
    eventSourceRef.current = null;
    setIsRunning(false);
    setStatus("Stopped");
  };

  useEffect(() => {
    return () => eventSourceRef.current?.close();
  }, []);

  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [trades]);

  const formatTime = (ts: number) => new Date(ts * 1000).toLocaleTimeString();

  return (
    <main className="min-h-screen bg-neutral-50 dark:bg-neutral-950 p-6">
      <div className="max-w-4xl mx-auto">
        <Link
          href="/polymarket"
          className="text-sm text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300 mb-2 block"
        >
          &larr; Back to Polymarket
        </Link>
        <h1 className="text-2xl font-bold text-neutral-900 dark:text-white mb-6">
          Follow Trader
        </h1>

        <div className="bg-white dark:bg-neutral-900 rounded-lg p-4 mb-4 shadow-sm">
          <div className="flex flex-col gap-3">
            <div className="flex flex-col sm:flex-row gap-3">
              <input
                type="text"
                placeholder="0x... wallet address"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                disabled={isRunning}
                className="flex-1 px-3 py-2 rounded-md border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white font-mono text-sm"
              />
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  value={interval}
                  onChange={(e) => setInterval(Number(e.target.value))}
                  disabled={isRunning}
                  min={500}
                  max={10000}
                  step={500}
                  className="w-20 px-3 py-2 rounded-md border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white text-sm"
                />
                <span className="text-sm text-neutral-500">ms</span>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center gap-3 pt-2 border-t border-neutral-200 dark:border-neutral-800">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={autoCopy}
                  onChange={(e) => setAutoCopy(e.target.checked)}
                  disabled={isRunning}
                  className="w-4 h-4 rounded border-neutral-300 dark:border-neutral-600 text-green-600 focus:ring-green-500"
                />
                <span className="text-sm font-medium text-neutral-900 dark:text-white">
                  Auto-copy trades
                </span>
              </label>

              {autoCopy && (
                <div className="flex items-center gap-2">
                  <span className="text-sm text-neutral-500">Scale:</span>
                  <input
                    type="number"
                    value={copyPercent}
                    onChange={(e) => setCopyPercent(Number(e.target.value))}
                    disabled={isRunning}
                    min={1}
                    max={1000}
                    className="w-20 px-3 py-2 rounded-md border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white text-sm"
                  />
                  <span className="text-sm text-neutral-500">%</span>
                  <span className="text-xs text-neutral-400 ml-2">
                    (їх $100 → твої ${(100 * copyPercent / 100).toFixed(0)})
                  </span>
                </div>
              )}

              <div className="sm:ml-auto">
                {!isRunning ? (
                  <button
                    onClick={start}
                    className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-md font-medium"
                  >
                    Start
                  </button>
                ) : (
                  <button
                    onClick={stop}
                    className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-md font-medium"
                  >
                    Stop
                  </button>
                )}
              </div>
            </div>
          </div>
          {status && (
            <p className="mt-2 text-sm text-neutral-500">{status}</p>
          )}
        </div>

        <div
          ref={containerRef}
          className="bg-neutral-900 rounded-lg p-4 h-[600px] overflow-y-auto font-mono text-sm"
        >
          {trades.length === 0 ? (
            <p className="text-neutral-500">Waiting for trades...</p>
          ) : (
            trades.map((t, i) => (
              <div key={i} className="mb-4 pb-4 border-b border-neutral-800">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-neutral-500">[{formatTime(t.timestamp)}]</span>
                  <span className={t.side === "BUY" ? "text-green-500" : "text-red-500"}>
                    {t.side}
                  </span>
                  <span className="text-white">{t.size.toFixed(2)} @ ${t.price.toFixed(4)}</span>
                  <span className="text-neutral-400">= ${t.total.toFixed(2)}</span>
                </div>
                <div className="text-neutral-300 mb-1">{t.title}</div>
                {t.outcome && (
                  <div className="text-neutral-400 text-xs mb-1">Outcome: {t.outcome}</div>
                )}
                {t.liquidity && t.liquidity.shares > 0 && (
                  <div className="text-cyan-400 mt-2">
                    📊 <span className="text-yellow-400">{t.liquidity.shares.toFixed(2)}</span> shares @ ≤${t.price.toFixed(2)}
                    <span className="text-neutral-500 ml-2">
                      (avg ${t.liquidity.avgPrice.toFixed(4)}, cost ${t.liquidity.cost.toFixed(2)})
                    </span>
                  </div>
                )}
                {t.copyStatus && (
                  <div className={`mt-2 text-sm ${
                    t.copyStatus === "success" ? "text-green-400" :
                    t.copyStatus === "failed" ? "text-red-400" :
                    t.copyStatus === "skipped" ? "text-yellow-400" :
                    "text-neutral-400"
                  }`}>
                    {t.copyStatus === "pending" && "⏳ Copying..."}
                    {t.copyStatus === "success" && "✅ Copied!"}
                    {t.copyStatus === "failed" && `❌ Failed: ${t.copyError}`}
                    {t.copyStatus === "skipped" && `⏭️ Skipped: ${t.copyError}`}
                  </div>
                )}
                <a
                  href={`https://polymarket.com/event/${t.slug}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-blue-400 hover:underline"
                >
                  View on Polymarket →
                </a>
              </div>
            ))
          )}
        </div>
      </div>
    </main>
  );
}
