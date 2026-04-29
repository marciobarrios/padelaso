import { createBrowserClient } from "@supabase/ssr";

export function createClient() {
  // Trim: a trailing newline in the apikey URL-encodes to %0A and breaks
  // the realtime WebSocket handshake with a 401, while REST keeps working.
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!.trim(),
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!.trim()
  );
}
