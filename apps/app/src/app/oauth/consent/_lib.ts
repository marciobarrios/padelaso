/** Supabase issues 32 alphanumeric characters; accept a safe superset. */
const AUTHORIZATION_ID = /^[A-Za-z0-9_-]{16,128}$/;

export function parseAuthorizationId(value: unknown): string | null {
  return typeof value === "string" && AUTHORIZATION_ID.test(value) ? value : null;
}

export function consentPath(authorizationId: string) {
  return `/oauth/consent?authorization_id=${authorizationId}`;
}

export function loginPath(authorizationId: string) {
  return `/login?redirectTo=${encodeURIComponent(consentPath(authorizationId))}`;
}

const SCRIPT_SCHEMES = new Set(["javascript:", "data:", "vbscript:", "file:"]);

/**
 * Supabase builds the redirect from the client's registered redirect URI. It is
 * still checked, since native clients may register custom schemes.
 */
export function isSafeClientRedirect(url: string): boolean {
  try {
    return !SCRIPT_SCHEMES.has(new URL(url).protocol);
  } catch {
    return false;
  }
}

/**
 * Human labels for the scopes Supabase supports, written to follow "También recibirá:"
 * in a sentence. Unknown scopes show as-is.
 */
const SCOPE_LABELS: Record<string, string> = {
  openid: "tu identidad en Padelaso",
  email: "tu dirección de email",
  profile: "tu nombre y foto de perfil",
  phone: "tu número de teléfono",
  offline_access: "acceso continuado sin que vuelvas a iniciar sesión",
};

export function describeScopes(scope: string | undefined): string[] {
  const scopes = (scope ?? "").split(" ").filter(Boolean);
  return [...new Set(scopes)].map((s) => SCOPE_LABELS[s] ?? s);
}
