import { MatchDetailContent } from "./content";

export default async function MatchDetailPage({
  params,
}: {
  params: Promise<{ matchId: string }>;
}) {
  const { matchId } = await params;
  return <MatchDetailContent matchId={matchId} />;
}
