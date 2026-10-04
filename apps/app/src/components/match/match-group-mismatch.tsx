"use client";

import { MobileShell } from "@/components/layout/mobile-shell";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { useGroup } from "@/components/group/group-provider";

export function MatchGroupMismatch({
  groupId,
  title = "Partido",
}: {
  groupId: string;
  title?: string;
}) {
  const { groups, setActiveGroupId } = useGroup();
  const matchGroup = groups.find((group) => group.id === groupId);

  return (
    <MobileShell>
      <PageHeader title={title} back />
      <div className="mx-auto flex max-w-lg flex-col items-center gap-4 px-4 py-12 text-center">
        <p className="text-muted-foreground">
          Este partido pertenece a otro grupo.
        </p>
        {matchGroup && (
          <Button onClick={() => setActiveGroupId(matchGroup.id)}>
            Cambiar a {matchGroup.emoji} {matchGroup.name}
          </Button>
        )}
      </div>
    </MobileShell>
  );
}
