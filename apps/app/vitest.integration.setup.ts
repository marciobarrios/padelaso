import { execFileSync } from "node:child_process";
import path from "node:path";

// Real keys come from the running stack, replacing any placeholder build values.
const status = JSON.parse(
  execFileSync("pnpm", ["exec", "supabase", "status", "-o", "json"], {
    cwd: path.resolve(import.meta.dirname, "../.."),
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  })
) as Record<string, string>;

process.env.NEXT_PUBLIC_SUPABASE_URL = status.API_URL;
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = status.ANON_KEY;
process.env.SUPABASE_SERVICE_ROLE_KEY = status.SERVICE_ROLE_KEY;
process.env.SUPABASE_JWT_SECRET = status.JWT_SECRET;
