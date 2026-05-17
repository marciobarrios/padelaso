"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { Group } from "@/lib/types";
import { useGroups } from "@/lib/db-hooks";
import { ACTIVE_GROUP_COOKIE, setActiveGroupCookie } from "@/lib/active-group-cookie";

const STORAGE_KEY = ACTIVE_GROUP_COOKIE;

interface GroupContextValue {
  groups: Group[];
  activeGroup: Group | null;
  setActiveGroup: (group: Group) => void;
  setActiveGroupId: (id: string) => void;
  loading: boolean;
}

const GroupContext = createContext<GroupContextValue | null>(null);

interface GroupProviderProps {
  children: React.ReactNode;
  initialGroups?: Group[];
  initialActiveGroupId?: string | null;
}

export function GroupProvider({
  children,
  initialGroups,
  initialActiveGroupId,
}: GroupProviderProps) {
  const { groups: fetchedGroups, loaded: groupsLoaded } = useGroups(initialGroups);
  const [optimisticGroup, setOptimisticGroup] = useState<Group | null>(null);
  const [activeGroupId, setActiveGroupIdState] = useState<string | null>(
    initialActiveGroupId ?? null
  );
  // If the server provided an active group ID, we're already initialized
  const [initialized, setInitialized] = useState(!!initialActiveGroupId);

  // Merge fetched groups with optimistic group (if not yet in fetched list)
  const groups = useMemo(
    () =>
      optimisticGroup && !fetchedGroups.some((g) => g.id === optimisticGroup.id)
        ? [...fetchedGroups, optimisticGroup]
        : fetchedGroups,
    [fetchedGroups, optimisticGroup]
  );

  // Clear optimistic group once it appears in fetched data
  useEffect(() => {
    if (optimisticGroup && fetchedGroups.some((g) => g.id === optimisticGroup.id)) {
      queueMicrotask(() => setOptimisticGroup(null));
    }
  }, [fetchedGroups, optimisticGroup]);

  // Load from localStorage on mount (fallback when no server cookie)
  useEffect(() => {
    if (initialized) return;
    const stored = localStorage.getItem(STORAGE_KEY);
    queueMicrotask(() => {
      if (stored) setActiveGroupIdState(stored);
      setInitialized(true);
    });
  }, [initialized]);

  // Once groups load, validate/set the active group
  useEffect(() => {
    if (!initialized || groups.length === 0) return;

    const validGroup = groups.find((g) => g.id === activeGroupId);
    if (!validGroup) {
      const firstId = groups[0].id;
      queueMicrotask(() => {
        setActiveGroupIdState(firstId);
        localStorage.setItem(STORAGE_KEY, firstId);
        setActiveGroupCookie(firstId);
      });
    }
  }, [groups, activeGroupId, initialized]);

  function setActiveGroupId(id: string) {
    setActiveGroupIdState(id);
    localStorage.setItem(STORAGE_KEY, id);
    setActiveGroupCookie(id);
  }

  // Optimistically set a newly created/joined group as active
  const setActiveGroup = useCallback((group: Group) => {
    setOptimisticGroup(group);
    setActiveGroupIdState(group.id);
    localStorage.setItem(STORAGE_KEY, group.id);
    setActiveGroupCookie(group.id);
  }, []);

  const activeGroup = groups.find((g) => g.id === activeGroupId) ?? null;
  // Loading until both initialization and first groups fetch complete
  const loading = !initialized || (!groupsLoaded && !initialGroups);

  return (
    <GroupContext value={{ groups, activeGroup, setActiveGroup, setActiveGroupId, loading }}>
      {children}
    </GroupContext>
  );
}

export function useGroup() {
  const ctx = useContext(GroupContext);
  if (!ctx) throw new Error("useGroup must be used within GroupProvider");
  return ctx;
}
