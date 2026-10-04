"use client";

import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Player, Match, PlayerId } from "@padelaso/domain/types";
import { PlayerAvatar } from "@/components/players/player-avatar";
import { DeletedPlayerAvatar } from "@/components/players/deleted-player-avatar";
import { getSetWins, dateFormatter } from "@/lib/utils";
import { getMatchTeamLabel, getMatchTeamSlots } from "@/lib/match-team";

interface MatchCardProps {
  match: Match;
  playerMap: Map<PlayerId, Player>;
  highlightPlayerId?: PlayerId;
}

export function MatchCard({ match, playerMap, highlightPlayerId }: MatchCardProps) {
  const team1Slots = getMatchTeamSlots(match.team1, playerMap);
  const team2Slots = getMatchTeamSlots(match.team2, playerMap);

  let creatorName: string | undefined;
  if (match.createdBy) {
    for (const p of playerMap.values()) {
      if (p.userId === match.createdBy) { creatorName = p.name; break; }
    }
  }

  const team1Total = match.sets.reduce((s, set) => s + set.team1Score, 0);
  const team2Total = match.sets.reduce((s, set) => s + set.team2Score, 0);
  const { team1Wins, team2Wins } = getSetWins(match.sets);

  // When highlighting a player, show losing score in red
  const showLossColor = highlightPlayerId && team1Wins !== team2Wins;
  const highlightInTeam1 = highlightPlayerId
    ? match.team1.includes(highlightPlayerId)
    : false;
  const team1Won = team1Wins > team2Wins;

  function scoreClass(isTeam1Score: boolean): string {
    if (showLossColor) {
      // From the highlighted player's perspective: only color their team's score
      const isPlayerTeam = isTeam1Score ? highlightInTeam1 : !highlightInTeam1;
      if (!isPlayerTeam) return "";
      const playerWon = highlightInTeam1 ? team1Won : !team1Won;
      return playerWon ? "text-primary" : "text-destructive";
    }
    // Default: highlight the winner in green
    if (team1Wins === team2Wins) return "";
    const isWinningTeam = isTeam1Score ? team1Won : !team1Won;
    return isWinningTeam ? "text-primary" : "";
  }

  return (
    <Link href={`/matches/${match.id}`} className="block">
      <Card className="hover:bg-muted/30 transition-colors">
        <CardContent className="p-3 sm:p-4">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs text-muted-foreground">
              {dateFormatter.format(new Date(match.date))}
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
                {team1Slots.map(({ id, player }, i) =>
                  player ? (
                    <PlayerAvatar
                      key={id ?? i}
                      emoji={player.emoji}
                      name={player.name}
                      size="sm"
                    />
                  ) : (
                    <DeletedPlayerAvatar key={id ?? `deleted-${i}`} />
                  ),
                )}
              </div>
              <div className="text-sm">
                {getMatchTeamLabel(team1Slots)}
              </div>
            </div>

            {/* Score */}
            <div className="flex items-center gap-1 font-heading text-lg font-bold tabular-nums">
              <span className={scoreClass(true)}>{team1Total}</span>
              <span className="text-muted-foreground">-</span>
              <span className={scoreClass(false)}>{team2Total}</span>
            </div>

            {/* Team 2 */}
            <div className="flex-1 space-y-1 text-right">
              <div className="flex items-center gap-1 justify-end">
                {team2Slots.map(({ id, player }, i) =>
                  player ? (
                    <PlayerAvatar
                      key={id ?? i}
                      emoji={player.emoji}
                      name={player.name}
                      size="sm"
                    />
                  ) : (
                    <DeletedPlayerAvatar key={id ?? `deleted-${i}`} />
                  ),
                )}
              </div>
              <div className="text-sm">
                {getMatchTeamLabel(team2Slots)}
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
