"use client";

import { use, useState } from "react";
import { useRouter } from "next/navigation";
import { MobileShell } from "@/components/layout/mobile-shell";
import { PageHeader } from "@/components/layout/page-header";
import { PlayerAvatar } from "@/components/players/player-avatar";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { EventFeed } from "@/components/events/event-feed";
import { EventGrid } from "@/components/events/event-grid";
import { PlayerEventPicker } from "@/components/events/player-event-picker";
import { EditMatchDialog } from "@/components/match/edit-match-dialog";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { useMatch, useMatchEvents, usePlayers, useDataRefresh } from "@/lib/db-hooks";
import { useGroup } from "@/components/group/group-provider";
import { addMatchEvent, removeMatchEvent, deleteMatch } from "@/lib/supabase-mutations";
import { useAuth } from "@/components/auth/auth-provider";
import { MatchEventType, MatchEventId } from "@/lib/types";
import { buildPlayerMap, getSetWins } from "@/lib/utils";

export default function MatchDetailPage({
  params,
}: {
  params: Promise<{ matchId: string }>;
}) {
  const { matchId } = use(params);
  const router = useRouter();
  const { user } = useAuth();
  const { activeGroup } = useGroup();
  const { refresh } = useDataRefresh();
  const match = useMatch(matchId);
  const events = useMatchEvents(matchId);
  const { players } = usePlayers(activeGroup?.id);
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [addingEvents, setAddingEvents] = useState(false);
  const [pickerEventType, setPickerEventType] = useState<MatchEventType | null>(null);

  async function handleAddEvent(playerId: string) {
    if (!pickerEventType || !user) return;
    await addMatchEvent(matchId, playerId, pickerEventType, user.id);
    refresh();
    setPickerEventType(null);
  }

  async function handleRemoveEvent(eventId: MatchEventId) {
    await removeMatchEvent(eventId);
    refresh();
  }

  async function handleDelete() {
    await deleteMatch(matchId);
    refresh();
    router.replace("/");
  }

  if (!match) {
    return (
      <MobileShell>
        <PageHeader title="Partido" back />
        <p className="text-center py-12 text-muted-foreground">
          Partido no encontrado
        </p>
      </MobileShell>
    );
  }

  const playerMap = buildPlayerMap(players);
  const team1Players = match.team1.map((id) => playerMap.get(id));
  const team2Players = match.team2.map((id) => playerMap.get(id));
  const { team1Wins, team2Wins } = getSetWins(match.sets);

  return (
    <MobileShell>
      <PageHeader
        title={new Date(match.date).toLocaleDateString("es-ES", {
          weekday: "long",
          day: "numeric",
          month: "long",
        })}
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
        {/* Score */}
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              {/* Team 1 */}
              <div className="flex-1 space-y-2">
                <div className="flex items-center gap-2">
                  {team1Players.map(
                    (p, i) =>
                      p && (
                        <PlayerAvatar
                          key={i}
                          emoji={p.emoji}
                          name={p.name}
                          size="md"
                        />
                      )
                  )}
                </div>
                <div className="text-sm">
                  {team1Players.map((p) => p?.name ?? "?").join(" · ")}
                </div>
              </div>

              {/* Score */}
              <div className="px-4 text-center">
                {match.sets.map((set, i) => (
                  <div
                    key={i}
                    className="flex items-center gap-2 text-2xl font-heading font-bold tabular-nums"
                  >
                    <span
                      className={
                        set.team1Score > set.team2Score
                          ? "text-primary"
                          : "text-muted-foreground"
                      }
                    >
                      {set.team1Score}
                    </span>
                    <span className="text-muted-foreground text-base">-</span>
                    <span
                      className={
                        set.team2Score > set.team1Score
                          ? "text-primary"
                          : "text-muted-foreground"
                      }
                    >
                      {set.team2Score}
                    </span>
                  </div>
                ))}
              </div>

              {/* Team 2 */}
              <div className="flex-1 space-y-2 items-end text-right">
                <div className="flex items-center gap-2 justify-end">
                  {team2Players.map(
                    (p, i) =>
                      p && (
                        <PlayerAvatar
                          key={i}
                          emoji={p.emoji}
                          name={p.name}
                          size="md"
                        />
                      )
                  )}
                </div>
                <div className="text-sm">
                  {team2Players.map((p) => p?.name ?? "?").join(" · ")}
                </div>
              </div>
            </div>

            {/* Winner badge */}
            {team1Wins !== team2Wins && (
              <div className="text-center mt-4">
                <span className="text-sm text-primary font-medium">
                  🏆{" "}
                  {team1Wins > team2Wins
                    ? team1Players.map((p) => p?.name).join(" y ")
                    : team2Players.map((p) => p?.name).join(" y ")}
                </span>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Events */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
              Eventos del partido
            </h3>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setAddingEvents(!addingEvents)}
            >
              {addingEvents ? (
                "Listo"
              ) : (
                <>
                  <Plus className="size-4 mr-1" />
                  Añadir
                </>
              )}
            </Button>
          </div>

          {addingEvents && (
            <div className="mb-4">
              <EventGrid
                counts={new Map(
                  events.reduce((acc, e) => {
                    acc.set(e.type, (acc.get(e.type) ?? 0) + 1);
                    return acc;
                  }, new Map<MatchEventType, number>())
                )}
                onSelect={(type) => setPickerEventType(type)}
              />
              <PlayerEventPicker
                open={pickerEventType !== null}
                onClose={() => setPickerEventType(null)}
                eventType={pickerEventType}
                players={[...match.team1, ...match.team2]
                  .map((id) => playerMap.get(id))
                  .filter(Boolean) as typeof players}
                onSelect={handleAddEvent}
              />
            </div>
          )}

          <EventFeed
            events={events}
            players={players}
            onRemove={handleRemoveEvent}
          />
        </div>
      </div>

      <EditMatchDialog
        match={match}
        open={editOpen}
        onOpenChange={setEditOpen}
      />
      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title="Eliminar partido"
        description="¿Seguro que quieres eliminar este partido? Se borrarán también todos sus eventos."
        onConfirm={handleDelete}
      />
    </MobileShell>
  );
}
