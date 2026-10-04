import { Player, PlayerId } from "@padelaso/domain/types";

export const DELETED_PLAYER_LABEL = "[Jugador eliminado]";

export interface MatchTeamSlot {
  id: PlayerId | null;
  player: Player | null;
}

/**
 * Matches are created as two-player teams. Player deletion removes the player
 * ID from the stored team, so pad shortened teams with an explicit historical
 * placeholder instead of presenting them as one-player matches.
 *
 * Missing player records are handled the same way for older rows that still
 * contain an ID whose player no longer exists.
 */
export function getMatchTeamSlots(
  team: PlayerId[],
  playerMap: Map<PlayerId, Player>,
): MatchTeamSlot[] {
  const slots: MatchTeamSlot[] = team.map((id) => ({
    id,
    player: playerMap.get(id) ?? null,
  }));

  while (slots.length < 2) {
    slots.push({ id: null, player: null });
  }

  return slots;
}

export function getMatchTeamLabel(slots: MatchTeamSlot[]): string {
  return slots
    .map(({ player }) => player?.name ?? DELETED_PLAYER_LABEL)
    .join(" · ");
}
