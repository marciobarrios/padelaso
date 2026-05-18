import {
  MobileShellSkeleton,
  PlayerListSkeleton,
} from "@/components/layout/skeletons";
import { PageHeader } from "@/components/layout/page-header";

export default function Loading() {
  return (
    <MobileShellSkeleton>
      <PageHeader title="Jugadores" />
      <div className="max-w-lg mx-auto">
        <PlayerListSkeleton />
      </div>
    </MobileShellSkeleton>
  );
}
