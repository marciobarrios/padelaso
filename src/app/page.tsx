import { MobileShell } from "@/components/layout/mobile-shell";
import { requireGroupContext } from "@/lib/server-data";
import { GroupDataHydrator } from "@/lib/swr-hydration";
import { HomePageContent } from "./_components/home-page-content";

export default async function HomePage() {
  const { activeGroup, data } = await requireGroupContext();

  return (
    <MobileShell>
      <GroupDataHydrator
        groupId={activeGroup.id}
        matches={data.matches}
        players={data.players}
      >
        <HomePageContent />
      </GroupDataHydrator>
    </MobileShell>
  );
}
