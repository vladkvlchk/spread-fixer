import Link from "next/link";
import { Suspense } from "react";
import { SearchInput } from "./search";
import { MarketsGrid } from "./markets-grid";

type Props = {
  searchParams: Promise<{ page?: string; q?: string }>;
};

export default async function PolymarketPage({ searchParams }: Props) {
  const { page, q } = await searchParams;
  const currentPage = Math.max(1, parseInt(page || "1", 10));

  return (
    <main className="min-h-screen bg-neutral-50 dark:bg-neutral-950 p-6 md:p-12">
      <div className="max-w-7xl mx-auto">
        <header className="mb-8">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
            <div>
              <Link
                href="/"
                className="text-sm text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300 mb-1 block"
              >
                &larr; Back
              </Link>
              <h1 className="text-3xl font-bold text-neutral-900 dark:text-white">
                Polymarket
              </h1>
            </div>
            <div className="w-full sm:w-72">
              <Suspense fallback={null}>
                <SearchInput />
              </Suspense>
            </div>
          </div>
        </header>

        <MarketsGrid query={q} page={currentPage} />
      </div>
    </main>
  );
}
