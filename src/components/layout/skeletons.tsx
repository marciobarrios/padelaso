import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent } from "@/components/ui/card";

function GroupSwitcherSkeleton() {
  return (
    <div className="flex items-center justify-center py-2 px-4">
      <Skeleton className="h-8 w-32 rounded-full" />
    </div>
  );
}

function NavSkeleton() {
  return (
    <nav className="fixed bottom-0 inset-x-0 z-50 border-t border-border bg-background pb-[env(safe-area-inset-bottom)]">
      <div className="flex items-center justify-around h-16 max-w-lg mx-auto">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="flex flex-col items-center gap-1 px-3 py-2">
            <Skeleton className="size-5 rounded" />
            <Skeleton className="h-3 w-8" />
          </div>
        ))}
      </div>
    </nav>
  );
}

export function MobileShellSkeleton() {
  return (
    <div className="flex flex-col min-h-dvh">
      <GroupSwitcherSkeleton />
      <main className="flex-1 overflow-y-auto pb-20">
        <HomePageSkeleton />
      </main>
      <NavSkeleton />
    </div>
  );
}

function MatchCardSkeleton() {
  return (
    <Card>
      <CardContent className="p-3 sm:p-4">
        <div className="flex items-center justify-between mb-3">
          <Skeleton className="h-3 w-28" />
          <Skeleton className="h-3 w-14" />
        </div>
        <div className="flex items-center">
          <div className="flex-1 space-y-2">
            <div className="flex items-center gap-1">
              <Skeleton className="size-7 rounded-full" />
              <Skeleton className="size-7 rounded-full" />
            </div>
            <Skeleton className="h-3.5 w-24" />
          </div>
          <Skeleton className="h-6 w-12" />
          <div className="flex-1 space-y-2 flex flex-col items-end">
            <div className="flex items-center gap-1">
              <Skeleton className="size-7 rounded-full" />
              <Skeleton className="size-7 rounded-full" />
            </div>
            <Skeleton className="h-3.5 w-24" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export function HomePageSkeleton() {
  return (
    <div className="max-w-lg mx-auto px-4 pt-6">
      <div className="flex items-center justify-between mb-6">
        <div className="space-y-2">
          <Skeleton className="h-7 w-32" />
          <Skeleton className="h-4 w-40" />
        </div>
      </div>
      <Skeleton className="w-full h-14 rounded-lg mb-8" />
      <div className="space-y-2 mb-3">
        <Skeleton className="h-3 w-20" />
      </div>
      <div className="space-y-6">
        {Array.from({ length: 3 }).map((_, i) => (
          <MatchCardSkeleton key={i} />
        ))}
      </div>
    </div>
  );
}

export function PlayerListSkeleton() {
  return (
    <div className="divide-y divide-border">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 px-4 py-3">
          <Skeleton className="size-9 rounded-full" />
          <Skeleton className="h-4 w-28" />
        </div>
      ))}
    </div>
  );
}

export function StatsPageSkeleton() {
  return (
    <div className="max-w-lg mx-auto px-4 py-6 space-y-4">
      <Skeleton className="h-10 w-full rounded-lg" />
      <div className="grid grid-cols-2 gap-3">
        {Array.from({ length: 2 }).map((_, i) => (
          <Card key={i}>
            <CardContent className="p-4 flex flex-col items-center gap-1">
              <Skeleton className="h-8 w-10" />
              <Skeleton className="h-3 w-16" />
            </CardContent>
          </Card>
        ))}
      </div>
      <div className="space-y-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3">
            <Skeleton className="size-8 rounded-full" />
            <Skeleton className="h-4 w-24 flex-1" />
            <Skeleton className="h-4 w-12" />
          </div>
        ))}
      </div>
    </div>
  );
}
