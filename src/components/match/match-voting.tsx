"use client";

import { useState } from "react";
import { PlayerAvatar } from "@/components/players/player-avatar";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Check } from "lucide-react";
import { invalidate, keys } from "@/lib/db-hooks";
import { castMatchVote, removeMatchVote } from "@/lib/supabase-mutations";
import { Match, MatchVote, Player, PlayerId } from "@/lib/types";
import { VoteConfig } from "@/lib/event-config";
import { cn } from "@/lib/utils";

const MIN_VOTES_FOR_WINNER = 3;

interface MatchVotingProps {
  match: Match;
  votes: MatchVote[];
  players: Player[];
  currentUserPlayerId: PlayerId | null;
  config: VoteConfig;
}

export function MatchVoting({
  match,
  votes,
  players,
  currentUserPlayerId,
  config,
}: MatchVotingProps) {

  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [isChangingVote, setIsChangingVote] = useState(false);

  const matchPlayerIds = [...match.team1, ...match.team2];
  const matchPlayers = matchPlayerIds
    .map((id) => players.find((p) => p.id === id))
    .filter(Boolean) as Player[];

  // Filter votes for this category
  const categoryVotes = votes.filter((v) => v.voteType === config.type);
  const totalVotes = categoryVotes.length;

  // Current user's vote in this category
  const myVote = currentUserPlayerId
    ? categoryVotes.find((v) => v.voterPlayerId === currentUserPlayerId)
    : null;

  // Can the current user vote? Must be a match participant with a linked account
  const canVote =
    currentUserPlayerId !== null &&
    matchPlayerIds.includes(currentUserPlayerId);

  // Tally: count votes per player
  const tally = new Map<PlayerId, number>();
  for (const v of categoryVotes) {
    tally.set(v.votedForPlayerId, (tally.get(v.votedForPlayerId) ?? 0) + 1);
  }

  // Determine winner(s) only when >= MIN_VOTES_FOR_WINNER votes are in
  const hasEnoughVotes = totalVotes >= MIN_VOTES_FOR_WINNER;
  const maxVoteCount = hasEnoughVotes ? Math.max(0, ...tally.values()) : 0;
  const winnerIds = hasEnoughVotes
    ? [...tally.entries()]
        .filter(([, count]) => count === maxVoteCount)
        .map(([id]) => id)
    : [];

  async function handleVote(playerId: PlayerId) {
    if (!currentUserPlayerId || loading) return;
    setLoading(true);
    try {
      if (myVote && myVote.votedForPlayerId === playerId) {
        // Tapping the same player retracts the vote
        await removeMatchVote(match.id, currentUserPlayerId, config.type);
      } else {
        await castMatchVote(
          match.id,
          currentUserPlayerId,
          playerId,
          config.type,
        );
      }
      invalidate(keys.matchVotes(match.id));
      setIsChangingVote(false);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <button
        className="flex items-center gap-2 mb-3 w-full text-left"
        onClick={() => setExpanded(!expanded)}
      >
        <span className="text-lg">{config.emoji}</span>
        <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
          {config.type === "mvp"
            ? !hasEnoughVotes || winnerIds.length === 0
              ? "Elige MVP"
              : "MVP"
            : config.label}
        </h3>
        <span
          className={cn(
            "text-muted-foreground text-xs transition-transform",
            expanded && "rotate-180",
          )}
        >
          ▾
        </span>
        {hasEnoughVotes && winnerIds.length > 0 && (
          <span className="ml-auto text-sm font-medium text-primary">
            {winnerIds
              .map((id) => matchPlayers.find((p) => p.id === id)?.name)
              .join(", ")}
          </span>
        )}
        {!hasEnoughVotes && totalVotes > 0 && (
          <span className="ml-auto text-xs text-muted-foreground">
            {totalVotes}/4 {totalVotes === 1 ? "voto" : "votos"}
          </span>
        )}
      </button>

      {expanded && (
        <Card>
          <CardContent className="p-4">
            {/* Voting cards */}
            {canVote && (!hasEnoughVotes || isChangingVote) && (
              <div className="grid grid-cols-2 gap-2 mb-3">
                {matchPlayers.map((player) => {
                  const isMyChoice = myVote?.votedForPlayerId === player.id;
                  const playerVoteCount = tally.get(player.id) ?? 0;
                  return (
                    <button
                      key={player.id}
                      disabled={loading}
                      onClick={() => handleVote(player.id)}
                      className={cn(
                        "flex items-center gap-2 rounded-lg border p-3 transition-colors text-left",
                        isMyChoice
                          ? "border-primary bg-primary/10"
                          : "border-border hover:border-muted-foreground/50",
                      )}
                    >
                      <PlayerAvatar
                        emoji={player.emoji}
                        name={player.name}
                        size="sm"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium truncate">
                          {player.name}
                        </div>
                        {playerVoteCount > 0 && (
                          <div className="text-xs text-muted-foreground">
                            {playerVoteCount}{" "}
                            {playerVoteCount === 1 ? "voto" : "votos"}
                          </div>
                        )}
                      </div>
                      {isMyChoice && (
                        <Check className="size-4 text-primary shrink-0" />
                      )}
                    </button>
                  );
                })}
              </div>
            )}

            {/* Results view (read-only or after enough votes) */}
            {(!canVote || (hasEnoughVotes && !isChangingVote)) && (
              <div className="space-y-2">
                {matchPlayers.map((player) => {
                  const playerVoteCount = tally.get(player.id) ?? 0;
                  const isWinner = winnerIds.includes(player.id);
                  return (
                    <div
                      key={player.id}
                      className={cn(
                        "flex items-center gap-2 rounded-lg p-2",
                        isWinner && "bg-primary/10",
                      )}
                    >
                      <PlayerAvatar
                        emoji={player.emoji}
                        name={player.name}
                        size="sm"
                      />
                      <span
                        className={cn(
                          "text-sm flex-1",
                          isWinner && "font-medium text-primary",
                        )}
                      >
                        {player.name}
                      </span>
                      {isWinner && (
                        <span className="text-sm">{config.emoji}</span>
                      )}
                      <span className="text-sm text-muted-foreground tabular-nums">
                        {playerVoteCount}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Voting still possible: show "change vote" hint */}
            {canVote && hasEnoughVotes && !isChangingVote && myVote && (
              <Button
                variant="ghost"
                size="sm"
                className="mt-2 w-full"
                onClick={() => setIsChangingVote(true)}
                disabled={loading}
              >
                Cambiar voto
              </Button>
            )}

            {/* Progress indicator when not enough votes */}
            {canVote && !hasEnoughVotes && totalVotes > 0 && (
              <p className="text-xs text-center text-muted-foreground">
                Se necesitan {MIN_VOTES_FOR_WINNER} votos para declarar ganador
              </p>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
