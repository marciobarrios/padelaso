"use client";

import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { createClient } from "./supabase";
import { Player, Match, MatchEvent, MatchVote, MatchId, Group, GroupMember, GroupId } from "./types";
import {
  mapPlayer,
  mapMatch,
  mapMatchEvent,
  mapGroup,
  mapMatchVote,
  mapGroupMember,
} from "./mappers";

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

// ---------- Hooks ----------

let _supabase: ReturnType<typeof createClient>;
function getSupabase() {
  if (!_supabase) _supabase = createClient();
  return _supabase;
}

// ---------- Group hooks ----------

export function useGroups(initialData?: Group[]): { groups: Group[]; loaded: boolean } {
  const { refreshKey } = useDataRefresh();
  const hasInitialData = (initialData?.length ?? 0) > 0;
  const [groups, setGroups] = useState<Group[]>(initialData ?? []);
  const [loaded, setLoaded] = useState(hasInitialData);
  const skipInitialFetch = useRef(hasInitialData);

  useEffect(() => {
    if (skipInitialFetch.current) {
      skipInitialFetch.current = false;
      return;
    }
    getSupabase()
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
    getSupabase()
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
    getSupabase()
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
    getSupabase()
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
    getSupabase()
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
    getSupabase()
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
    getSupabase()
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
    getSupabase()
      .from("match_events")
      .select("id, match_id, player_id, type, created_by, created_at, matches!inner(group_id)")
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
    getSupabase()
      .from("match_votes")
      .select("id, match_id, voter_player_id, voted_for_player_id, vote_type, created_at, matches!inner(group_id)")
      .eq("matches.group_id", groupId)
      .then(({ data }) => {
        if (data) setVotes(data.map(mapMatchVote));
        setLoaded(true);
      });
  }, [groupId, refreshKey]);

  return { votes, loaded };
}

export function usePlayerMatches(playerId: string): { matches: Match[]; loaded: boolean } {
  const { refreshKey } = useDataRefresh();
  const [matches, setMatches] = useState<Match[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    getSupabase()
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
    getSupabase()
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
