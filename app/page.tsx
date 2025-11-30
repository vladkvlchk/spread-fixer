import Image from "next/image";

type Market = {
  id: string;
  question: string;
  outcomePrices: string; // JSON string "[\"0.12\", \"0.88\"]"
  outcomes: string; // JSON string "[\"Yes\", \"No\"]"
  image: string;
  volume: string;
  endDate: string;
  category: string;
};

async function getMarkets(): Promise<Market[]> {
  const res = await fetch("https://gamma-api.polymarket.com/markets", {
    next: { revalidate: 30 },
  });

  if (!res.ok) {
    throw new Error("Failed to fetch markets");
  }

  // The API returns an array of markets directly
  const data = await res.json();
  return data;
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
  });
}

export default async function Page() {
  const markets = await getMarkets();

  return (
    <main className="min-h-screen bg-neutral-50 dark:bg-neutral-950 p-6 md:p-12">
      <div className="max-w-7xl mx-auto">
        <header className="mb-12 text-center">
          <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight text-neutral-900 dark:text-white mb-4">
            Prediction Markets
          </h1>
          <p className="text-lg text-neutral-600 dark:text-neutral-400">
            Real-time odds on the world's most important events.
          </p>
        </header>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {markets.map((market) => {
            const prices = JSON.parse(market.outcomePrices) as string[];
            const outcomes = JSON.parse(market.outcomes) as string[];
            const yesIndex = outcomes.findIndex((o) => o === "Yes");
            const yesPrice = yesIndex !== -1 ? parseFloat(prices[yesIndex]) : 0;
            const noPrice = 1 - yesPrice;

            return (
              <div
                key={market.id}
                className="group relative flex flex-col bg-white dark:bg-neutral-900 rounded-2xl border border-neutral-200 dark:border-neutral-800 p-5 hover:shadow-xl hover:border-neutral-300 dark:hover:border-neutral-700 transition-all duration-300 ease-out"
              >
                <div className="flex items-start gap-4 mb-4">
                  <div className="relative w-12 h-12 flex-shrink-0 rounded-full overflow-hidden border border-neutral-100 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-800">
                    <Image
                      src={market.image}
                      alt={market.question}
                      fill
                      className="object-cover"
                      sizes="48px"
                      unoptimized
                    />
                  </div>
                  <h2 className="text-lg font-bold text-neutral-900 dark:text-neutral-100 leading-snug line-clamp-3 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                    {market.question}
                  </h2>
                </div>

                <div className="mt-auto space-y-4">
                  {/* Prices */}
                  <div className="flex gap-3">
                    <div className="flex-1 relative overflow-hidden rounded-lg bg-green-50 dark:bg-green-900/20 border border-green-100 dark:border-green-900/30 p-3 transition-colors group-hover:bg-green-100 dark:group-hover:bg-green-900/30">
                      <div className="text-xs font-semibold text-green-700 dark:text-green-400 uppercase tracking-wider mb-1">
                        Yes
                      </div>
                      <div className="text-2xl font-bold text-green-800 dark:text-green-300">
                        {Math.round(yesPrice * 100)}%
                      </div>
                    </div>
                    <div className="flex-1 relative overflow-hidden rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-900/30 p-3 transition-colors group-hover:bg-red-100 dark:group-hover:bg-red-900/30">
                      <div className="text-xs font-semibold text-red-700 dark:text-red-400 uppercase tracking-wider mb-1">
                        No
                      </div>
                      <div className="text-2xl font-bold text-red-800 dark:text-red-300">
                        {Math.round(noPrice * 100)}%
                      </div>
                    </div>
                  </div>

                  {/* Metadata */}
                  <div className="flex items-center justify-between text-xs font-medium text-neutral-500 dark:text-neutral-500 pt-4 border-t border-neutral-100 dark:border-neutral-800">
                    <div className="flex items-center gap-1">
                      <span>Vol: {formatCurrency(parseFloat(market.volume))}</span>
                    </div>
                    <div>Ends {formatDate(market.endDate)}</div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </main>
  );
}
