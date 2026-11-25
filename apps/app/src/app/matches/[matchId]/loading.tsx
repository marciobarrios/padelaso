import { MatchDetailSkeleton } from "@/components/match/match-detail-skeleton";

// Without this, the route inherits /matches/loading.tsx (the "Partidos" list
// skeleton), which looks nothing like a match.
export default function Loading() {
  return <MatchDetailSkeleton />;
}
