import { fetchNativeSnapshot } from "@padelaso/data/native";
import { createNativeClient, nativeFailure, nativeResponse } from "../../../_http";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ matchId: string }> }
) {
  const client = createNativeClient(request);
  if (!client) return nativeFailure("AUTH_EXPIRED", "Authenticate again");

  const { matchId } = await params;
  return nativeResponse(await fetchNativeSnapshot(client, matchId));
}
