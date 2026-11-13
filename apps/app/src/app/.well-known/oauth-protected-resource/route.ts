import { metadataCorsOptionsRequestHandler, protectedResourceHandler } from "mcp-handler";
import { mcpConfig } from "@/lib/mcp/auth";

export const runtime = "nodejs";
export function GET(request: Request) {
  const { issuer, resource } = mcpConfig();
  return protectedResourceHandler({ authServerUrls: [issuer], resourceUrl: resource })(request);
}
export const OPTIONS = metadataCorsOptionsRequestHandler();
