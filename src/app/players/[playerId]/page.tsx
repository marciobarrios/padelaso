"use client";

import { use, useState } from "react";
import { useRouter } from "next/navigation";
import { MobileShell } from "@/components/layout/mobile-shell";
import { PageHeader } from "@/components/layout/page-header";
import { PlayerAvatar } from "@/components/players/player-avatar";
import { EditPlayerDialog } from "@/components/players/edit-player-dialog";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Pencil, Trash2 } from "lucide-react";
import { db } from "@/lib/db";
import { useLiveQuery } from "dexie-react-hooks";
import { getEventConfig } from "@/lib/event-config";
import { MatchEventType } from "@/lib/types";
import { calculatePlayerStats, getPartnerStats } from "@/lib/stats";
import { buildPlayerMap } from "@/lib/utils";

export default function PlayerProfilePage({
  params,
}: {
  params: Promise<{ playerId: string }>;
}) {
  const { playerId } = use(params);
  const router = useRouter();
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const player = useLiveQuery(() => db.players.get(playerId), [playerId]);
  const matches = useLiveQuery(
    () =>
      db.matches
        .filter(
          (m) => m.team1.includes(playerId) || m.team2.includes(playerId)
        )
        .toArray(),
    [playerId]
  );
  const events = useLiveQuery(
    () => db.matchEvents.where("playerId").equals(playerId).toArray(),
    [playerId]
  );
  const allPlayers = useLiveQuery(() => db.players.toArray());

  async function handleDelete() {
    await db.transaction("rw", db.players, db.matchEvents, async () => {
      await db.matchEvents.where("playerId").equals(playerId).delete();
      await db.players.delete(playerId);
    });
    router.replace("/players");
  }

  if (!player) {
    return (
      <MobileShell>
        <PageHeader title="Jugador" back />
        <p className="text-center py-12 text-muted-foreground">
          Jugador no encontrado
        </p>
      </MobileShell>
    );
  }

  const playerMatches = matches ?? [];
  const playerEvents = events ?? [];
  const players = allPlayers ?? [];
  const playerMap = buildPlayerMap(players);

  const stats = calculatePlayerStats(playerId, playerMatches);
  const partners = getPartnerStats(playerId, playerMatches);
  const topPartner = partners[0];

  const eventCounts = new Map<MatchEventType, number>();
  for (const e of playerEvents) {
    eventCounts.set(e.type, (eventCounts.get(e.type) ?? 0) + 1);
  }
  const sortedEvents = [...eventCounts.entries()].sort((a, b) => b[1] - a[1]);

  return (
    <MobileShell>
      <PageHeader
        title={player.name}
        back
        action={
          <div className="flex gap-1">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setEditOpen(true)}
            >
              <Pencil className="size-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setDeleteOpen(true)}
            >
              <Trash2 className="size-4 text-destructive" />
            </Button>
          </div>
        }
      />
      <div className="max-w-lg mx-auto px-4 py-6 space-y-6">
        {/* Avatar and name */}
        <div className="flex flex-col items-center gap-2">
          <PlayerAvatar emoji={player.emoji} size="lg" />
          <h2 className="text-xl font-bold">{player.name}</h2>
        </div>

        {/* Win/loss stats */}
        <div className="grid grid-cols-3 gap-3">
          <Card>
            <CardContent className="p-4 text-center">
              <p className="text-2xl font-heading font-bold">{playerMatches.length}</p>
              <p className="text-xs text-muted-foreground">Partidos</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <p className="text-2xl font-heading font-bold text-primary">{stats.wins}</p>
              <p className="text-xs text-muted-foreground">Victorias</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <p className="text-2xl font-heading font-bold">{stats.losses}</p>
              <p className="text-xs text-muted-foreground">Derrotas</p>
            </CardContent>
          </Card>
        </div>

        {/* Win rate */}
        {playerMatches.length > 0 && (
          <Card>
            <CardContent className="p-4 flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Win rate</span>
              <span className="text-lg font-heading font-bold">
                {Math.round(stats.winRate * 100)}%
              </span>
            </CardContent>
          </Card>
        )}

        {/* Top partner */}
        {topPartner && (
          <Card>
            <CardContent className="p-4 flex items-center justify-between">
              <span className="text-sm text-muted-foreground">
                Pareja favorita
              </span>
              <div className="flex items-center gap-2">
                <PlayerAvatar
                  emoji={playerMap.get(topPartner.partnerId)?.emoji ?? "❓"}
                  size="sm"
                />
                <span className="font-medium">
                  {playerMap.get(topPartner.partnerId)?.name ?? "?"}
                </span>
                <Badge variant="secondary">{topPartner.matches}x</Badge>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Events breakdown */}
        {sortedEvents.length > 0 && (
          <div>
            <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-3">
              Eventos
            </h3>
            <div className="grid grid-cols-2 gap-2">
              {sortedEvents.map(([type, count]) => {
                const config = getEventConfig(type);
                return (
                  <Card key={type}>
                    <CardContent className="p-3 flex items-center gap-2">
                      <span className="text-xl">{config.emoji}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm truncate">{config.label}</p>
                      </div>
                      <Badge variant="secondary">{count}</Badge>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </div>
        )}
      </div>

      <EditPlayerDialog
        player={player}
        open={editOpen}
        onOpenChange={setEditOpen}
      />
      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title="Eliminar jugador"
        description={`¿Seguro que quieres eliminar a ${player.name}? Se borrarán sus eventos. Los partidos en los que participó se mantendrán.`}
        onConfirm={handleDelete}
      />
    </MobileShell>
  );
}
