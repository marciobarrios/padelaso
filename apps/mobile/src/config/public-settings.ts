export type AppEnvironment = "development" | "test" | "production";

// Link schemes per environment. app.config.ts registers the same values.
export const appSchemes: Record<AppEnvironment, string> = {
  development: "padelaso-dev",
  test: "padelaso-test",
  production: "padelaso",
};
export type PublicSettings =
  | { status: "sample"; environment: AppEnvironment }
  | {
      status: "configured";
      environment: AppEnvironment;
      url: string;
      publishableKey: string;
    }
  | { status: "invalid" };

function isAppEnvironment(value: string): value is AppEnvironment {
  return Object.hasOwn(appSchemes, value);
}

export function parsePublicSettings(input: {
  environment?: string;
  url?: string;
  publishableKey?: string;
}): PublicSettings {
  const environment = input.environment ?? "development";
  if (!isAppEnvironment(environment)) return { status: "invalid" };
  const url = input.url?.trim();
  const publishableKey = input.publishableKey?.trim();
  if (!url && !publishableKey) return { status: "sample", environment };
  if (
    !url ||
    !publishableKey ||
    !/^sb_publishable_[A-Za-z0-9_-]+$/.test(publishableKey)
  )
    return { status: "invalid" };
  try {
    const parsed = new URL(url);
    // Use HTTPS for device-accessible development/test backends.
    if (
      parsed.protocol !== "https:" ||
      parsed.username ||
      parsed.password ||
      parsed.search ||
      parsed.hash ||
      parsed.pathname !== "/"
    )
      return { status: "invalid" };
    return {
      status: "configured",
      environment,
      url: parsed.origin,
      publishableKey,
    };
  } catch {
    return { status: "invalid" };
  }
}
