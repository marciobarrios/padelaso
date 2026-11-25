import { MatchDetailContent } from "./content";

// The page has no server data: the match loads client-side through SWR. An
// empty list makes the route static (rendered on first visit, then cached),
// so links prefetch it in full and the client router reuses it for 5 minutes
// instead of waiting on a server roundtrip behind the loading skeleton.
export function generateStaticParams() {
  return [];
}

export default async function MatchDetailPage({
  params,
}: {
  params: Promise<{ matchId: string }>;
}) {
  const { matchId } = await params;
  return <MatchDetailContent matchId={matchId} />;
}
