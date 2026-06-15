"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { MobileShell } from "@/components/layout/mobile-shell";
import { PageHeader } from "@/components/layout/page-header";
import { PlayerAvatar } from "@/components/players/player-avatar";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CalendarClock, CheckCircle2, Clock, Pencil, Plus, Trash2, Radio } from "lucide-react";
import { EventFeed } from "@/components/events/event-feed";
import { useMatch, useMatchEvents, useMatchVotes, usePlayers, invalidate, keys } from "@/lib/db-hooks";
import { useGroup } from "@/components/group/group-provider";
import { addMatchEvent, removeMatchEvent, deleteMatch } from "@/lib/supabase-mutations";
import { revalidateGroupData } from "@/lib/server-actions";
import { useAuth } from "@/components/auth/auth-provider";
import { getBrowserClient } from "@/lib/supabase";
import { MatchEventType, MatchEventId, Player } from "@/lib/types";
import { buildPlayerMap, dateFormatter, dateTimeFormatter, getSetWins, isScheduledMatch, timeFormatter } from "@/lib/utils";
import { MatchVoting } from "@/components/match/match-voting";
import { VOTE_CONFIGS } from "@/lib/event-config";

const EditMatchDialog = dynamic(() =>
  import("@/components/match/edit-match-dialog").then((m) => ({ default: m.EditMatchDialog }))
);
const RescheduleMatchDialog = dynamic(() =>
  import("@/components/match/reschedule-match-dialog").then((m) => ({ default: m.RescheduleMatchDialog }))
);
const ConfirmDialog = dynamic(() =>
  import("@/components/confirm-dialog").then((m) => ({ default: m.ConfirmDialog }))
);
const EventGrid = dynamic(() =>
  import("@/components/events/event-grid").then((m) => ({ default: m.EventGrid }))
);
const PlayerEventPicker = dynamic(() =>
  import("@/components/events/player-event-picker").then((m) => ({ default: m.PlayerEventPicker }))
);

