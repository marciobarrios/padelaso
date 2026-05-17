import { MobileShell } from "@/components/layout/mobile-shell";
import { requireGroupContext } from "@/lib/server-data";
import { GroupDataHydrator } from "@/lib/swr-hydration";
import { PlayersPageContent } from "@/app/_components/players-page-content";

export default async function PlayersPage() {
  const { activeGroup, data } = await requireGroupContext();

  return (
    <MobileShell>
      <GroupDataHydrator groupId={activeGroup.id} players={data.players}>
        <PlayersPageContent />
      </GroupDataHydrator>
    </MobileShell>
  );
}
