export function isSafeInternalPath(
  path: string | null | undefined
): path is string {
  return !!path && path.startsWith("/") && !path.startsWith("//");
}
