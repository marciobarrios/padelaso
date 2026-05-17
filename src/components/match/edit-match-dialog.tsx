"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Match, MatchSet } from "@/lib/types";
import { ScoreInput } from "./score-input";
import { updateMatch } from "@/lib/supabase-mutations";
import { invalidate, keys } from "@/lib/supabase-hooks";

interface EditMatchDialogProps {
  match: Match;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function EditMatchDialog({
  match,
  open,
  onOpenChange,
}: EditMatchDialogProps) {
  const [sets, setSets] = useState<MatchSet[]>(match.sets);

  async function handleSave() {
    await updateMatch(match.id, { sets });
    invalidate(keys.match(match.id));
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Editar resultado</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <ScoreInput sets={sets} onChange={setSets} />
          <Button
            onClick={handleSave}
            disabled={sets.every(
              (s) => s.team1Score === 0 && s.team2Score === 0
            )}
            className="w-full"
          >
            Guardar cambios
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
