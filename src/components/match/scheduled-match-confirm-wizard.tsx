"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Match, MatchEventType, MatchSet, Player, PlayerId } from "@/lib/types";
import { ScoreInput } from "./score-input";
import { EventGrid } from "@/components/events/event-grid";
import { PlayerEventPicker } from "@/components/events/player-event-picker";
import { PlayerAvatar } from "@/components/players/player-avatar";
import { canConfirmScheduledMatch, confirmScheduledMatch } from "@/lib/supabase-mutations";
import { invalidate, keys } from "@/lib/supabase-hooks";
import { revalidateGroupData } from "@/lib/server-actions";
import { cn, dateTimeFormatter } from "@/lib/utils";
import { getEventConfig } from "@/lib/event-config";
import { Check, ChevronLeft, ChevronRight } from "lucide-react";

const STEPS = ["Resultado", "Eventos", "Confirmar"] as const;

interface PendingEvent {
  type: MatchEventType;
  playerId: PlayerId;
}

interface ScheduledMatchConfirmWizardProps {
  match: Match;
  players: Player[];
}

export function ScheduledMatchConfirmWizard({
  match,
  players,
}: ScheduledMatchConfirmWizardProps) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [sets, setSets] = useState<MatchSet[]>([
    { team1Score: 0, team2Score: 0 },
  ]);
  const [pendingEvents, setPendingEvents] = useState<PendingEvent[]>([]);
  const [pickerEventType, setPickerEventType] =
    useState<MatchEventType | null>(null);
  const [serverCanConfirm, setServerCanConfirm] = useState(false);
  const [checkedGate, setCheckedGate] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const playerMap = new Map(players.map((p) => [p.id, p]));
  const allMatchPlayers = [...match.team1, ...match.team2]
    .map((id) => playerMap.get(id))
    .filter(Boolean) as Player[];
  const hasMissingPlayers = allMatchPlayers.length !== 4;

  useEffect(() => {
    let ignore = false;
    canConfirmScheduledMatch(match.id)
      .then((canConfirm) => {
        if (!ignore) setServerCanConfirm(canConfirm);
      })
      .catch(() => {
        if (!ignore) setServerCanConfirm(false);
      })
      .finally(() => {
        if (!ignore) setCheckedGate(true);
      });
    return () => {
      ignore = true;
    };
  }, [match.id]);

  const eventCounts = new Map<MatchEventType, number>();
  for (const event of pendingEvents) {
    eventCounts.set(event.type, (eventCounts.get(event.type) ?? 0) + 1);
  }

  function canAdvance(): boolean {
    if (hasMissingPlayers || !serverCanConfirm) return false;
    if (step === 0) return sets.some((s) => s.team1Score > 0 || s.team2Score > 0);
    return true;
  }

  function handlePlayerEventSelect(playerId: PlayerId) {
    setPendingEvents((prev) => [...prev, { type: pickerEventType!, playerId }]);
    setPickerEventType(null);
  }

  async function handleSave() {
    if (!canAdvance()) return;
    setSaving(true);
    setError(null);
    try {
      await confirmScheduledMatch(match.id, sets, pendingEvents);
      invalidate(
        keys.match(match.id),
        keys.matches(match.groupId),
        keys.matchEvents(match.id),
        keys.allMatchEvents(match.groupId)
      );
      await revalidateGroupData();
      router.replace(`/matches/${match.id}`);
    } catch {
      setError("No se pudo confirmar el partido. Revisa la hora e inténtalo de nuevo.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col flex-1 max-w-lg mx-auto w-full">
      <div className="flex gap-1 px-4 pt-4">
        {STEPS.map((_, i) => (
          <div
            key={i}
            className={cn(
              "h-1 flex-1 rounded-full transition-colors",
              i <= step ? "bg-primary" : "bg-muted"
            )}
          />
        ))}
      </div>

      <div className="px-4 pt-2 pb-1">
        <h2 className="text-lg font-bold font-heading">{STEPS[step]}</h2>
      </div>

      <div className="flex-1 px-4 py-4 overflow-y-auto">
        {!checkedGate && (
          <p className="text-sm text-muted-foreground">
            Comprobando si el partido ya se puede confirmar...
          </p>
        )}

        {checkedGate && !serverCanConfirm && (
          <p className="text-sm text-destructive">
            Este partido se puede confirmar desde 15 minutos antes del inicio.
          </p>
        )}

        {hasMissingPlayers && (
          <p className="text-sm text-destructive">
            Falta algún jugador del partido. Elimina este partido y planifícalo de nuevo.
          </p>
        )}

        {step === 0 && (
          <div className="space-y-4">
            <div className="rounded-xl border border-border p-4 space-y-3">
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                {dateTimeFormatter.format(new Date(match.date))}
              </p>
              <div className="grid grid-cols-2 gap-4">
                <TeamSummary title="Equipo 1" ids={match.team1} playerMap={playerMap} color="blue" />
                <TeamSummary title="Equipo 2" ids={match.team2} playerMap={playerMap} color="orange" />
              </div>
            </div>
            <ScoreInput sets={sets} onChange={setSets} />
          </div>
        )}

        {step === 1 && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground text-center">
              Opcional: registra momentos del partido
            </p>
            <EventGrid counts={eventCounts} onSelect={setPickerEventType} />
            {pendingEvents.length > 0 && (
              <div className="space-y-1 mt-4">
                <p className="text-xs text-muted-foreground">
                  {pendingEvents.length} evento
                  {pendingEvents.length !== 1 ? "s" : ""} registrado
                  {pendingEvents.length !== 1 ? "s" : ""}
                </p>
                <div className="flex flex-wrap gap-1">
                  {pendingEvents.map((event, index) => {
                    const config = getEventConfig(event.type);
                    const player = playerMap.get(event.playerId);
                    return (
                      <button
                        key={index}
                        type="button"
                        onClick={() =>
                          setPendingEvents((prev) =>
                            prev.filter((_, idx) => idx !== index)
                          )
                        }
                        className="flex items-center gap-1 px-2 py-1 rounded-full bg-muted text-xs hover:bg-destructive/20 transition-colors"
                        title="Toca para eliminar"
                      >
                        <span>{config.emoji}</span>
                        <span>{player?.name}</span>
                        <span className="text-muted-foreground">x</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
            <PlayerEventPicker
              open={pickerEventType !== null}
              onClose={() => setPickerEventType(null)}
              eventType={pickerEventType}
              players={allMatchPlayers}
              onSelect={handlePlayerEventSelect}
            />
          </div>
        )}

        {step === 2 && (
          <div className="space-y-6">
            <div className="grid grid-cols-2 gap-4">
              <TeamSummary title="Equipo 1" ids={match.team1} playerMap={playerMap} color="blue" />
              <TeamSummary title="Equipo 2" ids={match.team2} playerMap={playerMap} color="orange" />
            </div>

            <div className="space-y-2">
              {sets.map((set, i) => (
                <div key={i} className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">
                    Set {i + 1}:
                  </span>
                  <span className="text-xl font-heading font-bold tabular-nums">
                    <span className="text-blue-500">{set.team1Score}</span>
                    <span className="text-muted-foreground mx-1">-</span>
                    <span className="text-orange-500">{set.team2Score}</span>
                  </span>
                </div>
              ))}
            </div>

            {pendingEvents.length > 0 && (
              <div>
                <h3 className="text-sm font-medium text-muted-foreground mb-2">
                  {pendingEvents.length} evento
                  {pendingEvents.length !== 1 ? "s" : ""}
                </h3>
                <div className="flex flex-wrap gap-1">
                  {pendingEvents.map((event, index) => {
                    const config = getEventConfig(event.type);
                    const player = playerMap.get(event.playerId);
                    return (
                      <span
                        key={index}
                        className="px-2 py-1 rounded-full bg-muted text-xs"
                      >
                        {config.emoji} {player?.name}
                      </span>
                    );
                  })}
                </div>
              </div>
            )}
            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>
        )}
      </div>

      <div className="sticky bottom-0 border-t border-border bg-background p-4 flex gap-3">
        {step === 0 ? (
          <Button
            variant="outline"
            onClick={() => router.replace(`/matches/${match.id}`)}
            className="flex-1"
          >
            Cancelar
          </Button>
        ) : (
          <Button
            variant="outline"
            onClick={() => setStep((current) => current - 1)}
            className="flex-1"
          >
            <ChevronLeft className="size-4 mr-1" />
            Atrás
          </Button>
        )}
        {step < STEPS.length - 1 ? (
          <Button
            onClick={() => setStep((current) => current + 1)}
            disabled={!canAdvance()}
            className="flex-1"
          >
            Siguiente
            <ChevronRight className="size-4 ml-1" />
          </Button>
        ) : (
          <Button
            onClick={handleSave}
            disabled={!canAdvance() || saving}
            className="flex-1"
          >
            <Check className="size-4 mr-1" />
            Confirmar
          </Button>
        )}
      </div>
    </div>
  );
}

function TeamSummary({
  title,
  ids,
  playerMap,
  color,
}: {
  title: string;
  ids: PlayerId[];
  playerMap: Map<PlayerId, Player>;
  color: "blue" | "orange";
}) {
  const titleClass = color === "blue" ? "text-blue-500" : "text-orange-500";

  return (
    <div className="space-y-2">
      <h3 className={cn("text-sm font-medium", titleClass)}>{title}</h3>
      {ids.map((id) => {
        const player = playerMap.get(id);
        return (
          <div key={id} className="flex items-center gap-2 min-w-0">
            {player ? (
              <>
                <PlayerAvatar emoji={player.emoji} size="sm" />
                <span className="text-sm truncate">{player.name}</span>
              </>
            ) : (
              <span className="text-sm text-destructive">Jugador eliminado</span>
            )}
          </div>
        );
      })}
    </div>
  );
}
