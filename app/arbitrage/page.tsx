"use client";

import { useState } from "react";
import Link from "next/link";

type Platform = "polymarket" | "predictfun";

type MarketConfig = {
  id: string;
  title: string;
  polymarketTokenId: string;
  predictfunMarketId: string;
  outcomeName: string;
  enabled: boolean;
};

type ArbitrageOpportunity = {
  market: string;
  outcome: string;
  buyPrice: number;
  sellPrice: number;
  spreadPercent: number;
  maxSize: number;
  potentialProfit: number;
};

type PlatformStatus = {
  platform: Platform;
  configured: boolean;
  balance?: number;
};

const DEFAULT_MARKETS: MarketConfig[] = [
  // Add your markets here once you have the IDs
  // {
  //   id: "btc-15min",
  //   title: "BTC 15-min Up/Down",
  //   polymarketTokenId: "",
  //   predictfunMarketId: "",
  //   outcomeName: "Up",
  //   enabled: false,
  // },
];

export default function ArbitragePage() {
  const [isRunning, setIsRunning] = useState(false);
  const [markets, setMarkets] = useState<MarketConfig[]>(DEFAULT_MARKETS);
  const [opportunities, setOpportunities] = useState<ArbitrageOpportunity[]>([]);
  const [minSpread, setMinSpread] = useState(2.0);
  const [maxPosition, setMaxPosition] = useState(100);
  const [platformStatus, setPlatformStatus] = useState<PlatformStatus[]>([
    { platform: "polymarket", configured: false },
    { platform: "predictfun", configured: false },
  ]);
  const [logs, setLogs] = useState<string[]>([]);

  const addLog = (message: string) => {
    const timestamp = new Date().toLocaleTimeString();
    setLogs(prev => [...prev.slice(-99), `[${timestamp}] ${message}`]);
  };

  const checkPlatformStatus = async () => {
    // TODO: Call API to check platform configurations
    addLog("Checking platform status...");

    // Placeholder - update with actual API call
    setPlatformStatus([
      { platform: "polymarket", configured: true, balance: 100 },
      { platform: "predictfun", configured: false },
    ]);
  };

  const toggleMarket = (id: string) => {
    setMarkets(prev =>
      prev.map(m => (m.id === id ? { ...m, enabled: !m.enabled } : m))
    );
  };

  const startArbitrage = async () => {
    if (!platformStatus.every(p => p.configured)) {
      addLog("❌ Not all platforms configured!");
      return;
    }

    setIsRunning(true);
    addLog("🚀 Starting arbitrage monitor...");

    // TODO: Start SSE connection to backend for real-time monitoring
  };

  const stopArbitrage = () => {
    setIsRunning(false);
    addLog("⏹️ Stopped arbitrage monitor");
  };

  return (
    <main className="min-h-screen bg-neutral-50 dark:bg-neutral-950 p-6">
      <div className="max-w-6xl mx-auto">
        <Link
          href="/polymarket"
          className="text-sm text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300 mb-2 block"
        >
          &larr; Back to Polymarket
        </Link>

        <h1 className="text-2xl font-bold text-neutral-900 dark:text-white mb-6">
          Cross-Platform Arbitrage
        </h1>

        {/* Platform Status */}
        <div className="grid grid-cols-2 gap-4 mb-6">
          {platformStatus.map(p => (
            <div
              key={p.platform}
              className={`p-4 rounded-lg border ${
                p.configured
                  ? "bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800"
                  : "bg-neutral-100 dark:bg-neutral-800 border-neutral-200 dark:border-neutral-700"
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="font-medium text-neutral-900 dark:text-white capitalize">
                  {p.platform}
                </span>
                <span
                  className={`text-sm ${
                    p.configured ? "text-green-600 dark:text-green-400" : "text-neutral-500"
                  }`}
                >
                  {p.configured ? "✓ Connected" : "Not configured"}
                </span>
              </div>
              {p.balance !== undefined && (
                <div className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">
                  Balance: ${p.balance.toFixed(2)}
                </div>
              )}
            </div>
          ))}
        </div>

        <button
          onClick={checkPlatformStatus}
          className="mb-6 px-4 py-2 bg-neutral-200 dark:bg-neutral-700 hover:bg-neutral-300 dark:hover:bg-neutral-600 text-neutral-700 dark:text-neutral-200 rounded-md text-sm"
        >
          Refresh Status
        </button>

        {/* Configuration */}
        <div className="bg-white dark:bg-neutral-900 rounded-lg p-4 mb-6 shadow-sm">
          <h2 className="font-semibold text-neutral-900 dark:text-white mb-4">
            Configuration
          </h2>

          <div className="flex flex-wrap gap-4 mb-4">
            <div>
              <label className="block text-sm text-neutral-500 mb-1">
                Min Spread %
              </label>
              <input
                type="number"
                value={minSpread}
                onChange={e => setMinSpread(Number(e.target.value))}
                disabled={isRunning}
                min={0.5}
                max={20}
                step={0.5}
                className="w-24 px-3 py-2 rounded-md border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white"
              />
            </div>

            <div>
              <label className="block text-sm text-neutral-500 mb-1">
                Max Position $
              </label>
              <input
                type="number"
                value={maxPosition}
                onChange={e => setMaxPosition(Number(e.target.value))}
                disabled={isRunning}
                min={10}
                max={10000}
                step={10}
                className="w-24 px-3 py-2 rounded-md border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white"
              />
            </div>

            <div className="flex items-end">
              {!isRunning ? (
                <button
                  onClick={startArbitrage}
                  disabled={!platformStatus.every(p => p.configured)}
                  className="px-6 py-2 bg-green-600 hover:bg-green-700 disabled:bg-neutral-400 text-white rounded-md font-medium"
                >
                  Start
                </button>
              ) : (
                <button
                  onClick={stopArbitrage}
                  className="px-6 py-2 bg-red-600 hover:bg-red-700 text-white rounded-md font-medium"
                >
                  Stop
                </button>
              )}
            </div>
          </div>

          {/* Market Selection */}
          <div>
            <h3 className="text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-2">
              Markets to Monitor
            </h3>
            {markets.length === 0 ? (
              <p className="text-sm text-neutral-500">
                No markets configured. Add market IDs in the code.
              </p>
            ) : (
              <div className="space-y-2">
                {markets.map(m => (
                  <label
                    key={m.id}
                    className="flex items-center gap-2 cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={m.enabled}
                      onChange={() => toggleMarket(m.id)}
                      disabled={isRunning}
                      className="w-4 h-4 rounded"
                    />
                    <span className="text-sm text-neutral-700 dark:text-neutral-300">
                      {m.title} ({m.outcomeName})
                    </span>
                  </label>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Opportunities */}
        <div className="bg-white dark:bg-neutral-900 rounded-lg p-4 mb-6 shadow-sm">
          <h2 className="font-semibold text-neutral-900 dark:text-white mb-4">
            Live Opportunities
          </h2>

          {opportunities.length === 0 ? (
            <p className="text-neutral-500 text-sm">
              {isRunning ? "Scanning for opportunities..." : "Start monitoring to see opportunities"}
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-neutral-500 border-b border-neutral-200 dark:border-neutral-700">
                    <th className="pb-2">Market</th>
                    <th className="pb-2">Buy @</th>
                    <th className="pb-2">Sell @</th>
                    <th className="pb-2">Spread</th>
                    <th className="pb-2">Size</th>
                    <th className="pb-2">Profit</th>
                    <th className="pb-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {opportunities.map((opp, i) => (
                    <tr
                      key={i}
                      className="border-b border-neutral-100 dark:border-neutral-800"
                    >
                      <td className="py-2 text-neutral-900 dark:text-white">
                        {opp.market}
                        <span className="text-neutral-500 ml-1">({opp.outcome})</span>
                      </td>
                      <td className="py-2">${opp.buyPrice.toFixed(4)}</td>
                      <td className="py-2">${opp.sellPrice.toFixed(4)}</td>
                      <td className="py-2 text-green-600 dark:text-green-400">
                        +{opp.spreadPercent.toFixed(2)}%
                      </td>
                      <td className="py-2">{opp.maxSize.toFixed(0)}</td>
                      <td className="py-2 text-green-600 dark:text-green-400">
                        ${opp.potentialProfit.toFixed(2)}
                      </td>
                      <td className="py-2">
                        <button className="px-3 py-1 bg-green-600 hover:bg-green-700 text-white text-xs rounded">
                          Execute
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Logs */}
        <div className="bg-neutral-900 rounded-lg p-4 h-64 overflow-y-auto font-mono text-sm">
          {logs.length === 0 ? (
            <p className="text-neutral-500">Logs will appear here...</p>
          ) : (
            logs.map((log, i) => (
              <div key={i} className="text-neutral-300">
                {log}
              </div>
            ))
          )}
        </div>
      </div>
    </main>
  );
}
