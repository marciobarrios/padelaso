import { redirect } from "next/navigation";
import { MobileShell } from "@/components/layout/mobile-shell";
import { PageHeader } from "@/components/layout/page-header";

import { getServerAuth } from "@/lib/server-auth";
import { fetchGroupListData, getActiveGroupId } from "@/lib/server-data";
import { StatsPageContent } from "@/app/_components/stats-page-content";

export default async function StatsPage() {
  const { user, groups } = await getServerAuth();
  if (!user) redirect("/login");
  if (groups.length === 0) redirect("/groups/onboarding");

  const activeGroupId = (await getActiveGroupId()) ?? groups[0].id;
  const activeGroup = groups.find((g) => g.id === activeGroupId) ?? groups[0];

  const { matches, players, events, votes } = await fetchGroupListData(
    activeGroup.id
  );

  if (matches.length === 0) {
    return (
      <MobileShell>
        <PageHeader title="Stats" />
        <div className="flex-1 flex items-center justify-center px-4">
          <div className="text-center space-y-2 -mt-20">
            <p className="text-4xl">📊</p>
            <p className="text-muted-foreground">
              Juega partidos para ver estadísticas
            </p>
          </div>
        </div>
      </MobileShell>
    );
  }

  return (
    <MobileShell>
      <StatsPageContent
        initialMatches={matches}
        initialPlayers={players}
        initialEvents={events}
        initialVotes={votes}
      />
    </MobileShell>
  );
}
