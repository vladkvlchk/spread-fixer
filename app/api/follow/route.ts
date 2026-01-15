import { NextRequest } from "next/server";
import { executeCopyTrade } from "@/lib/polymarket-trading";

const DATA_API = "https://data-api.polymarket.com";
const CLOB_API = "https://clob.polymarket.com";

type Activity = {
  transactionHash: string;
  timestamp: number;
  type: string;
  title: string;
  outcome?: string;
  side?: "BUY" | "SELL";
  size: number;
  price: number;
  usdcSize: number;
  asset: string;
  slug: string;
};

type OrderBook = {
  bids: { price: string; size: string }[];
  asks: { price: string; size: string }[];
};

async function fetchActivity(user: string): Promise<Activity[]> {
  const res = await fetch(
    `${DATA_API}/activity?user=${user}&limit=50&sortBy=TIMESTAMP&sortDirection=DESC`
  );
  if (!res.ok) return [];
  return res.json();
}

async function fetchOrderBook(tokenId: string): Promise<OrderBook | null> {
  try {
    const res = await fetch(`${CLOB_API}/book?token_id=${tokenId}`);
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

function calcLiquidity(ob: OrderBook, side: "BUY" | "SELL", price: number) {
  const orders = side === "BUY" ? ob.asks : ob.bids;
  let shares = 0, cost = 0;
  for (const o of orders) {
    const p = parseFloat(o.price), s = parseFloat(o.size);
    if ((side === "BUY" && p <= price) || (side === "SELL" && p >= price)) {
      shares += s;
      cost += s * p;
    }
  }
  return { shares, avgPrice: shares > 0 ? cost / shares : 0, cost };
}

export async function GET(req: NextRequest) {
  const user = req.nextUrl.searchParams.get("user");
  const interval = parseInt(req.nextUrl.searchParams.get("interval") || "2000");
  const autoCopy = req.nextUrl.searchParams.get("autoCopy") === "true";
  const copyPercent = parseInt(req.nextUrl.searchParams.get("copyPercent") || "10");

  if (!user || !/^0x[a-fA-F0-9]{40}$/.test(user)) {
    return new Response("Invalid user address", { status: 400 });
  }

  const seen = new Set<string>();
  let stopped = false;

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: object) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      };

      // Initial load
      const initial = await fetchActivity(user);
      initial.forEach((a) => seen.add(a.transactionHash));
      send({ type: "init", count: initial.length });

      const poll = async () => {
        if (stopped) return;
        try {
          const activities = await fetchActivity(user);
          const newOnes = activities.filter((a) => !seen.has(a.transactionHash)).reverse();

          // First, send all trade info to UI
          for (const a of newOnes) {
            seen.add(a.transactionHash);

            let liquidity = null;
            if (a.type === "TRADE" && a.side && a.asset) {
              const ob = await fetchOrderBook(a.asset);
              if (ob) liquidity = calcLiquidity(ob, a.side, a.price);
            }

            send({
              type: "trade",
              data: {
                timestamp: a.timestamp,
                activityType: a.type,
                title: a.title,
                outcome: a.outcome,
                side: a.side,
                size: a.size,
                price: a.price,
                total: a.usdcSize,
                tx: a.transactionHash,
                slug: a.slug,
                asset: a.asset,
                liquidity,
              },
            });
          }

          // Auto-copy with aggregation
          if (autoCopy && newOnes.length > 0) {
            const trades = newOnes.filter((a) => a.type === "TRADE" && a.side && a.asset);

            // Group by asset+side
            const grouped = new Map<string, {
              asset: string;
              side: "BUY" | "SELL";
              totalSize: number;
              totalValue: number;
              txs: string[];
            }>();

            for (const t of trades) {
              const key = `${t.asset}-${t.side}`;
              const existing = grouped.get(key);
              if (existing) {
                existing.totalSize += t.size;
                existing.totalValue += t.usdcSize;
                existing.txs.push(t.transactionHash);
              } else {
                grouped.set(key, {
                  asset: t.asset,
                  side: t.side!,
                  totalSize: t.size,
                  totalValue: t.usdcSize,
                  txs: [t.transactionHash],
                });
              }
            }

            // Execute aggregated copy trades
            for (const [, group] of grouped) {
              const avgPrice = group.totalValue / group.totalSize;
              const scaledValue = group.totalValue * (copyPercent / 100);

              // Mark all related trades as pending
              for (const tx of group.txs) {
                send({ type: "copy", tx, status: "pending" });
              }

              if (scaledValue < 1) {
                // Too small even aggregated
                for (const tx of group.txs) {
                  send({
                    type: "copy",
                    tx,
                    status: "skipped",
                    error: `Aggregated $${scaledValue.toFixed(2)} < $1 min`,
                  });
                }
                continue;
              }

              const result = await executeCopyTrade({
                tokenId: group.asset,
                side: group.side,
                originalSize: group.totalSize,
                originalPrice: avgPrice,
                copyPercent,
              });

              // Update all related trades with the result
              for (const tx of group.txs) {
                if (result.success) {
                  send({
                    type: "copy",
                    tx,
                    status: "success",
                    orderId: result.orderId,
                    size: result.size,
                    price: result.price,
                  });
                } else {
                  send({
                    type: "copy",
                    tx,
                    status: result.error?.includes("too small") ? "skipped" : "failed",
                    error: result.error,
                  });
                }
              }
            }
          }
          // Heartbeat - confirm we're still polling
          send({ type: "heartbeat", time: Date.now() });
        } catch (e) {
          send({ type: "error", message: String(e) });
        }
        setTimeout(poll, interval);
      };

      poll();
    },
    cancel() {
      stopped = true;
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
