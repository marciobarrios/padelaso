import { redirect } from "next/navigation";
import { MobileShell } from "@/components/layout/mobile-shell";
import { getServerAuth } from "@/lib/server-auth";
import { fetchGroupListData, getActiveGroupId } from "@/lib/server-data";
import { MatchesPageContent } from "@/app/_components/matches-page-content";

export default async function MatchesPage() {
  const { user, groups } = await getServerAuth();
  if (!user) redirect("/login");
  if (groups.length === 0) redirect("/groups/onboarding");

  const activeGroupId = (await getActiveGroupId()) ?? groups[0].id;
  const activeGroup = groups.find((g) => g.id === activeGroupId) ?? groups[0];

  const { matches, players } = await fetchGroupListData(activeGroup.id);

  return (
    <MobileShell>
      <MatchesPageContent initialMatches={matches} initialPlayers={players} />
    </MobileShell>
  );
}
