import {
  MobileShellSkeleton,
  StatsPageSkeleton,
} from "@/components/layout/skeletons";
import { PageHeader } from "@/components/layout/page-header";

export default function Loading() {
  return (
    <MobileShellSkeleton>
      <PageHeader title="Stats" />
      <StatsPageSkeleton />
    </MobileShellSkeleton>
  );
}
