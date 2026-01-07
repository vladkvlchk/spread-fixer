import Link from "next/link";
import { Suspense } from "react";
import { SearchInput } from "./search";
import { MarketsGrid } from "./markets-grid";
import { Filters } from "./filters";

type Props = {
  searchParams: Promise<{ q?: string; order?: string; tag_slug?: string; strategy?: string }>;
};

export default async function PolymarketPage({ searchParams }: Props) {
  const { q, order, tag_slug, strategy } = await searchParams;

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

          <Suspense fallback={null}>
            <Filters />
          </Suspense>
        </header>

        <MarketsGrid query={q} order={order} tagSlug={tag_slug} strategy={strategy} />
      </div>
    </main>
  );
}
