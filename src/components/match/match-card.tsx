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

  const creatorName = match.createdBy
    ? [...playerMap.values()].find((p) => p.userId === match.createdBy)?.name
    : undefined;

  const team1Total = match.sets.reduce((s, set) => s + set.team1Score, 0);
  const team2Total = match.sets.reduce((s, set) => s + set.team2Score, 0);
  const { team1Wins, team2Wins } = getSetWins(match.sets);

  return (
    <Link href={`/matches/${match.id}`} className="block">
      <Card className="hover:bg-muted/30 transition-colors">
        <CardContent className="p-3 sm:p-4">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs text-muted-foreground">
              {new Date(match.date).toLocaleDateString("es-ES", {
                weekday: "long",
                day: "numeric",
                month: "long",
              })}
              {creatorName && `. Creado por ${creatorName}`}
            </span>
            {match.courtNumber && (
              <span className="text-xs text-muted-foreground">
                Pista {match.courtNumber}
              </span>
            )}
          </div>

          <div className="flex items-center">
            {/* Team 1 */}
            <div className="flex-1 space-y-1">
              <div className="flex items-center gap-1">
                {team1Players.map(
                  (p, i) =>
                    p && (
                      <PlayerAvatar key={i} emoji={p.emoji} name={p.name} size="sm" />
                    )
                )}
              </div>
              <div className="text-sm">
                {team1Players.map((p) => p?.name ?? "?").join(" · ")}
              </div>
            </div>

            {/* Score */}
            <div className="flex items-center gap-1 font-heading text-lg font-bold tabular-nums">
              <span className={team1Wins > team2Wins ? "text-primary" : ""}>
                {team1Total}
              </span>
              <span className="text-muted-foreground">-</span>
              <span className={team2Wins > team1Wins ? "text-primary" : ""}>
                {team2Total}
              </span>
            </div>

            {/* Team 2 */}
            <div className="flex-1 space-y-1 text-right">
              <div className="flex items-center gap-1 justify-end">
                {team2Players.map(
                  (p, i) =>
                    p && (
                      <PlayerAvatar key={i} emoji={p.emoji} name={p.name} size="sm" />
                    )
                )}
              </div>
              <div className="text-sm">
                {team2Players.map((p) => p?.name ?? "?").join(" · ")}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap justify-center mt-2">
            {match.sets.map((set, i) => (
              <span
                key={i}
                className="text-xs text-muted-foreground tabular-nums"
              >
                {i > 0 && <span className="mx-1">·</span>}
                Set {i + 1}: {set.team1Score}-{set.team2Score}
              </span>
            ))}
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
