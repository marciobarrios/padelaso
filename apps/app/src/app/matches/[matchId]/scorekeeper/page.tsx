import { ScorekeeperContent } from "./content";

export default async function ScorekeeperPage({
  params,
  searchParams,
}: {
  params: Promise<{ matchId: string }>;
  searchParams: Promise<{ pinned?: string }>;
}) {
  const { matchId } = await params;
  const { pinned } = await searchParams;
  return <ScorekeeperContent matchId={matchId} pinned={pinned === "1"} />;
}
