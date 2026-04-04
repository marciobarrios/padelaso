"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { Group } from "@/lib/types";
import { useGroups } from "@/lib/db-hooks";

const STORAGE_KEY = "padelaso_active_group_id";

interface GroupContextValue {
  groups: Group[];
  activeGroup: Group | null;
  setActiveGroup: (group: Group) => void;
  setActiveGroupId: (id: string) => void;
  loading: boolean;
}

const GroupContext = createContext<GroupContextValue | null>(null);

export function GroupProvider({ children }: { children: React.ReactNode }) {
  const { groups: fetchedGroups, loaded: groupsLoaded } = useGroups();
  const [optimisticGroup, setOptimisticGroup] = useState<Group | null>(null);
  const [activeGroupId, setActiveGroupIdState] = useState<string | null>(null);
  const [initialized, setInitialized] = useState(false);

  // Merge fetched groups with optimistic group (if not yet in fetched list)
  const groups = optimisticGroup && !fetchedGroups.some((g) => g.id === optimisticGroup.id)
    ? [...fetchedGroups, optimisticGroup]
    : fetchedGroups;

  // Clear optimistic group once it appears in fetched data
  useEffect(() => {
    if (optimisticGroup && fetchedGroups.some((g) => g.id === optimisticGroup.id)) {
      setOptimisticGroup(null);
    }
  }, [fetchedGroups, optimisticGroup]);

  // Load from localStorage on mount
  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) setActiveGroupIdState(stored);
    setInitialized(true);
  }, []);

  // Once groups load, validate/set the active group
  useEffect(() => {
    if (!initialized || groups.length === 0) return;

    const validGroup = groups.find((g) => g.id === activeGroupId);
    if (!validGroup) {
      setActiveGroupIdState(groups[0].id);
      localStorage.setItem(STORAGE_KEY, groups[0].id);
    }
  }, [groups, activeGroupId, initialized]);

  function setActiveGroupId(id: string) {
    setActiveGroupIdState(id);
    localStorage.setItem(STORAGE_KEY, id);
  }

  // Optimistically set a newly created/joined group as active
  const setActiveGroup = useCallback((group: Group) => {
    setOptimisticGroup(group);
    setActiveGroupIdState(group.id);
    localStorage.setItem(STORAGE_KEY, group.id);
  }, []);

  const activeGroup = groups.find((g) => g.id === activeGroupId) ?? null;
  // Loading until both localStorage is initialized AND first groups fetch completes
  const loading = !initialized || !groupsLoaded;

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
