import { redirect } from "next/navigation";
import { MobileShell } from "@/components/layout/mobile-shell";
import { getServerAuth } from "@/lib/server-auth";
import { fetchGroupListData, getActiveGroupId } from "@/lib/server-data";
import { PlayersPageContent } from "@/app/_components/players-page-content";

export default async function PlayersPage() {
  const { user, groups } = await getServerAuth();
  if (!user) redirect("/login");
  if (groups.length === 0) redirect("/groups/onboarding");

  const activeGroupId = (await getActiveGroupId()) ?? groups[0].id;
  const activeGroup = groups.find((g) => g.id === activeGroupId) ?? groups[0];

  const { players } = await fetchGroupListData(activeGroup.id);

  return (
    <MobileShell>
      <PlayersPageContent initialPlayers={players} />
    </MobileShell>
  );
}
