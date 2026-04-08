"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
} from "react";
import { createClient } from "./supabase";
import { Player, Match, MatchEvent, MatchVote, MatchId, Group, GroupMember, GroupId } from "./types";

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
    groupId: row.group_id as string,
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
    groupId: row.group_id as string,
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

function mapGroup(row: Record<string, unknown>): Group {
  return {
    id: row.id as string,
    name: row.name as string,
    emoji: row.emoji as string,
    inviteCode: row.invite_code as string,
    createdBy: row.created_by as string,
    createdAt: row.created_at as string,
  };
}

function mapMatchVote(row: Record<string, unknown>): MatchVote {
  return {
    id: row.id as string,
    matchId: row.match_id as string,
    voterPlayerId: row.voter_player_id as string,
    votedForPlayerId: row.voted_for_player_id as string,
    voteType: row.vote_type as string,
    createdAt: row.created_at as string,
  } as MatchVote;
}

function mapGroupMember(row: Record<string, unknown>): GroupMember {
  return {
    groupId: row.group_id as string,
    userId: row.user_id as string,
    role: row.role as "admin" | "member",
    joinedAt: row.joined_at as string,
  };
}

// ---------- Hooks ----------

const supabase = createClient();

// ---------- Group hooks ----------

export function useGroups(): { groups: Group[]; loaded: boolean } {
  const { refreshKey } = useDataRefresh();
  const [groups, setGroups] = useState<Group[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    supabase
      .from("groups")
      .select("*")
      .order("created_at")
      .then(({ data }) => {
        if (data) setGroups(data.map(mapGroup));
        setLoaded(true);
      });
  }, [refreshKey]);

  return { groups, loaded };
}

export function useGroupMembers(groupId: GroupId | undefined): GroupMember[] {
  const { refreshKey } = useDataRefresh();
  const [members, setMembers] = useState<GroupMember[]>([]);

  useEffect(() => {
    if (!groupId) return;
    supabase
      .from("group_members")
      .select("*")
      .eq("group_id", groupId)
      .order("joined_at")
      .then(({ data }) => {
        if (data) setMembers(data.map(mapGroupMember));
      });
  }, [groupId, refreshKey]);

  return members;
}

// ---------- Player/Match hooks (group-scoped) ----------

export function usePlayers(groupId?: GroupId): { players: Player[]; loaded: boolean } {
  const { refreshKey } = useDataRefresh();
  const [players, setPlayers] = useState<Player[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!groupId) {
      setPlayers([]);
      setLoaded(false);
      return;
    }
    supabase
      .from("players")
      .select("*")
      .eq("group_id", groupId)
      .order("name")
      .then(({ data }) => {
        if (data) setPlayers(data.map(mapPlayer));
        setLoaded(true);
      });
  }, [groupId, refreshKey]);

  return { players, loaded };
}

export function useMatches(groupId?: GroupId): { matches: Match[]; loaded: boolean } {
  const { refreshKey } = useDataRefresh();
  const [matches, setMatches] = useState<Match[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!groupId) {
      setMatches([]);
      setLoaded(false);
      return;
    }
    supabase
      .from("matches")
      .select("*")
      .eq("group_id", groupId)
      .order("created_at", { ascending: false })
      .then(({ data }) => {
        if (data) setMatches(data.map(mapMatch));
        setLoaded(true);
      });
  }, [groupId, refreshKey]);

  return { matches, loaded };
}

export function useMatch(id: MatchId): { match: Match | undefined; loaded: boolean } {
  const { refreshKey } = useDataRefresh();
  const [match, setMatch] = useState<Match | undefined>();
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    supabase
      .from("matches")
      .select("*")
      .eq("id", id)
      .single()
      .then(({ data }) => {
        setMatch(data ? mapMatch(data) : undefined);
        setLoaded(true);
      });
  }, [id, refreshKey]);

  return { match, loaded };
}

export function useMatchEvents(matchId: MatchId): { events: MatchEvent[]; loaded: boolean } {
  const { refreshKey } = useDataRefresh();
  const [events, setEvents] = useState<MatchEvent[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    supabase
      .from("match_events")
      .select("*")
      .eq("match_id", matchId)
      .then(({ data }) => {
        if (data) setEvents(data.map(mapMatchEvent));
        setLoaded(true);
      });
  }, [matchId, refreshKey]);

  return { events, loaded };
}

export function useMatchVotes(matchId: MatchId): MatchVote[] {
  const { refreshKey } = useDataRefresh();
  const [votes, setVotes] = useState<MatchVote[]>([]);

  useEffect(() => {
    supabase
      .from("match_votes")
      .select("*")
      .eq("match_id", matchId)
      .then(({ data }) => {
        if (data) setVotes(data.map(mapMatchVote));
      });
  }, [matchId, refreshKey]);

  return votes;
}

export function useAllMatchEvents(groupId?: GroupId): { events: MatchEvent[]; loaded: boolean } {
  const { refreshKey } = useDataRefresh();
  const [events, setEvents] = useState<MatchEvent[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!groupId) {
      setEvents([]);
      setLoaded(false);
      return;
    }
    supabase
      .from("match_events")
      .select("*, matches!inner(group_id)")
      .eq("matches.group_id", groupId)
      .then(({ data }) => {
        if (data) setEvents(data.map(mapMatchEvent));
        setLoaded(true);
      });
  }, [groupId, refreshKey]);

  return { events, loaded };
}

export function useAllMatchVotes(groupId?: GroupId): { votes: MatchVote[]; loaded: boolean } {
  const { refreshKey } = useDataRefresh();
  const [votes, setVotes] = useState<MatchVote[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!groupId) {
      setVotes([]);
      setLoaded(false);
      return;
    }
    supabase
      .from("matches")
      .select("id")
      .eq("group_id", groupId)
      .then(({ data: matches }) => {
        if (!matches || matches.length === 0) {
          setVotes([]);
          setLoaded(true);
          return;
        }
        const matchIds = matches.map((m) => m.id);
        supabase
          .from("match_votes")
          .select("*")
          .in("match_id", matchIds)
          .then(({ data }) => {
            if (data) setVotes(data.map(mapMatchVote));
            setLoaded(true);
          });
      });
  }, [groupId, refreshKey]);

  return { votes, loaded };
}

export function usePlayerMatches(playerId: string): { matches: Match[]; loaded: boolean } {
  const { refreshKey } = useDataRefresh();
  const [matches, setMatches] = useState<Match[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    supabase
      .from("matches")
      .select("*")
      .or(`team1.cs.{${playerId}},team2.cs.{${playerId}}`)
      .order("created_at", { ascending: false })
      .then(({ data }) => {
        if (data) setMatches(data.map(mapMatch));
        setLoaded(true);
      });
  }, [playerId, refreshKey]);

  return { matches, loaded };
}

export function usePlayerEvents(playerId: string): { events: MatchEvent[]; loaded: boolean } {
  const { refreshKey } = useDataRefresh();
  const [events, setEvents] = useState<MatchEvent[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    supabase
      .from("match_events")
      .select("*")
      .eq("player_id", playerId)
      .then(({ data }) => {
        if (data) setEvents(data.map(mapMatchEvent));
        setLoaded(true);
      });
  }, [playerId, refreshKey]);

  return { events, loaded };
}
