import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import { PriceChart } from "./price-chart";

type Market = {
  id: string;
  question: string;
  description: string;
  conditionId: string;
  slug: string;
  endDate: string;
  image: string;
  icon: string;
  outcomes: string;
  outcomePrices: string;
  volume: string;
  volume24hr: number;
  liquidity: string;
  bestBid: number;
  bestAsk: number;
  spread: number;
  clobTokenIds: string;
};

type OrderBookEntry = {
  price: string;
  size: string;
};

type OrderBook = {
  bids: OrderBookEntry[];
  asks: OrderBookEntry[];
};

const GAMMA_HOST = "https://gamma-api.polymarket.com";
const CLOB_HOST = "https://clob.polymarket.com";

async function getMarket(id: string): Promise<Market | null> {
  const res = await fetch(`${GAMMA_HOST}/markets/${id}`, {
    next: { revalidate: 30 },
  });

  if (!res.ok) return null;
  return res.json();
}

async function getOrderBook(tokenId: string): Promise<OrderBook | null> {
  const res = await fetch(`${CLOB_HOST}/book?token_id=${tokenId}`, {
    next: { revalidate: 5 },
  });

  if (!res.ok) return null;
  return res.json();
}

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

type Props = {
  params: Promise<{ id: string }>;
};

export default async function MarketPage({ params }: Props) {
  const { id } = await params;
  const market = await getMarket(id);

  if (!market) notFound();

  const outcomes = JSON.parse(market.outcomes) as string[];
  const prices = JSON.parse(market.outcomePrices) as string[];
  const tokenIds = JSON.parse(market.clobTokenIds || "[]") as string[];
  const img = market.image || market.icon;

  // Get orderbook for first token (Yes)
  const orderBook = tokenIds[0] ? await getOrderBook(tokenIds[0]) : null;

  return (
    <main className="min-h-screen bg-neutral-50 dark:bg-neutral-950 p-6 md:p-12">
      <div className="max-w-4xl mx-auto">
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
          <div className="mb-6">
            <PriceChart tokenId={tokenIds[0]} outcome={outcomes[0]} />
          </div>
        )}

        {/* Order Book */}
        {orderBook && (
          <div className="bg-white dark:bg-neutral-900 rounded-2xl border border-neutral-200 dark:border-neutral-800 p-6">
            <h2 className="text-lg font-bold text-neutral-900 dark:text-white mb-4">
              Order Book ({outcomes[0]})
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
                    <div
                      key={i}
                      className="grid grid-cols-2 text-sm py-1 relative"
                    >
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
                    <div
                      key={i}
                      className="grid grid-cols-2 text-sm py-1 relative"
                    >
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
      </div>
    </main>
  );
}
