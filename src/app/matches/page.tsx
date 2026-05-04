import { MobileShell } from "@/components/layout/mobile-shell";
import { requireGroupContext } from "@/lib/server-data";
import { MatchesPageContent } from "@/app/_components/matches-page-content";

export default async function MatchesPage() {
  const { data } = await requireGroupContext();

  return (
    <MobileShell>
      <MatchesPageContent
        initialMatches={data.matches}
        initialPlayers={data.players}
      />
    </MobileShell>
  );
}
