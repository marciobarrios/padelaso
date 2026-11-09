import { replaceNativeScoringSession } from "@padelaso/data/native";
import { createNativeClient, nativeFailure, nativeResponse } from "../../../_http";

/** Replaces the scoring session; commands queued against the old one become stale. */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ matchId: string }> }
) {
  const client = createNativeClient(request);
  if (!client) return nativeFailure("AUTH_EXPIRED", "Authenticate again");

  const { matchId } = await params;
  return nativeResponse(await replaceNativeScoringSession(client, matchId));
}
