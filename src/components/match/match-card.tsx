"use client";

import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Player, Match, PlayerId } from "@/lib/types";
import { PlayerAvatar } from "@/components/players/player-avatar";
import { getSetWins } from "@/lib/utils";

interface MatchCardProps {
  match: Match;
  playerMap: Map<PlayerId, Player>;
}

export function MatchCard({ match, playerMap }: MatchCardProps) {
  const team1Players = match.team1.map((id) => playerMap.get(id));
  const team2Players = match.team2.map((id) => playerMap.get(id));

  const team1Total = match.sets.reduce((s, set) => s + set.team1Score, 0);
  const team2Total = match.sets.reduce((s, set) => s + set.team2Score, 0);
  const { team1Wins, team2Wins } = getSetWins(match.sets);

  return (
    <Link href={`/matches/${match.id}`} className="block">
      <Card className="hover:bg-muted/30 transition-colors">
        <CardContent className="p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-muted-foreground">
              {new Date(match.date).toLocaleDateString("es-ES", {
                weekday: "short",
                day: "numeric",
                month: "short",
              })}
            </span>
            {match.courtNumber && (
              <span className="text-xs text-muted-foreground">
                Pista {match.courtNumber}
              </span>
            )}
          </div>

          <div className="flex items-center gap-3">
            <div className="flex-1 flex items-center gap-2">
              <div className="flex -space-x-2">
                {team1Players.map(
                  (p, i) =>
                    p && (
                      <PlayerAvatar key={i} emoji={p.emoji} name={p.name} size="sm" />
                    )
                )}
              </div>
              <div className="text-sm truncate">
                {team1Players.map((p) => p?.name ?? "?").join(" · ")}
              </div>
            </div>

            <div className="flex items-center gap-1 font-heading text-lg font-bold tabular-nums">
              <span className={team1Wins > team2Wins ? "text-primary" : ""}>
                {team1Total}
              </span>
              <span className="text-muted-foreground">-</span>
              <span className={team2Wins > team1Wins ? "text-primary" : ""}>
                {team2Total}
              </span>
            </div>

            <div className="flex-1 flex items-center gap-2 justify-end">
              <div className="text-sm truncate text-right">
                {team2Players.map((p) => p?.name ?? "?").join(" · ")}
              </div>
              <div className="flex -space-x-2">
                {team2Players.map(
                  (p, i) =>
                    p && (
                      <PlayerAvatar key={i} emoji={p.emoji} name={p.name} size="sm" />
                    )
                )}
              </div>
            </div>
          </div>

          <div className="flex justify-center gap-3 mt-2">
            {match.sets.map((set, i) => (
              <span
                key={i}
                className="text-xs text-muted-foreground tabular-nums"
              >
                {set.team1Score}-{set.team2Score}
              </span>
            ))}
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
