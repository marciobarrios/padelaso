import {
  MatchesListSkeleton,
  MobileShellSkeleton,
  PageHeaderShell,
} from "@/components/layout/skeletons";

export default function Loading() {
  return (
    <MobileShellSkeleton>
      <PageHeaderShell title="Partidos" />
      <MatchesListSkeleton />
    </MobileShellSkeleton>
  );
}
