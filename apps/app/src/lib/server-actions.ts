"use server";

import { revalidatePath } from "next/cache";

// Flush the Next.js Client Cache (Router Cache) for every route under the
// root layout. Needed after a client-side mutation that changes data the
// server-rendered shell exposes via <GroupDataHydrator>: without this, the
// browser's cached RSC payload from a prior visit to /, /matches, /stats,
// etc. is served on back/forward nav, re-seeding stale SWR fallback.
// Currently revalidatePath in a Server Function also invalidates all other
// previously visited pages, which is exactly the behavior we want.
export async function revalidateGroupData() {
  revalidatePath("/", "layout");
}
