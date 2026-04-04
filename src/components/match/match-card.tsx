"use client";

import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Player, Match } from "@/lib/types";
import { PlayerAvatar } from "@/components/players/player-avatar";

interface MatchCardProps {
  match: Match;
  players: Player[];
}

export function MatchCard({ match, players }: MatchCardProps) {
  const playerMap = new Map(players.map((p) => [p.id, p]));
  const team1Players = match.team1.map((id) => playerMap.get(id));
  const team2Players = match.team2.map((id) => playerMap.get(id));

  const team1Total = match.sets.reduce((s, set) => s + set.team1Score, 0);
  const team2Total = match.sets.reduce((s, set) => s + set.team2Score, 0);
  const team1Won = match.sets.filter((s) => s.team1Score > s.team2Score).length;
  const team2Won = match.sets.filter((s) => s.team2Score > s.team1Score).length;

  return (
    <Link href={`/matches/${match.id}`}>
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
            {/* Team 1 */}
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

            {/* Score */}
            <div className="flex items-center gap-1 font-heading text-lg font-bold tabular-nums">
              <span className={team1Won > team2Won ? "text-primary" : ""}>
                {team1Total}
              </span>
              <span className="text-muted-foreground">-</span>
              <span className={team2Won > team1Won ? "text-primary" : ""}>
                {team2Total}
              </span>
            </div>

            {/* Team 2 */}
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

          {/* Set scores */}
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
