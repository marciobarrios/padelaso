"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Player, PlayerId, GroupId } from "@/lib/types";
import { PlayerAvatar } from "@/components/players/player-avatar";
import { TeamPicker } from "./team-picker";
import { createScheduledMatch } from "@/lib/supabase-mutations";
import { useAuth } from "@/components/auth/auth-provider";
import { invalidate, keys } from "@/lib/supabase-hooks";
import { cn } from "@/lib/utils";
import { CalendarClock, Check, ChevronLeft, ChevronRight, Shuffle } from "lucide-react";

const STEPS = ["Jugadores", "Equipos", "Fecha"] as const;
const MATCH_DURATION_MINUTES = 90;

interface PlannedMatchWizardProps {
  players: Player[];
  groupId?: GroupId;
}

function toDateTimeLocal(date: Date): string {
  const offsetMs = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16);
}

function addMinutes(value: string, minutes: number): string {
  return toDateTimeLocal(new Date(new Date(value).getTime() + minutes * 60_000));
}

function shuffleIds(ids: PlayerId[]): PlayerId[] {
  const copy = [...ids];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

export function PlannedMatchWizard({ players, groupId }: PlannedMatchWizardProps) {
  const router = useRouter();
  const { user } = useAuth();

  const defaultStart = toDateTimeLocal(
    new Date(Date.now() + 24 * 60 * 60_000)
  );
  const defaultEnd = addMinutes(defaultStart, MATCH_DURATION_MINUTES);

  const [step, setStep] = useState(0);
  const [selectedIds, setSelectedIds] = useState<PlayerId[]>([]);
  const [team1, setTeam1] = useState<PlayerId[]>([]);
  const [team2, setTeam2] = useState<PlayerId[]>([]);
  const [startAt, setStartAt] = useState(defaultStart);
  const [endAt, setEndAt] = useState(defaultEnd);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedPlayers = players.filter((p) => selectedIds.includes(p.id));
  const startsInFuture = new Date(startAt).getTime() > Date.now();
  const endsAfterStart = new Date(endAt).getTime() > new Date(startAt).getTime();

  function togglePlayer(id: PlayerId) {
    setSelectedIds((prev) =>
      prev.includes(id)
        ? prev.filter((x) => x !== id)
        : prev.length < 4
          ? [...prev, id]
          : prev
    );
  }

  function setSequentialTeams() {
    if (selectedIds.length !== 4) return;
    setTeam1([selectedIds[0], selectedIds[1]]);
    setTeam2([selectedIds[2], selectedIds[3]]);
  }

  function randomizeTeams() {
    if (selectedIds.length !== 4) return;
    const shuffled = shuffleIds(selectedIds);
    setTeam1([shuffled[0], shuffled[1]]);
    setTeam2([shuffled[2], shuffled[3]]);
  }

  function toggleTeam(playerId: PlayerId) {
    if (team1.includes(playerId)) {
      const swapTarget = team2[0];
      setTeam1((prev) => prev.map((id) => (id === playerId ? swapTarget : id)));
      setTeam2((prev) => prev.map((id) => (id === swapTarget ? playerId : id)));
    } else {
      const swapTarget = team1[0];
      setTeam2((prev) => prev.map((id) => (id === playerId ? swapTarget : id)));
      setTeam1((prev) => prev.map((id) => (id === swapTarget ? playerId : id)));
    }
  }

  function handleStartChange(value: string) {
    setStartAt(value);
    if (new Date(endAt).getTime() <= new Date(value).getTime()) {
      setEndAt(addMinutes(value, MATCH_DURATION_MINUTES));
    }
  }

  function canAdvance(): boolean {
    if (step === 0) return selectedIds.length === 4;
    if (step === 1) return team1.length === 2 && team2.length === 2;
    return startsInFuture && endsAfterStart;
  }

  function goNext() {
    if (step === 0) setSequentialTeams();
    if (step < STEPS.length - 1) setStep(step + 1);
  }

  async function handleSave() {
    if (!user || !canAdvance()) return;
    setSaving(true);
    setError(null);
    try {
      const matchId = await createScheduledMatch(
        team1,
        team2,
        new Date(startAt).toISOString(),
        new Date(endAt).toISOString(),
        user.id,
        groupId
      );
      if (groupId) invalidate(keys.matches(groupId));
      router.replace(`/matches/${matchId}`);
    } catch {
      setError("No se pudo planificar el partido. Inténtalo de nuevo.");
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
        {step === 0 && (
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground mb-3">
              Elige 4 jugadores ({selectedIds.length}/4)
            </p>
            <div className="grid grid-cols-2 gap-2">
              {players.map((player) => {
                const selected = selectedIds.includes(player.id);
                return (
                  <button
                    key={player.id}
                    type="button"
                    onClick={() => togglePlayer(player.id)}
                    className={cn(
                      "flex items-center gap-3 p-3 rounded-xl border-2 transition-all active:scale-95",
                      selected
                        ? "border-primary bg-primary/10"
                        : "border-border hover:bg-muted/50"
                    )}
                  >
                    <PlayerAvatar emoji={player.emoji} size="md" />
                    <span className="font-medium text-sm truncate">
                      {player.name}
                    </span>
                    {selected && (
                      <Check className="size-4 text-primary ml-auto shrink-0" />
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {step === 1 && (
          <div className="space-y-4">
            <Button
              type="button"
              variant="outline"
              className="w-full"
              onClick={randomizeTeams}
            >
              <Shuffle className="size-4 mr-2" />
              Equipos al azar
            </Button>
            <TeamPicker
              players={selectedPlayers}
              team1={team1}
              team2={team2}
              onToggle={toggleTeam}
            />
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4">
            <div className="flex items-center gap-3 rounded-xl border border-border p-4">
              <CalendarClock className="size-5 text-primary shrink-0" />
              <div className="min-w-0">
                <p className="font-medium">Planificar partido</p>
                <p className="text-sm text-muted-foreground">
                  Fecha futura con hora de inicio y fin
                </p>
              </div>
            </div>

            <label className="block space-y-2">
              <span className="text-sm font-medium">Inicio</span>
              <Input
                type="datetime-local"
                value={startAt}
                min={toDateTimeLocal(new Date())}
                onChange={(event) => handleStartChange(event.target.value)}
              />
            </label>

            <label className="block space-y-2">
              <span className="text-sm font-medium">Fin</span>
              <Input
                type="datetime-local"
                value={endAt}
                min={startAt}
                onChange={(event) => setEndAt(event.target.value)}
              />
            </label>

            {!startsInFuture && (
              <p className="text-sm text-destructive">
                La hora de inicio tiene que estar en el futuro.
              </p>
            )}
            {!endsAfterStart && (
              <p className="text-sm text-destructive">
                La hora de fin tiene que ser posterior al inicio.
              </p>
            )}
            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>
        )}
      </div>

      <div className="sticky bottom-0 border-t border-border bg-background p-4 flex gap-3">
        {step === 0 ? (
          <Button variant="outline" onClick={() => router.back()} className="flex-1">
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
          <Button onClick={goNext} disabled={!canAdvance()} className="flex-1">
            Siguiente
            <ChevronRight className="size-4 ml-1" />
          </Button>
        ) : (
          <Button onClick={handleSave} disabled={!canAdvance() || saving} className="flex-1">
            <Check className="size-4 mr-1" />
            Planificar
          </Button>
        )}
      </div>
    </div>
  );
}
