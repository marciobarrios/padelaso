"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Match } from "@/lib/types";
import { updateScheduledMatchSchedule } from "@/lib/supabase-mutations";
import { invalidate, keys } from "@/lib/supabase-hooks";
import { revalidateGroupData } from "@/lib/server-actions";

interface RescheduleMatchDialogProps {
  match: Match;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const MATCH_DURATION_MINUTES = 90;

function toDateTimeLocal(date: Date): string {
  const offsetMs = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16);
}

function addMinutes(value: string, minutes: number): string {
  return toDateTimeLocal(new Date(new Date(value).getTime() + minutes * 60_000));
}

export function RescheduleMatchDialog({
  match,
  open,
  onOpenChange,
}: RescheduleMatchDialogProps) {
  const [startAt, setStartAt] = useState(toDateTimeLocal(new Date(match.date)));
  const [endAt, setEndAt] = useState(
    toDateTimeLocal(
      match.scheduledEndAt
        ? new Date(match.scheduledEndAt)
        : new Date(new Date(match.date).getTime() + MATCH_DURATION_MINUTES * 60_000)
    )
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const startsInFuture = new Date(startAt).getTime() > Date.now();
  const endsAfterStart = new Date(endAt).getTime() > new Date(startAt).getTime();

  function handleStartChange(value: string) {
    setStartAt(value);
    if (new Date(endAt).getTime() <= new Date(value).getTime()) {
      setEndAt(addMinutes(value, MATCH_DURATION_MINUTES));
    }
  }

  async function handleSave() {
    if (!startsInFuture || !endsAfterStart) return;
    setSaving(true);
    setError(null);
    try {
      await updateScheduledMatchSchedule(
        match.id,
        new Date(startAt).toISOString(),
        new Date(endAt).toISOString()
      );
      invalidate(keys.match(match.id), keys.matches(match.groupId));
      await revalidateGroupData();
      onOpenChange(false);
    } catch {
      setError("No se pudo cambiar la hora. Inténtalo de nuevo.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Cambiar hora</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
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
          <Button
            onClick={handleSave}
            disabled={!startsInFuture || !endsAfterStart || saving}
            className="w-full"
          >
            Guardar cambios
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
