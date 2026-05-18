import {
  MobileShellSkeleton,
  PageHeaderShell,
  PlayerListSkeleton,
} from "@/components/layout/skeletons";

export default function Loading() {
  return (
    <MobileShellSkeleton>
      <PageHeaderShell title="Jugadores" />
      <div className="max-w-lg mx-auto">
        <PlayerListSkeleton />
      </div>
    </MobileShellSkeleton>
  );
}
