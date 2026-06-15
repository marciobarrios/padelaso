"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { PlayerAvatar } from "@/components/players/player-avatar";
import { Match, Player, PlayerId } from "@/lib/types";
import { deleteMatch } from "@/lib/supabase-mutations";
import { invalidate, keys } from "@/lib/supabase-hooks";
import { revalidateGroupData } from "@/lib/server-actions";
import { dateTimeFormatter, timeFormatter } from "@/lib/utils";
import { CalendarClock, CheckCircle2, Clock, Pencil, Trash2 } from "lucide-react";

const ConfirmDialog = dynamic(() =>
  import("@/components/confirm-dialog").then((m) => ({ default: m.ConfirmDialog }))
);

const RescheduleMatchDialog = dynamic(() =>
  import("@/components/match/reschedule-match-dialog").then((m) => ({
    default: m.RescheduleMatchDialog,
  }))
);

interface ScheduledMatchCardProps {
  match: Match;
  playerMap: Map<PlayerId, Player>;
}

function canConfirmByTime(match: Match, now: number): boolean {
  return new Date(match.date).getTime() - 15 * 60_000 <= now;
}

export function ScheduledMatchCard({ match, playerMap }: ScheduledMatchCardProps) {
  const router = useRouter();
  const [now, setNow] = useState(0);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteMounted, setDeleteMounted] = useState(false);
  const [rescheduleOpen, setRescheduleOpen] = useState(false);
  const [rescheduleMounted, setRescheduleMounted] = useState(false);

  useEffect(() => {
    const first = window.setTimeout(() => setNow(Date.now()), 0);
    const id = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(id);
    };
  }, []);

  const canConfirm = canConfirmByTime(match, now);
  const team1Players = match.team1.map((id) => playerMap.get(id));
  const team2Players = match.team2.map((id) => playerMap.get(id));

  async function handleDelete() {
    await deleteMatch(match.id);
    invalidate(keys.match(match.id), keys.matches(match.groupId));
    await revalidateGroupData();
  }

  return (
    <Card className="border-primary/30 bg-primary/5">
      <CardContent className="p-3 sm:p-4 space-y-3">
        <button
          type="button"
          onClick={() => router.push(`/matches/${match.id}`)}
          className="block w-full text-left"
        >
          <div className="flex items-start justify-between gap-3 mb-3">
            <div className="min-w-0 space-y-1">
              <div className="flex items-center gap-2">
                <CalendarClock className="size-4 text-primary shrink-0" />
                <span className="text-sm font-medium truncate">
                  {dateTimeFormatter.format(new Date(match.date))}
                </span>
              </div>
              {match.scheduledEndAt && (
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Clock className="size-3.5 shrink-0" />
                  <span>
                    Hasta {timeFormatter.format(new Date(match.scheduledEndAt))}
                  </span>
                </div>
              )}
            </div>
            <Badge variant="secondary">Planificado</Badge>
          </div>

          <div className="flex items-center">
            <TeamPreview players={team1Players} align="left" />
            <span className="px-3 text-xs font-medium text-muted-foreground">vs</span>
            <TeamPreview players={team2Players} align="right" />
          </div>
        </button>

        <div className="grid grid-cols-[1fr_auto_auto] gap-2">
          <Button
            onClick={() => router.push(`/matches/${match.id}/confirm`)}
            disabled={!canConfirm}
            className="min-w-0"
          >
            <CheckCircle2 className="size-4 mr-1" />
            Confirmar partido
          </Button>
          <Button
            variant="outline"
            size="icon"
            aria-label="Cambiar hora"
            onClick={() => {
              setRescheduleMounted(true);
              setRescheduleOpen(true);
            }}
          >
            <Pencil className="size-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Eliminar"
            onClick={() => {
              setDeleteMounted(true);
              setDeleteOpen(true);
            }}
          >
            <Trash2 className="size-4 text-destructive" />
          </Button>
        </div>
      </CardContent>

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
    </Card>
  );
}

function TeamPreview({
  players,
  align,
}: {
  players: (Player | undefined)[];
  align: "left" | "right";
}) {
  return (
    <div className={align === "right" ? "flex-1 space-y-1 text-right" : "flex-1 space-y-1"}>
      <div
        className={
          align === "right"
            ? "flex items-center gap-1 justify-end"
            : "flex items-center gap-1"
        }
      >
        {players.map((player, index) =>
          player ? (
            <PlayerAvatar
              key={player.id}
              emoji={player.emoji}
              name={player.name}
              size="sm"
            />
          ) : (
            <span key={index} className="text-sm text-destructive">
              ?
            </span>
          )
        )}
      </div>
      <div className="text-sm truncate">
        {players.map((player) => player?.name ?? "?").join(" · ")}
      </div>
    </div>
  );
}
