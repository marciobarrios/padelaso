import { handleMcpRequest, mcpPreflight } from "@/lib/mcp/handler";

export const runtime = "nodejs";

export { handleMcpRequest as GET, handleMcpRequest as POST, handleMcpRequest as DELETE, mcpPreflight as OPTIONS };
