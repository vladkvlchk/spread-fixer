"use client";

import { useEffect, useState } from "react";

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

export default function Page() {
  const [ticker, setTicker] = useState<BookTickerMsg["data"] | null>(null);
  const [status, setStatus] = useState("connecting");

  useEffect(() => {
    const ws = new WebSocket("wss://ws.backpack.exchange");

    ws.onopen = () => {
      setStatus("connected");
      ws.send(
        JSON.stringify({
          method: "SUBSCRIBE",
          params: ["bookTicker.ETH_USDC"],
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
  }, []);

  return (
    <main style={{ padding: 24, fontFamily: "sans-serif" }}>
      <h1>Backpack Live BookTicker</h1>
      <p>Status: {status}</p>

      {!ticker && <p>Waiting for first update…</p>}

      {ticker && (
        <div
          style={{
            marginTop: 20,
            padding: 16,
            border: "1px solid #ccc",
            width: 300,
          }}
        >
          <h2>{ticker.s}</h2>
          <p>Best Bid: {ticker.b}</p>
          <p>Best Ask: {ticker.a}</p>

          <p style={{ opacity: 0.6, fontSize: 12 }}>
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
