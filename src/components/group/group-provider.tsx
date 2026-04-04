"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { Group } from "@/lib/types";
import { useGroups } from "@/lib/db-hooks";

const STORAGE_KEY = "padelaso_active_group_id";

interface GroupContextValue {
  groups: Group[];
  activeGroup: Group | null;
  setActiveGroupId: (id: string) => void;
  loading: boolean;
}

const GroupContext = createContext<GroupContextValue | null>(null);

export function GroupProvider({ children }: { children: React.ReactNode }) {
  const groups = useGroups();
  const [activeGroupId, setActiveGroupIdState] = useState<string | null>(null);
  const [initialized, setInitialized] = useState(false);

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
      // Default to the first group
      setActiveGroupIdState(groups[0].id);
      localStorage.setItem(STORAGE_KEY, groups[0].id);
    }
  }, [groups, activeGroupId, initialized]);

  function setActiveGroupId(id: string) {
    setActiveGroupIdState(id);
    localStorage.setItem(STORAGE_KEY, id);
  }

  const activeGroup = groups.find((g) => g.id === activeGroupId) ?? null;
  // Still loading if we haven't initialized from localStorage yet
  const loading = !initialized;

  return (
    <GroupContext value={{ groups, activeGroup, setActiveGroupId, loading }}>
      {children}
    </GroupContext>
  );
}

export function useGroup() {
  const ctx = useContext(GroupContext);
  if (!ctx) throw new Error("useGroup must be used within GroupProvider");
  return ctx;
}
