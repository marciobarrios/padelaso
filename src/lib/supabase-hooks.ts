"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
} from "react";
import { createClient } from "./supabase";
import { Player, Match, MatchEvent, MatchId } from "./types";

// ---------- Data refresh context ----------

interface DataContextValue {
  refreshKey: number;
  refresh: () => void;
}

export const DataContext = createContext<DataContextValue>({
  refreshKey: 0,
  refresh: () => {},
});

export function useDataRefresh() {
  return useContext(DataContext);
}

// ---------- Row mappers (snake_case → camelCase) ----------

function mapPlayer(row: Record<string, unknown>): Player {
  return {
    id: row.id as string,
    name: row.name as string,
    emoji: row.emoji as string,
    userId: (row.user_id as string) ?? null,
    createdBy: row.created_by as string,
    createdAt: row.created_at as string,
  };
}

function mapMatch(row: Record<string, unknown>): Match {
  return {
    id: row.id as string,
    date: row.date as string,
    courtNumber: (row.court_number as number) ?? null,
    team1: row.team1 as string[],
    team2: row.team2 as string[],
    sets: row.sets as Match["sets"],
    createdBy: row.created_by as string,
    createdAt: row.created_at as string,
  };
}

function mapMatchEvent(row: Record<string, unknown>): MatchEvent {
  return {
    id: row.id as string,
    matchId: row.match_id as string,
    playerId: row.player_id as string,
    type: row.type as string,
    createdBy: row.created_by as string,
    createdAt: row.created_at as string,
  } as MatchEvent;
}

// ---------- Hooks ----------

const supabase = createClient();

export function usePlayers(): Player[] {
  const { refreshKey } = useDataRefresh();
  const [players, setPlayers] = useState<Player[]>([]);

  useEffect(() => {
    supabase
      .from("players")
      .select("*")
      .order("name")
      .then(({ data }) => {
        if (data) setPlayers(data.map(mapPlayer));
      });
  }, [refreshKey]);

  return players;
}

export function useMatches(): Match[] {
  const { refreshKey } = useDataRefresh();
  const [matches, setMatches] = useState<Match[]>([]);

  useEffect(() => {
    supabase
      .from("matches")
      .select("*")
      .order("created_at", { ascending: false })
      .then(({ data }) => {
        if (data) setMatches(data.map(mapMatch));
      });
  }, [refreshKey]);

  return matches;
}

export function useMatch(id: MatchId): Match | undefined {
  const { refreshKey } = useDataRefresh();
  const [match, setMatch] = useState<Match | undefined>();

  useEffect(() => {
    supabase
      .from("matches")
      .select("*")
      .eq("id", id)
      .single()
      .then(({ data }) => {
        setMatch(data ? mapMatch(data) : undefined);
      });
  }, [id, refreshKey]);

  return match;
}

export function useMatchEvents(matchId: MatchId): MatchEvent[] {
  const { refreshKey } = useDataRefresh();
  const [events, setEvents] = useState<MatchEvent[]>([]);

  useEffect(() => {
    supabase
      .from("match_events")
      .select("*")
      .eq("match_id", matchId)
      .then(({ data }) => {
        if (data) setEvents(data.map(mapMatchEvent));
      });
  }, [matchId, refreshKey]);

  return events;
}

export function useAllMatchEvents(): MatchEvent[] {
  const { refreshKey } = useDataRefresh();
  const [events, setEvents] = useState<MatchEvent[]>([]);

  useEffect(() => {
    supabase
      .from("match_events")
      .select("*")
      .then(({ data }) => {
        if (data) setEvents(data.map(mapMatchEvent));
      });
  }, [refreshKey]);

  return events;
}

export function usePlayerMatches(playerId: string): Match[] {
  const { refreshKey } = useDataRefresh();
  const [matches, setMatches] = useState<Match[]>([]);

  useEffect(() => {
    supabase
      .from("matches")
      .select("*")
      .or(`team1.cs.{${playerId}},team2.cs.{${playerId}}`)
      .order("created_at", { ascending: false })
      .then(({ data }) => {
        if (data) setMatches(data.map(mapMatch));
      });
  }, [playerId, refreshKey]);

  return matches;
}

export function usePlayerEvents(playerId: string): MatchEvent[] {
  const { refreshKey } = useDataRefresh();
  const [events, setEvents] = useState<MatchEvent[]>([]);

  useEffect(() => {
    supabase
      .from("match_events")
      .select("*")
      .eq("player_id", playerId)
      .then(({ data }) => {
        if (data) setEvents(data.map(mapMatchEvent));
      });
  }, [playerId, refreshKey]);

  return events;
}
