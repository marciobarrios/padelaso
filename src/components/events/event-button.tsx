"use client";

import { useState } from "react";
import { EventConfig } from "@/lib/event-config";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface EventButtonProps {
  config: EventConfig;
  count: number;
  onPress: () => void;
}

export function EventButton({ config, count, onPress }: EventButtonProps) {
  const [pressed, setPressed] = useState(false);

  function handlePress() {
    setPressed(true);
    onPress();
    setTimeout(() => setPressed(false), 200);
  }

  return (
    <button
      type="button"
      onClick={handlePress}
      className={cn(
        "relative flex flex-col items-center justify-center gap-1 p-3 rounded-xl border border-border transition-all duration-200 active:scale-95",
        pressed && "scale-95 bg-primary/10",
        "hover:bg-muted/50"
      )}
    >
      <span className="text-3xl">{config.emoji}</span>
      <span className="text-[10px] leading-tight text-muted-foreground text-center line-clamp-1">
        {config.label}
      </span>
      {count > 0 && (
        <Badge
          variant="secondary"
          className="absolute -top-1.5 -right-1.5 size-5 p-0 flex items-center justify-center text-[10px]"
        >
          {count}
        </Badge>
      )}
    </button>
  );
}
