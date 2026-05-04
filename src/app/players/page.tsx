import { MobileShell } from "@/components/layout/mobile-shell";
import { requireGroupContext } from "@/lib/server-data";
import { PlayersPageContent } from "@/app/_components/players-page-content";

export default async function PlayersPage() {
  const { data } = await requireGroupContext();

  return (
    <MobileShell>
      <PlayersPageContent initialPlayers={data.players} />
    </MobileShell>
  );
}
