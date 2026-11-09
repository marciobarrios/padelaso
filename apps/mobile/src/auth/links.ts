const uuid =
  "[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}";
const destination = new RegExp(`^/(matches/${uuid}|join/[A-Za-z0-9_-]{4,64})$`);

export function pendingPath(path: string): string | null {
  return destination.test(path) ? path : null;
}

export type IncomingLink =
  | { kind: "callback"; code: string | null; failed: boolean }
  | { kind: "destination"; path: string }
  | { kind: "ignore" };

export function parseIncomingLink(raw: string, scheme: string): IncomingLink {
  try {
    const url = new URL(raw);
    if (
      url.protocol !== `${scheme}:` ||
      url.username ||
      url.password ||
      url.port
    )
      return { kind: "ignore" };
    const path = `/${url.hostname}${url.pathname}`;
    if (path === "/auth/callback") {
      const codes = url.searchParams.getAll("code");
      const code =
        codes.length === 1 && codes[0] && codes[0].length <= 4096
          ? codes[0]
          : null;
      return {
        kind: "callback",
        code,
        failed: !!url.hash || url.searchParams.has("error") || !code,
      };
    }
    const safe = !url.search && !url.hash && pendingPath(path);
    return safe ? { kind: "destination", path: safe } : { kind: "ignore" };
  } catch {
    return { kind: "ignore" };
  }
}
