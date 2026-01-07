import { MarketDetail } from "./market-detail";

type Props = {
  params: Promise<{ id: string }>;
};

export default async function MarketPage({ params }: Props) {
  const { id } = await params;

  return (
    <main className="min-h-screen bg-neutral-50 dark:bg-neutral-950 p-6 md:p-12">
      <div className="max-w-4xl mx-auto">
        <MarketDetail id={id} />
      </div>
    </main>
  );
}
