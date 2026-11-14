import { createClient, type SupabaseClient } from "@supabase/supabase-js";

function publicConfig() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  if (!url || !anonKey) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY");
  }
  return { url, anonKey };
}

const statelessAuth = {
  persistSession: false,
  autoRefreshToken: false,
  detectSessionInUrl: false,
} as const;

/**
 * A client that acts as the holder of `accessToken`, so the database authorizes
 * that user through RLS. Never pass a service-role key here.
 */
export function createUserSupabaseClient(accessToken: string): SupabaseClient {
  const { url, anonKey } = publicConfig();
  return createClient(url, anonKey, {
    auth: statelessAuth,
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });
}

/** A sessionless client for verifying tokens with Supabase Auth. */
export function createAnonSupabaseClient(): SupabaseClient {
  const { url, anonKey } = publicConfig();
  return createClient(url, anonKey, { auth: statelessAuth });
}
