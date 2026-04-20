const SENTINEL_ORIGIN = "http://sentinel.invalid";

export function isSafeInternalPath(
  path: string | null | undefined
): path is string {
  if (!path || typeof path !== "string" || !path.startsWith("/")) return false;
  try {
    return new URL(path, SENTINEL_ORIGIN).origin === SENTINEL_ORIGIN;
  } catch {
    return false;
  }
}
