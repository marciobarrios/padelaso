import Dexie, { type EntityTable } from "dexie";
import { Player, Match, MatchEvent } from "./types";

const db = new Dexie("padelaso") as Dexie & {
  players: EntityTable<Player, "id">;
  matches: EntityTable<Match, "id">;
  matchEvents: EntityTable<MatchEvent, "id">;
};

db.version(1).stores({
  players: "id, name, createdAt",
  matches: "id, date, createdAt",
  matchEvents: "id, matchId, playerId, type, createdAt",
});

export { db };
