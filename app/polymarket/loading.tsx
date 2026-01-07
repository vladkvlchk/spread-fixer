import { Spinner } from "@/components/ui/spinner";

export default function Loading() {
  return (
    <main className="min-h-screen bg-neutral-50 dark:bg-neutral-950 p-6 md:p-12">
      <div className="max-w-7xl mx-auto">
        <div className="flex flex-col items-center justify-center py-24">
          <Spinner className="size-8 text-neutral-400" />
          <p className="mt-4 text-sm text-neutral-500">Loading markets...</p>
        </div>
      </div>
    </main>
  );
}
