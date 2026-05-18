"use client";

import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

export type TimeRange = "all" | "90d" | "30d";

interface TimeRangeFilterProps {
  value: TimeRange;
  onChange: (value: TimeRange) => void;
}

const OPTIONS: { value: TimeRange; label: string }[] = [
  { value: "all", label: "Todo" },
  { value: "90d", label: "90 días" },
  { value: "30d", label: "30 días" },
];

export function TimeRangeFilter({ value, onChange }: TimeRangeFilterProps) {
  return (
    <Tabs value={value} onValueChange={(next) => onChange(next as TimeRange)}>
      <TabsList className="w-full">
        {OPTIONS.map((opt) => (
          <TabsTrigger key={opt.value} value={opt.value}>
            {opt.label}
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  );
}
