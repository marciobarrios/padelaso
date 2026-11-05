import { buildPlayerMap, getSetWins } from "@padelaso/domain/matches";
import { EVENT_CONFIGS } from "@padelaso/domain/events";
import type { Match, Player } from "@padelaso/domain/types";

const date = "2026-11-04T18:00:00.000Z";
export const players: Player[] = [
  { id: "ana", name: "Ana", emoji: "🎾", groupId: "demo", createdAt: date },
  {
    id: "marcio",
    name: "Marcio",
    emoji: "⚡",
    groupId: "demo",
    createdAt: date,
  },
  { id: "lucia", name: "Lucía", emoji: "🔥", groupId: "demo", createdAt: date },
  { id: "pablo", name: "Pablo", emoji: "🚀", groupId: "demo", createdAt: date },
];
export const sampleMatch: Match = {
  id: "ejemplo",
  date,
  createdAt: date,
  groupId: "demo",
  courtNumber: 3,
  team1: ["ana", "marcio"],
  team2: ["lucia", "pablo"],
  sets: [
    { team1Score: 6, team2Score: 4 },
    { team1Score: 3, team2Score: 6 },
    { team1Score: 6, team2Score: 2 },
  ],
};
const playerMap = buildPlayerMap(players);
export const teamNames = [sampleMatch.team1, sampleMatch.team2].map((team) =>
  team.map((id) => playerMap.get(id)?.name).join(" y "),
);
export const setWins = getSetWins(sampleMatch.sets);
export const sampleEvents = EVENT_CONFIGS.filter((event) =>
  ["ace", "vibora", "globo"].includes(event.type),
);