export function MatchDetailContent({ matchId }: { matchId: string }) {
  const router = useRouter();
  const { user } = useAuth();
  const { activeGroup } = useGroup();

  const { match, loaded: matchLoaded } = useMatch(matchId);
  const { events, loaded: eventsLoaded } = useMatchEvents(matchId);
  const votes = useMatchVotes(matchId);
  const { players } = usePlayers(activeGroup?.id);
  const currentUserPlayerId =
    players.find((p) => p.userId === user?.id)?.id ?? null;
  const [editOpen, setEditOpen] = useState(false);
  const [editMounted, setEditMounted] = useState(false);
  const [editKey, setEditKey] = useState(0);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteMounted, setDeleteMounted] = useState(false);
  const [rescheduleOpen, setRescheduleOpen] = useState(false);
  const [rescheduleMounted, setRescheduleMounted] = useState(false);
  const [addingEvents, setAddingEvents] = useState(false);
  const [pickerEventType, setPickerEventType] = useState<MatchEventType | null>(null);
  const [now, setNow] = useState(0);

  useEffect(() => {
    const client = getBrowserClient();
    let channel: ReturnType<typeof client.channel> | null = null;

    function open() {
      if (channel) return;
      channel = client
        .channel(`match-live:${matchId}`)
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "matches", filter: `id=eq.${matchId}` },
          () => invalidate(keys.match(matchId))
        )
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "match_events", filter: `match_id=eq.${matchId}` },
          () => {
            invalidate(keys.matchEvents(matchId));
            if (activeGroup?.id) {
              invalidate(keys.allMatchEvents(activeGroup.id));
            }
          }
        )
        .subscribe((status, err) => {
          if (status === "SUBSCRIBED") return;
          console.warn("[match-live realtime]", status, err);
        });
    }
    function close() {
      if (!channel) return;
      channel.unsubscribe();
      channel = null;
    }

    open();
    // iOS Safari suspends websockets when the page is backgrounded. Replace
    // the channel on visibility return so we don't sit on a dead socket.
    const onVisibility = () => {
      if (document.visibilityState !== "visible") return;
      close();
      open();
      invalidate(keys.match(matchId));
      invalidate(keys.matchEvents(matchId));
      if (activeGroup?.id) {
        invalidate(keys.allMatchEvents(activeGroup.id));
      }
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      close();
    };
  }, [matchId, activeGroup?.id]);

  useEffect(() => {
    const first = window.setTimeout(() => setNow(Date.now()), 0);
    const id = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(id);
    };
  }, []);

  async function handleAddEvent(playerId: string) {
    if (!pickerEventType || !user) return;
    await addMatchEvent(matchId, playerId, pickerEventType, user.id);
    invalidate(keys.matchEvents(matchId));
    if (activeGroup?.id) invalidate(keys.allMatchEvents(activeGroup.id));
    setPickerEventType(null);
  }

  async function handleRemoveEvent(eventId: MatchEventId) {
    await removeMatchEvent(eventId);
    invalidate(keys.matchEvents(matchId));
    if (activeGroup?.id) invalidate(keys.allMatchEvents(activeGroup.id));
  }

  async function handleDelete() {
    await deleteMatch(matchId);
    invalidate(keys.match(matchId));
    if (activeGroup?.id) invalidate(keys.matches(activeGroup.id));
    await revalidateGroupData();
    router.replace("/");
  }

  if (!match) {
    if (!matchLoaded) return (
      <MobileShell>
        <PageHeader title="Partido" back />
      </MobileShell>
    );
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
  const canConfirmScheduled =
    new Date(match.date).getTime() - 15 * 60_000 <= now;

  if (isScheduledMatch(match)) {
    return (
      <MobileShell>
        <PageHeader
          title="Partido planificado"
          back
          action={
            <div className="flex gap-1">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => { setRescheduleMounted(true); setRescheduleOpen(true); }}
                aria-label="Cambiar hora"
              >
                <Pencil className="size-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => { setDeleteMounted(true); setDeleteOpen(true); }}
                aria-label="Eliminar"
              >
                <Trash2 className="size-4 text-destructive" />
              </Button>
            </div>
          }
        />
        <div className="max-w-lg mx-auto px-4 py-6 space-y-6">
          <Card className="border-primary/30 bg-primary/5">
            <CardContent className="p-5 space-y-5">
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-2 min-w-0">
                  <div className="flex items-center gap-2">
                    <CalendarClock className="size-5 text-primary shrink-0" />
                    <span className="font-medium">
                      {dateTimeFormatter.format(new Date(match.date))}
                    </span>
                  </div>
                  {match.scheduledEndAt && (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Clock className="size-4 shrink-0" />
                      <span>
                        Hasta {timeFormatter.format(new Date(match.scheduledEndAt))}
                      </span>
                    </div>
                  )}
                </div>
                <Badge variant="secondary">Planificado</Badge>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <ScheduledTeam title="Equipo 1" players={team1Players} tone="blue" />
                <ScheduledTeam title="Equipo 2" players={team2Players} tone="orange" />
              </div>

              <Button
                className="w-full"
                disabled={!canConfirmScheduled}
                onClick={() => router.push(`/matches/${matchId}/confirm`)}
              >
                <CheckCircle2 className="size-4 mr-1" />
                Confirmar partido
              </Button>
              {!canConfirmScheduled && (
                <p className="text-xs text-muted-foreground text-center">
                  Disponible desde 15 minutos antes del inicio.
                </p>
              )}
            </CardContent>
          </Card>
        </div>

        {rescheduleMounted && (
          <RescheduleMatchDialog
            match={match}
            open={rescheduleOpen}
            onOpenChange={setRescheduleOpen}
          />
        )}
        {deleteMounted && (
          <ConfirmDialog
            open={deleteOpen}
            onOpenChange={setDeleteOpen}
            title="Eliminar partido planificado"
            description="¿Seguro que quieres eliminar este partido planificado?"
            onConfirm={handleDelete}
          />
        )}
      </MobileShell>
    );
  }

  return (
    <MobileShell>
      <PageHeader
        title={dateFormatter.format(new Date(match.date))}
        back
        action={
          <div className="flex gap-1">
            <Link href={`/matches/${matchId}/scorekeeper`}>
              <Button variant="ghost" size="icon" aria-label="Scorekeeper">
                <Radio className="size-4" />
              </Button>
            </Link>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => { setEditKey((k) => k + 1); setEditMounted(true); setEditOpen(true); }}
            >
              <Pencil className="size-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => { setDeleteMounted(true); setDeleteOpen(true); }}
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

        {/* Voting */}
        <div className="space-y-4">
          {VOTE_CONFIGS.filter((config) => config.type !== "jugada_del_partido").map((config) => (
            <MatchVoting
              key={config.type}
              match={match}
              votes={votes}
              players={players}
              currentUserPlayerId={currentUserPlayerId}
              config={config}
            />
          ))}
        </div>

        {/* Events */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
              <span className="mr-1">📋</span> Eventos del partido
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
            playerMap={playerMap}
            loaded={eventsLoaded}
            onRemove={handleRemoveEvent}
          />
        </div>
      </div>

      {editMounted && (
        <EditMatchDialog
          key={editKey}
          match={match}
          open={editOpen}
          onOpenChange={setEditOpen}
        />
      )}
      {deleteMounted && (
        <ConfirmDialog
          open={deleteOpen}
          onOpenChange={setDeleteOpen}
          title="Eliminar partido"
          description="¿Seguro que quieres eliminar este partido? Se borrarán también todos sus eventos."
          onConfirm={handleDelete}
        />
      )}
    </MobileShell>
  );
}

function ScheduledTeam({
  title,
  players,
  tone,
}: {
  title: string;
  players: (Player | undefined)[];
  tone: "blue" | "orange";
}) {
  return (
    <div className="space-y-2">
      <h3
        className={
          tone === "blue"
            ? "text-sm font-medium text-blue-500"
            : "text-sm font-medium text-orange-500"
        }
      >
        {title}
      </h3>
      {players.map((player, index) => (
        <div key={player?.id ?? index} className="flex items-center gap-2 min-w-0">
          {player ? (
            <>
              <PlayerAvatar emoji={player.emoji} size="sm" />
              <span className="text-sm truncate">{player.name}</span>
            </>
          ) : (
            <span className="text-sm text-destructive">Jugador eliminado</span>
          )}
        </div>
      ))}
    </div>
  );
}
