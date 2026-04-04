"use client";

import { MatchSet } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Minus, Plus, Trash2 } from "lucide-react";

interface ScoreInputProps {
  sets: MatchSet[];
  onChange: (sets: MatchSet[]) => void;
}

export function ScoreInput({ sets, onChange }: ScoreInputProps) {
  function updateSet(index: number, field: keyof MatchSet, delta: number) {
    const updated = [...sets];
    const val = updated[index][field] + delta;
    if (val < 0) return;
    updated[index] = { ...updated[index], [field]: val };
    onChange(updated);
  }

  function addSet() {
    onChange([...sets, { team1Score: 0, team2Score: 0 }]);
  }

  function removeSet(index: number) {
    if (sets.length <= 1) return;
    onChange(sets.filter((_, i) => i !== index));
  }

  return (
    <div className="space-y-6">
      {sets.map((set, i) => (
        <div key={i} className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-muted-foreground">
              Set {i + 1}
            </span>
            {sets.length > 1 && (
              <Button
                variant="ghost"
                size="icon"
                className="size-7"
                onClick={() => removeSet(i)}
              >
                <Trash2 className="size-3.5" />
              </Button>
            )}
          </div>
          <div className="flex items-center justify-center gap-6">
            {/* Team 1 score */}
            <div className="flex items-center gap-3">
              <Button
                variant="outline"
                size="icon"
                className="size-12 rounded-full"
                onClick={() => updateSet(i, "team1Score", -1)}
                disabled={set.team1Score <= 0}
              >
                <Minus className="size-5" />
              </Button>
              <span className="text-4xl font-heading font-bold tabular-nums w-12 text-center text-blue-500">
                {set.team1Score}
              </span>
              <Button
                variant="outline"
                size="icon"
                className="size-12 rounded-full"
                onClick={() => updateSet(i, "team1Score", 1)}
              >
                <Plus className="size-5" />
              </Button>
            </div>

            <span className="text-2xl text-muted-foreground font-heading">-</span>

            {/* Team 2 score */}
            <div className="flex items-center gap-3">
              <Button
                variant="outline"
                size="icon"
                className="size-12 rounded-full"
                onClick={() => updateSet(i, "team2Score", -1)}
                disabled={set.team2Score <= 0}
              >
                <Minus className="size-5" />
              </Button>
              <span className="text-4xl font-heading font-bold tabular-nums w-12 text-center text-orange-500">
                {set.team2Score}
              </span>
              <Button
                variant="outline"
                size="icon"
                className="size-12 rounded-full"
                onClick={() => updateSet(i, "team2Score", 1)}
              >
                <Plus className="size-5" />
              </Button>
            </div>
          </div>
        </div>
      ))}

      {sets.length < 5 && (
        <Button variant="outline" className="w-full" onClick={addSet}>
          + Añadir set
        </Button>
      )}
    </div>
  );
}
