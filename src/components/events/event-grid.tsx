"use client";

import { EVENT_CONFIGS, EventConfig } from "@/lib/event-config";
import { MatchEventType } from "@/lib/types";
import { EventButton } from "./event-button";

interface EventGridProps {
  counts: Map<MatchEventType, number>;
  onSelect: (type: MatchEventType) => void;
}

export function EventGrid({ counts, onSelect }: EventGridProps) {
  return (
    <div className="grid grid-cols-3 gap-2">
      {EVENT_CONFIGS.map((config: EventConfig) => (
        <EventButton
          key={config.type}
          config={config}
          count={counts.get(config.type) ?? 0}
          onPress={() => onSelect(config.type)}
        />
      ))}
    </div>
  );
}
