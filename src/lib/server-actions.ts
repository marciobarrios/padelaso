"use server";

import { cookies } from "next/headers";
import { updateTag } from "next/cache";
import { ACTIVE_GROUP_COOKIE } from "./active-group-cookie";
import { GROUP_DATA_TAG } from "./server-data";

export async function revalidateActiveGroup() {
  const cookieStore = await cookies();
  const groupId = cookieStore.get(ACTIVE_GROUP_COOKIE)?.value;
  if (!groupId) return;
  updateTag(GROUP_DATA_TAG(groupId));
}
