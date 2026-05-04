import { MobileShell } from "@/components/layout/mobile-shell";
import { requireGroupContext } from "@/lib/server-data";
import { HomePageContent } from "./_components/home-page-content";

export default async function HomePage() {
  const { data } = await requireGroupContext();

  return (
    <MobileShell>
      <HomePageContent
        initialMatches={data.matches}
        initialPlayers={data.players}
      />
    </MobileShell>
  );
}
