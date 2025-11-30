"use client";

import { useEffect, useState } from "react";
import Link from 'next/link';

type BookTickerMsg = {
  stream: string;
  data: {
    e: "bookTicker";
    s: string;
    b: string; // bid price
    B: string; // bid quantity
    a: string; // ask price
    A: string; // ask quantity
    T: number; // event timestamp (µs)
    E: number; // engine timestamp (µs)
  };
};

export default function Page({
  params,
}: {
  params: Promise<{ TICKER: string }>
}) {
  const [ticker, setTicker] = useState<BookTickerMsg["data"] | null>(null);
  const [status, setStatus] = useState("connecting");
  const [tickerSymbol, setTickerSymbol] = useState<string>("");

  // Unwrap the params promise
  useEffect(() => {
    params.then(({ TICKER }) => {
      setTickerSymbol(TICKER);
    });
  }, [params]);

  useEffect(() => {
    if (!tickerSymbol) return;

    const ws = new WebSocket("wss://ws.backpack.exchange");

    ws.onopen = () => {
      setStatus("connected");
      ws.send(
        JSON.stringify({
          method: "SUBSCRIBE",
          params: [`bookTicker.${tickerSymbol}`],
          id: 1,
        })
      );
    };

    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);

      // Skip subscription ACKs
      if (msg?.result !== undefined || msg?.id !== undefined) return;

      // Backpack WS wraps in { stream, data }
      if (msg?.data?.e === "bookTicker") {
        setTicker(msg.data);
      }
    };

    ws.onerror = () => setStatus("error");
    ws.onclose = () => setStatus("closed");

    return () => ws.close();
  }, [tickerSymbol]);

  return (
    <main className="min-h-screen bg-neutral-50 dark:bg-neutral-950 p-6 md:p-12">
      <h1>Backpack Live BookTicker</h1>
      <Link href="/backpack" className="text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 transition-colors">
        <button className="mt-4 px-4 py-2 border border-neutral-200 dark:border-neutral-800 rounded-lg hover:bg-neutral-100 dark:hover:bg-neutral-800/20 transition-colors">Back</button>
      </Link>
      <p>Status: {status}</p>

      {!ticker && <p>Waiting for first update…</p>}

      {ticker && (
        <div
          className="mt-4 p-4 border border-neutral-200 dark:border-neutral-800 rounded-lg bg-neutral-50 dark:bg-neutral-900"
        >
          <h2>{ticker.s}</h2>
          <p>Best Bid: {ticker.b}</p>
          <p>Best Ask: {ticker.a}</p>

          <p className="text-sm text-neutral-500 dark:text-neutral-400">
            Updated:{" "}
            {new Date(ticker.T / 1000).toLocaleTimeString()} (event)
            <br />
            Engine: {new Date(ticker.E / 1000).toLocaleTimeString()}
          </p>
        </div>
      )}
    </main>
  );
}
