"use client";

import { Check, Monitor, Palette } from "lucide-react";
import { usePathname, useSearchParams } from "next/navigation";
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "@/components/ui/drawer";
import { cn } from "@/lib/utils";
import { useTheme } from "./theme-provider";
import { THEME_OPTIONS, type ThemeOption } from "./themes";

export function ThemeSwitcher() {
  const { preference, setPreference } = useTheme();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // Hide the floating trigger while the pinned scorer is active — it
  // overlays the full-screen scoreboard and distracts during a live match.
  const inPinnedScorer =
    pathname?.endsWith("/scorekeeper") === true &&
    searchParams.get("pinned") === "1";
  if (inPinnedScorer) return null;

  return (
    <Drawer>
      <div className="pointer-events-none fixed inset-x-0 z-50 flex justify-end px-2 top-[max(0.5rem,env(safe-area-inset-top))]">
        <div className="pointer-events-none mx-auto flex w-full max-w-lg justify-end">
          <DrawerTrigger asChild>
            <button
              type="button"
              aria-label="Cambiar tema"
              className="pointer-events-auto flex size-9 items-center justify-center rounded-full bg-background/80 text-foreground shadow-sm ring-1 ring-border backdrop-blur transition-colors hover:bg-muted"
            >
              <Palette className="size-4" />
            </button>
          </DrawerTrigger>
        </div>
      </div>
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle>Tema</DrawerTitle>
        </DrawerHeader>
        <div className="grid min-h-0 flex-1 auto-rows-max grid-cols-1 gap-2 overflow-y-auto px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] sm:grid-cols-2">
          {THEME_OPTIONS.map((option) => (
            <DrawerClose key={option.id} asChild>
              <button
                type="button"
                onClick={() => setPreference(option.id)}
                className={cn(
                  "flex items-center gap-3 rounded-xl border-2 p-3 text-left transition-all",
                  preference === option.id
                    ? "border-primary bg-primary/10"
                    : "border-border hover:bg-muted/50",
                )}
              >
                <ThemePreview option={option} />
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate font-medium">{option.label}</span>
                  {option.hint && (
                    <span className="truncate text-xs text-muted-foreground">
                      {option.hint}
                    </span>
                  )}
                </span>
                {preference === option.id && (
                  <Check className="size-4 shrink-0 text-primary" />
                )}
              </button>
            </DrawerClose>
          ))}
        </div>
      </DrawerContent>
    </Drawer>
  );
}

function ThemePreview({ option }: { option: ThemeOption }) {
  if (option.id === "system") {
    return (
      <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
        <Monitor className="size-5" />
      </span>
    );
  }

  return (
    <span
      data-theme={option.id}
      className="flex size-10 shrink-0 overflow-hidden rounded-lg ring-1 ring-border"
      aria-hidden="true"
    >
      <span className="flex-1" style={{ background: "var(--background)" }} />
      <span className="flex-1" style={{ background: "var(--primary)" }} />
      <span className="flex-1" style={{ background: "var(--accent)" }} />
    </span>
  );
}
