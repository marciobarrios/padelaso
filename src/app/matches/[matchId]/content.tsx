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
import { Pencil, Plus, Trash2, Radio } from "lucide-react";
import { EventFeed } from "@/components/events/event-feed";
import { useMatch, useMatchEvents, useMatchVotes, usePlayers, useDataRefresh } from "@/lib/db-hooks";
import { useGroup } from "@/components/group/group-provider";
import { addMatchEvent, removeMatchEvent, deleteMatch } from "@/lib/supabase-mutations";
import { useAuth } from "@/components/auth/auth-provider";
import { createClient } from "@/lib/supabase";
import { MatchEventType, MatchEventId } from "@/lib/types";
import { buildPlayerMap, getSetWins } from "@/lib/utils";
import { MatchVoting } from "@/components/match/match-voting";
import { VOTE_CONFIGS } from "@/lib/event-config";
import { dateFormatter } from "@/lib/utils";

const EditMatchDialog = dynamic(() =>
  import("@/components/match/edit-match-dialog").then((m) => ({ default: m.EditMatchDialog }))
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
  const { refresh } = useDataRefresh();
  const { match, loaded: matchLoaded } = useMatch(matchId);
  const { events, loaded: eventsLoaded } = useMatchEvents(matchId);
  const votes = useMatchVotes(matchId);
  const { players } = usePlayers(activeGroup?.id);
  const currentUserPlayerId =
    players.find((p) => p.userId === user?.id)?.id ?? null;
  const [editOpen, setEditOpen] = useState(false);
  const [editMounted, setEditMounted] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteMounted, setDeleteMounted] = useState(false);
  const [addingEvents, setAddingEvents] = useState(false);
  const [pickerEventType, setPickerEventType] = useState<MatchEventType | null>(null);

  useEffect(() => {
    const client = createClient();
    let channel: ReturnType<typeof client.channel> | null = null;
    let cancelled = false;

    async function open() {
      if (channel) return;
      // postgres_changes filters are RLS-evaluated at JOIN time. Joining
      // before the realtime client is bound to the user's JWT silently
      // mutes the channel; a later setAuth does not re-evaluate the filter.
      const { data } = await client.auth.getSession();
      console.log(
        `[realtime match-live] open() at ${new Date().toISOString()}, visibilityState=${document.visibilityState}, hasSession=${!!data.session?.access_token}`
      );
      if (cancelled || channel) return;
      if (data.session?.access_token) {
        client.realtime.setAuth(data.session.access_token);
      }
      channel = client
        .channel(`match-live:${matchId}`)
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "matches", filter: `id=eq.${matchId}` },
          (payload) => {
            console.log(
              `[realtime match-live] event received at ${new Date().toISOString()}, table=${payload.table}, eventType=${payload.eventType}, visibilityState=${document.visibilityState}`
            );
            refresh();
          }
        )
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "match_events", filter: `match_id=eq.${matchId}` },
          (payload) => {
            console.log(
              `[realtime match-live] event received at ${new Date().toISOString()}, table=${payload.table}, eventType=${payload.eventType}, visibilityState=${document.visibilityState}`
            );
            refresh();
          }
        )
        .subscribe((status, err) => {
          console.log(
            `[realtime match-live] subscribe status=${status} at ${new Date().toISOString()}, channel=match-live:${matchId}, err=${err ? String(err) : "null"}`
          );
          if (status === "SUBSCRIBED") return;
          console.warn("[match-live realtime]", status, err);
        });
    }
    function close() {
      console.log(`[realtime match-live] close() at ${new Date().toISOString()}`);
      if (!channel) return;
      channel.unsubscribe();
      channel = null;
    }

    open();
    // iOS Safari suspends websockets when the page is backgrounded. Replace
    // the channel on visibility return so we don't sit on a dead socket.
    const onVisibility = () => {
      console.log(
        `[realtime match-live] visibilitychange → ${document.visibilityState} at ${new Date().toISOString()}`
      );
      if (document.visibilityState !== "visible") return;
      close();
      open();
      refresh();
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisibility);
      close();
    };
  }, [matchId, refresh]);

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

  return (
    <MobileShell>
      <PageHeader
        title={dateFormatter.format(new Date(match.date))}
        back
        action={
          <div className="flex gap-1">
            {user?.id === match.createdBy && (
              <Link href={`/matches/${matchId}/scorekeeper`}>
                <Button variant="ghost" size="icon" aria-label="Scorekeeper">
                  <Radio className="size-4" />
                </Button>
              </Link>
            )}
            <Button
              variant="ghost"
              size="icon"
              onClick={() => { setEditMounted(true); setEditOpen(true); }}
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
            players={players}
            loaded={eventsLoaded}
            onRemove={handleRemoveEvent}
          />
        </div>
      </div>

      {editMounted && (
        <EditMatchDialog
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
