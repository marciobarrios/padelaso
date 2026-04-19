import { cookies } from "next/headers";
import { createServerSupabaseClient } from "./supabase-server";
import { mapGroup } from "./mappers";
import { ACTIVE_GROUP_COOKIE } from "./active-group-cookie";
import type { Group } from "./types";
import type { User } from "@supabase/supabase-js";

interface ServerAuthResult {
  user: User | null;
  groups: Group[];
  activeGroupId: string | null;
}

export async function getServerAuth(): Promise<ServerAuthResult> {
  const cookieStore = await cookies();
  const activeGroupId =
    cookieStore.get(ACTIVE_GROUP_COOKIE)?.value ?? null;

  // Skip the network call entirely when no Supabase auth cookies exist.
  // This keeps the login page and public routes fast.
  const hasAuthCookies = cookieStore
    .getAll()
    .some((c) => c.name.startsWith("sb-"));
  if (!hasAuthCookies) {
    return { user: null, groups: [], activeGroupId };
  }

  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let groups: Group[] = [];
  if (user) {
    const { data } = await supabase
      .from("groups")
      .select("*")
      .order("created_at");
    if (data) groups = data.map(mapGroup);
  }

  return { user, groups, activeGroupId };
}
