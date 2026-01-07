import Link from "next/link";

export default function HomePage() {
  return (
    <main className="min-h-screen bg-neutral-50 dark:bg-neutral-950 p-6 md:p-12">
      <div className="max-w-2xl mx-auto">
        <header className="mb-12 text-center">
          <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight text-neutral-900 dark:text-white mb-4">
            Spread Fixer
          </h1>
          <p className="text-lg text-neutral-600 dark:text-neutral-400">
            Market data aggregator
          </p>
        </header>

        <div className="grid gap-4">
          <Link
            href="/backpack"
            className="block p-6 bg-white dark:bg-neutral-900 rounded-2xl border border-neutral-200 dark:border-neutral-800 hover:border-neutral-300 dark:hover:border-neutral-700 hover:shadow-lg transition-all"
          >
            <h2 className="text-xl font-bold text-neutral-900 dark:text-white mb-2">
              Backpack
            </h2>
            <p className="text-neutral-600 dark:text-neutral-400">
              Crypto exchange market data
            </p>
          </Link>

          <Link
            href="/polymarket"
            className="block p-6 bg-white dark:bg-neutral-900 rounded-2xl border border-neutral-200 dark:border-neutral-800 hover:border-neutral-300 dark:hover:border-neutral-700 hover:shadow-lg transition-all"
          >
            <h2 className="text-xl font-bold text-neutral-900 dark:text-white mb-2">
              Polymarket
            </h2>
            <p className="text-neutral-600 dark:text-neutral-400">
              Prediction markets odds
            </p>
          </Link>
        </div>
      </div>
    </main>
  );
}
