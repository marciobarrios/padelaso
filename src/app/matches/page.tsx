import { MobileShell } from "@/components/layout/mobile-shell";
import { requireGroupContext } from "@/lib/server-data";
import { GroupDataHydrator } from "@/lib/swr-hydration";
import { MatchesPageContent } from "@/app/_components/matches-page-content";

export default async function MatchesPage() {
  const { activeGroup, data } = await requireGroupContext();

  return (
    <MobileShell>
      <GroupDataHydrator
        groupId={activeGroup.id}
        matches={data.matches}
        players={data.players}
      >
        <MatchesPageContent />
      </GroupDataHydrator>
    </MobileShell>
  );
}
