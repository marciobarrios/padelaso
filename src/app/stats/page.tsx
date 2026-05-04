import { MobileShell } from "@/components/layout/mobile-shell";
import { PageHeader } from "@/components/layout/page-header";
import { requireGroupContext } from "@/lib/server-data";
import { StatsPageContent } from "@/app/_components/stats-page-content";

export default async function StatsPage() {
  const { data } = await requireGroupContext();

  if (data.matches.length === 0) {
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
        initialMatches={data.matches}
        initialPlayers={data.players}
        initialEvents={data.events}
        initialVotes={data.votes}
      />
    </MobileShell>
  );
}
