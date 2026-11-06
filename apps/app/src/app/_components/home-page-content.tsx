"use client";

import Link from "next/link";
import { Plus, RefreshCw } from "lucide-react";
import type { GroupId } from "@padelaso/domain/types";
import { Button } from "@/components/ui/button";
import { MatchCard } from "@/components/match/match-card";
import { useMatches, usePlayers } from "@/lib/db-hooks";
import { useGroup } from "@/components/group/group-provider";
import { buildPlayerMap } from "@/lib/utils";
import { HomePageSkeleton } from "@/components/layout/skeletons";
import { usePullToRefresh } from "./use-pull-to-refresh";

const REFRESH_MESSAGES = {
  idle: "",
  pulling: "Desliza para actualizar",
  ready: "Suelta para actualizar",
  refreshing: "Actualizando…",
  success: "Inicio actualizado",
  error: "No se pudo actualizar. Inténtalo de nuevo.",
};

export function HomePageContent() {
  const { activeGroup } = useGroup();
  return <HomeGroupContent key={activeGroup?.id} groupId={activeGroup?.id} />;
}

function HomeGroupContent({ groupId }: { groupId?: GroupId }) {
  const { matches, loaded: matchesLoaded, refresh: refreshMatches } = useMatches(groupId);
  const { players, loaded: playersLoaded, refresh: refreshPlayers } = usePlayers(groupId);
  const { containerRef, indicatorRef, status, refresh, refreshing } = usePullToRefresh(
    async () => {
      const results = await Promise.allSettled([refreshMatches(), refreshPlayers()]);
      if (results.some((result) => result.status === "rejected")) throw new Error("Refresh failed");
    },
    !!groupId && matchesLoaded && playersLoaded,
  );
  const playerMap = buildPlayerMap(players);

  if (!matchesLoaded || !playersLoaded) {
    return <HomePageSkeleton />;
  }

  return (
    <div ref={containerRef} className="relative max-w-lg mx-auto min-h-[calc(100dvh-7rem)] px-4 pt-6">
      <div
        ref={indicatorRef}
        aria-hidden="true"
        className="home-refresh-indicator pointer-events-none absolute top-0 inset-x-0 z-10 flex justify-center opacity-0"
      >
        <div className="flex h-11 items-center gap-2 rounded-full border border-border bg-background px-4 text-xs text-primary shadow-sm">
          <RefreshCw className={refreshing ? "size-4 motion-safe:animate-spin" : "size-4"} />
          {REFRESH_MESSAGES[status]}
        </div>
      </div>
      <p role="status" className={status === "error" ? "mb-3 text-sm text-destructive" : "sr-only"}>
        {REFRESH_MESSAGES[status]}
      </p>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold font-heading">Padelaso</h1>
          <p className="text-sm text-muted-foreground">
            {matches.length} partido{matches.length !== 1 ? "s" : ""} ·{" "}
            {players.length} jugador{players.length !== 1 ? "es" : ""}
          </p>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="size-11 shrink-0"
          aria-label="Actualizar inicio"
          aria-busy={refreshing}
          disabled={refreshing}
          onClick={() => void refresh()}
        >
          <RefreshCw aria-hidden="true" className={refreshing ? "size-5 motion-safe:animate-spin" : "size-5"} />
        </Button>
      </div>

      <Link href="/matches/new">
        <Button size="lg" className="w-full text-lg h-14 mb-8">
          <Plus className="size-5 mr-2" />
          Nuevo partido
        </Button>
      </Link>

      {matches.length > 0 ? (
        <div>
          <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-3">
            Partidos
          </h2>
          <div className="space-y-6">
            {matches.slice(0, 10).map((match) => (
              <MatchCard key={match.id} match={match} playerMap={playerMap} />
            ))}
          </div>
        </div>
      ) : (
        <div className="text-center py-16 text-muted-foreground">
          <p className="text-4xl mb-4">🎾</p>
          <p>No hay partidos todavía.</p>
          <p className="text-sm">¡Crea tu primer partido!</p>
        </div>
      )}
    </div>
  );
}
