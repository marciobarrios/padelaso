import { executeNativeCommand } from "@padelaso/data/native";
import { createNativeClient, nativeFailure, nativeResponse } from "../_http";

export async function POST(request: Request) {
  const client = createNativeClient(request);
  if (!client) return nativeFailure("AUTH_EXPIRED", "Authenticate again");

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return nativeFailure("INVALID_REQUEST", "Body must be JSON");
  }
  return nativeResponse(await executeNativeCommand(client, body));
}
