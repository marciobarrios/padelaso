"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { User } from "@supabase/supabase-js";
import { getBrowserClient } from "@/lib/supabase";
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
  const supabase = getBrowserClient();
  const [user, setUser] = useState<User | null>(initialUser);
  const loading = false;

  useEffect(() => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      // Re-key the realtime websocket on every auth event. supabase-js
      // skips INITIAL_SESSION internally, leaving the socket bound to the
      // anon key on a hydrated load — RLS then silently drops postgres_changes.
      if (session?.access_token) {
        supabase.realtime.setAuth(session.access_token);
      }
      setUser(session?.user ?? null);
      if (event === "SIGNED_IN" && session?.user) {
        supabase.from("profiles").upsert(
          {
            id: session.user.id,
            display_name:
              session.user.user_metadata?.full_name ??
              session.user.email?.split("@")[0] ??
              "",
            avatar_url: session.user.user_metadata?.avatar_url ?? null,
          },
          { onConflict: "id" }
        );
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
      <GroupProvider
        initialGroups={initialGroups}
        initialActiveGroupId={initialActiveGroupId}
      >
        {children}
      </GroupProvider>
    </AuthContext>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
