"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase";
import { DataContext } from "@/lib/supabase-hooks";
import { GroupProvider } from "@/components/group/group-provider";
import { clearActiveGroupCookie } from "@/lib/active-group-cookie";
import type { Group } from "@/lib/types";

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  signInWithGoogle: (next?: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

interface AuthProviderProps {
  children: React.ReactNode;
  initialUser: User | null;
  initialGroups: Group[];
  initialActiveGroupId: string | null;
}

export function AuthProvider({
  children,
  initialUser,
  initialGroups,
  initialActiveGroupId,
}: AuthProviderProps) {
  const supabase = createClient();
  const [user, setUser] = useState<User | null>(initialUser);
  const loading = false;
  const [refreshKey, setRefreshKey] = useState(0);
  const refresh = () => setRefreshKey((k) => k + 1);

  async function ensureProfile(u: User) {
    await supabase.from("profiles").upsert(
      {
        id: u.id,
        display_name:
          u.user_metadata?.full_name ?? u.email?.split("@")[0] ?? "",
        avatar_url: u.user_metadata?.avatar_url ?? null,
      },
      { onConflict: "id" }
    );
  }

  useEffect(() => {
    // Listen for auth state changes (sign out, token refresh, etc.)
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      if (session?.user) {
        ensureProfile(session.user);
      }
    });

    return () => subscription.unsubscribe();
  }, [supabase]);

  async function signInWithGoogle(next?: string) {
    const callback = new URL("/auth/callback", window.location.origin);
    if (next) callback.searchParams.set("next", next);
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: callback.toString(),
      },
    });
  }

  async function signOut() {
    clearActiveGroupCookie();
    await supabase.auth.signOut();
  }

  return (
    <AuthContext value={{ user, loading, signInWithGoogle, signOut }}>
      <DataContext value={{ refreshKey, refresh }}>
        <GroupProvider
          initialGroups={initialGroups}
          initialActiveGroupId={initialActiveGroupId}
        >
          {children}
        </GroupProvider>
      </DataContext>
    </AuthContext>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
