import Image from "next/image";

type Token = {
  token_id: string;
  outcome: string;
  price: number;
  winner: boolean;
};

type Market = {
  condition_id: string;
  question: string;
  tokens: Token[];
  icon: string;
  end_date_iso: string;
  active: boolean;
  closed: boolean;
};

async function getMarkets(): Promise<Market[]> {
  const res = await fetch(
    "https://clob.polymarket.com/markets?active=true&closed=false&limit=50",
    { next: { revalidate: 30 } }
  );

  if (!res.ok) {
    throw new Error("Failed to fetch markets");
  }

  const json = await res.json();
  const markets = json.data as Market[];

  // Filter only markets with valid tokens
  return markets.filter((m) => m.tokens?.length >= 2);
}

function formatDate(dateString: string) {
  return new Date(dateString).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export default async function PolymarketPage() {
  const markets = await getMarkets();

  return (
    <main className="min-h-screen bg-neutral-50 dark:bg-neutral-950 p-6 md:p-12">
      <div className="max-w-7xl mx-auto">
        <header className="mb-12 text-center">
          <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight text-neutral-900 dark:text-white mb-4">
            Polymarket
          </h1>
          <p className="text-lg text-neutral-600 dark:text-neutral-400">
            Real-time odds on the world's most important events.
          </p>
        </header>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {markets.map((market, index) => {
            const [token1, token2] = market.tokens;

            return (
              <div
                key={market.condition_id || index}
                className="group relative flex flex-col bg-white dark:bg-neutral-900 rounded-2xl border border-neutral-200 dark:border-neutral-800 p-5 hover:shadow-xl hover:border-neutral-300 dark:hover:border-neutral-700 transition-all duration-300 ease-out"
              >
                <div className="flex items-start gap-4 mb-4">
                  {market.icon && (
                    <div className="relative w-12 h-12 flex-shrink-0 rounded-full overflow-hidden border border-neutral-100 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-800">
                      <Image
                        src={market.icon}
                        alt={market.question}
                        fill
                        className="object-cover"
                        sizes="48px"
                        unoptimized
                      />
                    </div>
                  )}
                  <h2 className="text-lg font-bold text-neutral-900 dark:text-neutral-100 leading-snug line-clamp-3 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                    {market.question}
                  </h2>
                </div>

                <div className="mt-auto space-y-4">
                  {/* Prices */}
                  <div className="flex gap-3">
                    <div className="flex-1 relative overflow-hidden rounded-lg bg-green-50 dark:bg-green-900/20 border border-green-100 dark:border-green-900/30 p-3 transition-colors group-hover:bg-green-100 dark:group-hover:bg-green-900/30">
                      <div className="text-xs font-semibold text-green-700 dark:text-green-400 uppercase tracking-wider mb-1 truncate">
                        {token1.outcome}
                      </div>
                      <div className="text-2xl font-bold text-green-800 dark:text-green-300">
                        {Math.round(token1.price * 100)}%
                      </div>
                    </div>
                    <div className="flex-1 relative overflow-hidden rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-900/30 p-3 transition-colors group-hover:bg-red-100 dark:group-hover:bg-red-900/30">
                      <div className="text-xs font-semibold text-red-700 dark:text-red-400 uppercase tracking-wider mb-1 truncate">
                        {token2.outcome}
                      </div>
                      <div className="text-2xl font-bold text-red-800 dark:text-red-300">
                        {Math.round(token2.price * 100)}%
                      </div>
                    </div>
                  </div>

                  {/* Metadata */}
                  <div className="flex items-center justify-end text-xs font-medium text-neutral-500 dark:text-neutral-500 pt-4 border-t border-neutral-100 dark:border-neutral-800">
                    <div>Ends {formatDate(market.end_date_iso)}</div>
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
