import { Skeleton } from "@/components/ui/skeleton";

export default function AppLoading() {
  return (
    <main className="flex-1 overflow-y-auto px-6 py-8 sm:px-8 sm:py-10 lg:px-10 lg:py-12">
      <div className="mx-auto w-full max-w-5xl">
        <Skeleton height={320} width="100%" className="rounded-2xl" />
      </div>
    </main>
  );
}
