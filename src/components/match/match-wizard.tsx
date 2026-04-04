"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Player, PlayerId, MatchSet, MatchEventType } from "@/lib/types";
import { PlayerAvatar } from "@/components/players/player-avatar";
import { TeamPicker } from "./team-picker";
import { ScoreInput } from "./score-input";
import { EventGrid } from "@/components/events/event-grid";
import { PlayerEventPicker } from "@/components/events/player-event-picker";
import { createMatch } from "@/lib/supabase-mutations";
import { useAuth } from "@/components/auth/auth-provider";
import { useDataRefresh } from "@/lib/supabase-hooks";
import { cn } from "@/lib/utils";
import { Check, ChevronLeft, ChevronRight } from "lucide-react";
import { getEventConfig } from "@/lib/event-config";

const STEPS = [
  "Jugadores",
  "Equipos",
  "Resultado",
  "Eventos",
  "Confirmar",
] as const;

interface PendingEvent {
  type: MatchEventType;
  playerId: PlayerId;
}

interface MatchWizardProps {
  players: Player[];
}

export function MatchWizard({ players }: MatchWizardProps) {
  const router = useRouter();
  const { user } = useAuth();
  const { refresh } = useDataRefresh();
  const [step, setStep] = useState(0);

  // Step 1: Selected players
  const [selectedIds, setSelectedIds] = useState<PlayerId[]>([]);

  // Step 2: Teams
  const [team1, setTeam1] = useState<PlayerId[]>([]);
  const [team2, setTeam2] = useState<PlayerId[]>([]);

  // Step 3: Score
  const [sets, setSets] = useState<MatchSet[]>([
    { team1Score: 0, team2Score: 0 },
  ]);

  // Step 4: Events
  const [pendingEvents, setPendingEvents] = useState<PendingEvent[]>([]);
  const [pickerEventType, setPickerEventType] =
    useState<MatchEventType | null>(null);

  const selectedPlayers = players.filter((p) => selectedIds.includes(p.id));
  const allMatchPlayers = [...team1, ...team2]
    .map((id) => players.find((p) => p.id === id))
    .filter(Boolean) as Player[];

  // Toggle player selection (Step 1)
  function togglePlayer(id: PlayerId) {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : prev.length < 4 ? [...prev, id] : prev
    );
  }

  // Move to teams step: auto-split 2+2
  function initTeams() {
    if (selectedIds.length === 4) {
      setTeam1([selectedIds[0], selectedIds[1]]);
      setTeam2([selectedIds[2], selectedIds[3]]);
    }
  }

  // Swap tapped player with the first player on the other team
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

  // Event selection
  function handleEventSelect(type: MatchEventType) {
    setPickerEventType(type);
  }

  function handlePlayerEventSelect(playerId: PlayerId) {
    setPendingEvents((prev) => [...prev, { type: pickerEventType!, playerId }]);
    setPickerEventType(null);
  }

  const eventCounts = new Map<MatchEventType, number>();
  for (const e of pendingEvents) {
    eventCounts.set(e.type, (eventCounts.get(e.type) ?? 0) + 1);
  }

  // Save match
  async function handleSave() {
    if (!user) return;
    const matchId = await createMatch(
      team1,
      team2,
      sets,
      user.id,
      pendingEvents
    );
    refresh();
    router.push(`/matches/${matchId}`);
  }

  // Navigation
  function canAdvance(): boolean {
    switch (step) {
      case 0:
        return selectedIds.length === 4;
      case 1:
        return team1.length === 2 && team2.length === 2;
      case 2:
        return sets.some((s) => s.team1Score > 0 || s.team2Score > 0);
      case 3:
        return true; // Events are optional
      case 4:
        return true;
      default:
        return false;
    }
  }

  function goNext() {
    if (step === 0) initTeams();
    if (step < STEPS.length - 1) setStep(step + 1);
  }

  function goBack() {
    if (step > 0) setStep(step - 1);
  }

  // Player map for confirm step
  const playerMap = new Map(players.map((p) => [p.id, p]));

  return (
    <div className="flex flex-col min-h-dvh">
      {/* Progress bar */}
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

      {/* Content */}
      <div className="flex-1 px-4 py-4 overflow-y-auto">
        {/* Step 0: Select players */}
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

        {/* Step 1: Teams */}
        {step === 1 && (
          <TeamPicker
            players={selectedPlayers}
            team1={team1}
            team2={team2}
            onToggle={toggleTeam}
          />
        )}

        {/* Step 2: Score */}
        {step === 2 && (
          <div className="space-y-4">
            <div className="flex justify-center gap-8 text-sm font-medium mb-4">
              <span className="text-blue-500">Equipo 1</span>
              <span className="text-muted-foreground">vs</span>
              <span className="text-orange-500">Equipo 2</span>
            </div>
            <ScoreInput sets={sets} onChange={setSets} />
          </div>
        )}

        {/* Step 3: Events */}
        {step === 3 && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground text-center">
              Opcional: registra momentos del partido
            </p>
            <EventGrid counts={eventCounts} onSelect={handleEventSelect} />
            {pendingEvents.length > 0 && (
              <div className="space-y-1 mt-4">
                <p className="text-xs text-muted-foreground">
                  {pendingEvents.length} evento
                  {pendingEvents.length !== 1 ? "s" : ""} registrado
                  {pendingEvents.length !== 1 ? "s" : ""}
                </p>
                <div className="flex flex-wrap gap-1">
                  {pendingEvents.map((e, i) => {
                    const config = getEventConfig(e.type);
                    const player = playerMap.get(e.playerId);
                    return (
                      <button
                        key={i}
                        type="button"
                        onClick={() =>
                          setPendingEvents((prev) =>
                            prev.filter((_, idx) => idx !== i)
                          )
                        }
                        className="flex items-center gap-1 px-2 py-1 rounded-full bg-muted text-xs hover:bg-destructive/20 transition-colors"
                        title="Toca para eliminar"
                      >
                        <span>{config.emoji}</span>
                        <span>{player?.name}</span>
                        <span className="text-muted-foreground">×</span>
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

        {/* Step 4: Confirm */}
        {step === 4 && (
          <div className="space-y-6">
            {/* Teams summary */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <h3 className="text-sm font-medium text-blue-500">Equipo 1</h3>
                {team1.map((id) => {
                  const p = playerMap.get(id);
                  return (
                    p && (
                      <div key={id} className="flex items-center gap-2">
                        <PlayerAvatar emoji={p.emoji} size="sm" />
                        <span className="text-sm">{p.name}</span>
                      </div>
                    )
                  );
                })}
              </div>
              <div className="space-y-2">
                <h3 className="text-sm font-medium text-orange-500">Equipo 2</h3>
                {team2.map((id) => {
                  const p = playerMap.get(id);
                  return (
                    p && (
                      <div key={id} className="flex items-center gap-2">
                        <PlayerAvatar emoji={p.emoji} size="sm" />
                        <span className="text-sm">{p.name}</span>
                      </div>
                    )
                  );
                })}
              </div>
            </div>

            {/* Score summary */}
            <div className="text-center space-y-2">
              {sets.map((set, i) => (
                <div key={i} className="flex items-center justify-center gap-2">
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

            {/* Events summary */}
            {pendingEvents.length > 0 && (
              <div>
                <h3 className="text-sm font-medium text-muted-foreground mb-2">
                  {pendingEvents.length} evento
                  {pendingEvents.length !== 1 ? "s" : ""}
                </h3>
                <div className="flex flex-wrap gap-1">
                  {pendingEvents.map((e, i) => {
                    const config = getEventConfig(e.type);
                    const player = playerMap.get(e.playerId);
                    return (
                      <span
                        key={i}
                        className="px-2 py-1 rounded-full bg-muted text-xs"
                      >
                        {config.emoji} {player?.name}
                      </span>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Navigation */}
      <div className="sticky bottom-0 border-t border-border bg-background p-4 flex gap-3">
        {step > 0 && (
          <Button variant="outline" onClick={goBack} className="flex-1">
            <ChevronLeft className="size-4 mr-1" />
            Atrás
          </Button>
        )}
        {step < STEPS.length - 1 ? (
          <Button
            onClick={goNext}
            disabled={!canAdvance()}
            className="flex-1"
          >
            Siguiente
            <ChevronRight className="size-4 ml-1" />
          </Button>
        ) : (
          <Button onClick={handleSave} className="flex-1">
            <Check className="size-4 mr-1" />
            Guardar partido
          </Button>
        )}
      </div>
    </div>
  );
}
