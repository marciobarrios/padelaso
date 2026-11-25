import { MobileShell } from "@/components/layout/mobile-shell";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

// Mirrors MatchDetailContent box for box (same shell, header, paddings and
// element sizes), so the swap to real content doesn't shift anything.
function TeamSkeleton({ align }: { align: "start" | "end" }) {
  const justify = align === "end" ? "justify-end" : "";
  return (
    <div className="flex-1 space-y-2">
      <div className={`flex items-center gap-2 ${justify}`}>
        <Skeleton className="size-10 rounded-full" />
        <Skeleton className="size-10 rounded-full" />
      </div>
      <div className={`flex h-5 items-center ${justify}`}>
        <Skeleton className="h-3.5 w-28" />
      </div>
    </div>
  );
}

export function MatchDetailSkeleton() {
  return (
    <MobileShell>
      <PageHeader
        back
        title={<Skeleton className="h-5 w-48" />}
        action={
          <div className="flex gap-1">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="flex size-9 items-center justify-center">
                <Skeleton className="size-4 rounded" />
              </div>
            ))}
          </div>
        }
      />
      <div className="max-w-lg mx-auto px-4 py-6 space-y-6" aria-busy="true">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <TeamSkeleton align="start" />
              <div className="px-4">
                <Skeleton className="h-8 w-14" />
              </div>
              <TeamSkeleton align="end" />
            </div>
            <div className="mt-4 flex h-5 items-center justify-center">
              <Skeleton className="h-3.5 w-32" />
            </div>
          </CardContent>
        </Card>

        <div className="space-y-4">
          <div className="flex h-7 items-center gap-2 mb-3">
            <Skeleton className="size-5 rounded" />
            <Skeleton className="h-3.5 w-24" />
          </div>
        </div>

        <div>
          <div className="flex h-8 items-center justify-between mb-3">
            <Skeleton className="h-3.5 w-44" />
            <Skeleton className="h-3.5 w-16" />
          </div>
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full rounded-lg" />
            ))}
          </div>
        </div>
      </div>
    </MobileShell>
  );
}
