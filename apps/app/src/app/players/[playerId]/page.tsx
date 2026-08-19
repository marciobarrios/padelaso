import { PlayerProfileContent } from "./content";

export default async function PlayerProfilePage({
  params,
}: {
  params: Promise<{ playerId: string }>;
}) {
  const { playerId } = await params;
  return <PlayerProfileContent playerId={playerId} />;
}
