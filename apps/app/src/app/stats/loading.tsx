import {
  MobileShellSkeleton,
  PageHeaderShell,
  StatsPageSkeleton,
} from "@/components/layout/skeletons";

export default function Loading() {
  return (
    <MobileShellSkeleton>
      <PageHeaderShell title="Stats" />
      <StatsPageSkeleton />
    </MobileShellSkeleton>
  );
}
