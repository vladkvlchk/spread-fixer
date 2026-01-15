"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";

// Quick select presets
const PRESETS = [
  {
    address: "0x818f214c7f3e479cce1d964d53fe3db7297558cb",
    name: "BTC 15min",
    comment: "деп ~$200k",
  },
  {
    address: "0x8278252ebbf354eca8ce316e680a0eaf02859464",
    name: "London C",
    comment: "деп ~$200k",
  },
  {
    address: "0x57ee70867b4e387de9de34fd62bc685aa02a8112",
    name: "Weather",
    comment: "купує надзвичайно дешеві shares, навряд ми зможем повторяти",
  },
  {
    address: "0x6031b6eed1c97e853c6e0f03ad3ce3529351f96d",
    name: "@gabagool22 (BTC, ETH)",
    comment: "",
  },
  // Add more presets here:
  // { address: "0x...", name: "...", comment: "..." },
];

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

type BalanceData = {
  totalValue: number;
  totalPnl: number;
  totalPnlPercent: number;
  positionCount: number;
  positions: {
    title: string;
    outcome: string;
    size: number;
    currentValue: number;
    cashPnl: number;
    percentPnl: number;
  }[];
};

export default function FollowPage() {
  const [address, setAddress] = useState("");
  const [interval, setInterval] = useState(1500);
  const [isRunning, setIsRunning] = useState(false);
  const [trades, setTrades] = useState<Trade[]>([]);
  const [status, setStatus] = useState("");
  const [autoCopy, setAutoCopy] = useState(false);
  const [copyPercent, setCopyPercent] = useState(10);
  const [lastHeartbeat, setLastHeartbeat] = useState<number | null>(null);
  const [balanceData, setBalanceData] = useState<BalanceData | null>(null);
  const [balanceLoading, setBalanceLoading] = useState(false);
  const [showBalance, setShowBalance] = useState(false);
  const eventSourceRef = useRef<EventSource | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const checkBalance = async () => {
    if (!address || !/^0x[a-fA-F0-9]{40}$/.test(address)) {
      return;
    }
    setBalanceLoading(true);
    try {
      const res = await fetch(`/api/follow/balance?user=${address}`);
      if (res.ok) {
        const data = await res.json();
        setBalanceData(data);
        setShowBalance(true);
      }
    } catch {
      // ignore
    } finally {
      setBalanceLoading(false);
    }
  };

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
      } else if (msg.type === "heartbeat") {
        setLastHeartbeat(msg.time);
      } else if (msg.type === "error") {
        setStatus(`Error: ${msg.message}`);
        setLastHeartbeat(null);
      }
    };

    es.onerror = () => {
      setStatus("Connection lost. Reconnecting...");
      setLastHeartbeat(null);
    };
  };

  const stop = () => {
    eventSourceRef.current?.close();
    eventSourceRef.current = null;
    setIsRunning(false);
    setStatus("Stopped");
    setLastHeartbeat(null);
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
            {/* Quick select */}
            <div className="flex flex-wrap gap-2">
              {PRESETS.map((p) => (
                <button
                  key={p.address}
                  onClick={() => {
                    setAddress(p.address);
                    setShowBalance(false);
                  }}
                  disabled={isRunning}
                  className={`px-3 py-1.5 text-sm rounded-md border transition-colors ${
                    address === p.address
                      ? "bg-blue-600 border-blue-600 text-white"
                      : "border-neutral-300 dark:border-neutral-700 text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800"
                  } disabled:opacity-50`}
                  title={p.comment}
                >
                  {p.name}
                </button>
              ))}
            </div>

            <div className="flex flex-col sm:flex-row gap-3">
              <input
                type="text"
                placeholder="0x... wallet address"
                value={address}
                onChange={(e) => {
                  setAddress(e.target.value);
                  setShowBalance(false);
                }}
                disabled={isRunning}
                className="flex-1 px-3 py-2 rounded-md border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white font-mono text-sm"
              />
              <button
                onClick={checkBalance}
                disabled={!address || balanceLoading}
                className="px-3 py-2 text-sm bg-neutral-200 dark:bg-neutral-700 hover:bg-neutral-300 dark:hover:bg-neutral-600 text-neutral-700 dark:text-neutral-200 rounded-md disabled:opacity-50"
              >
                {balanceLoading ? "..." : "Balance"}
              </button>
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

            {/* Balance display */}
            {showBalance && balanceData && (
              <div className="p-3 bg-neutral-100 dark:bg-neutral-800 rounded-md">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-4">
                    <span className="text-lg font-bold text-neutral-900 dark:text-white">
                      ${balanceData.totalValue.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                    </span>
                    <span className={`text-sm font-medium ${balanceData.totalPnl >= 0 ? "text-green-500" : "text-red-500"}`}>
                      {balanceData.totalPnl >= 0 ? "+" : ""}${balanceData.totalPnl.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                      {" "}({balanceData.totalPnlPercent >= 0 ? "+" : ""}{balanceData.totalPnlPercent.toFixed(1)}%)
                    </span>
                    <span className="text-xs text-neutral-500">
                      {balanceData.positionCount} positions
                    </span>
                  </div>
                  <button
                    onClick={() => setShowBalance(false)}
                    className="text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200"
                  >
                    ✕
                  </button>
                </div>
                <div className="space-y-1 max-h-40 overflow-y-auto text-xs">
                  {balanceData.positions.slice(0, 10).map((p, i) => (
                    <div key={i} className="flex items-center justify-between text-neutral-600 dark:text-neutral-400">
                      <span className="truncate flex-1 mr-2">{p.title} ({p.outcome})</span>
                      <span className="whitespace-nowrap">
                        ${p.currentValue.toFixed(0)}
                        <span className={`ml-2 ${p.cashPnl >= 0 ? "text-green-500" : "text-red-500"}`}>
                          {p.cashPnl >= 0 ? "+" : ""}{p.cashPnl.toFixed(0)}
                        </span>
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

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
          <div className="mt-2 flex items-center gap-2">
            {isRunning && (
              <span className={`flex items-center gap-1.5 text-sm ${lastHeartbeat ? "text-green-500" : "text-yellow-500"}`}>
                <span className={`w-2 h-2 rounded-full ${lastHeartbeat ? "bg-green-500 animate-pulse" : "bg-yellow-500"}`} />
                {lastHeartbeat ? "LIVE" : "Connecting..."}
              </span>
            )}
            {status && (
              <span className="text-sm text-neutral-500">{status}</span>
            )}
          </div>
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
