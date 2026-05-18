import {
  HomePageSkeleton,
  MobileShellSkeleton,
} from "@/components/layout/skeletons";
import { PageHeader } from "@/components/layout/page-header";

export default function Loading() {
  return (
    <MobileShellSkeleton>
      <PageHeader title="Partidos" />
      <HomePageSkeleton />
    </MobileShellSkeleton>
  );
}
