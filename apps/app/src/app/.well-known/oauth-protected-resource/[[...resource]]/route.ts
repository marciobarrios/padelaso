import { generateProtectedResourceMetadata, metadataCorsOptionsRequestHandler } from "mcp-handler";
import { getMcpConfig, MCP_PATH } from "@/lib/mcp/config";

export const runtime = "nodejs";

/**
 * RFC 9728 metadata for the MCP endpoint. Served at the path-aware location
 * (`/.well-known/oauth-protected-resource/api/mcp`) and at the root, which some
 * clients probe first.
 */
export async function GET(request: Request, { params }: { params: Promise<{ resource?: string[] }> }) {
  const { resource = [] } = await params;
  const path = `/${resource.join("/")}`;
  if (path !== "/" && path !== MCP_PATH) return new Response("Not Found", { status: 404 });

  const config = getMcpConfig(request);
  const metadata = generateProtectedResourceMetadata({
    authServerUrls: [config.issuer],
    resourceUrl: config.resource,
    additionalMetadata: { resource_name: "Padelaso", bearer_methods_supported: ["header"] },
  });
  return Response.json(metadata, {
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Cache-Control": "public, max-age=3600",
    },
  });
}

export const OPTIONS = metadataCorsOptionsRequestHandler();
