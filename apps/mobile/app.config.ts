import type { ExpoConfig } from "expo/config";
import packageJson from "./package.json" with { type: "json" };

// Expo evaluates this on the build host. Never spread process.env into extra.
// Each environment installs side by side with its own name, link scheme and
// bundle/package ID. Keep schemes in sync with src/config/public-settings.ts.
const environments = {
  development: { name: "Padelaso Dev", scheme: "padelaso-dev", id: "com.padelaso.mobile.dev" },
  test: { name: "Padelaso Test", scheme: "padelaso-test", id: "com.padelaso.mobile.test" },
  production: { name: "Padelaso", scheme: "padelaso", id: "com.padelaso.mobile" },
} as const;
const environment = process.env.EXPO_PUBLIC_APP_ENV ?? "development";
if (!Object.hasOwn(environments, environment)) {
  throw new Error("EXPO_PUBLIC_APP_ENV must be development, test or production.");
}
const variant = environments[environment as keyof typeof environments];

// One build number for the iPhone app, its embedded Watch app and Android.
// Raise it for every store or TestFlight upload. See RELEASE.md.
const buildNumber = process.env.APP_BUILD_NUMBER ?? "1";
if (!/^[1-9][0-9]{0,8}$/.test(buildNumber)) {
  throw new Error("APP_BUILD_NUMBER must be a positive whole number.");
}
const allowedPublicNames = new Set([
  "EXPO_PUBLIC_APP_ENV",
  "EXPO_PUBLIC_SUPABASE_URL",
  "EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
]);
for (const name of Object.keys(process.env)) {
  if (name.startsWith("EXPO_PUBLIC_") && !allowedPublicNames.has(name)) {
    throw new Error(
      "Unrecognized public mobile setting. Check apps/mobile/.env.example.",
    );
  }
}
const key = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
if (key && !/^sb_publishable_[A-Za-z0-9_-]+$/.test(key)) {
  throw new Error(
    "Mobile builds accept only a Supabase publishable client key.",
  );
}

const projectId = process.env.EAS_PROJECT_ID;
if (projectId && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(projectId)) {
  throw new Error("EAS_PROJECT_ID must be the real Expo project UUID.");
}

const config: ExpoConfig = {
  name: variant.name,
  slug: "padelaso",
  ...(projectId ? { extra: { eas: { projectId } } } : {}),
  // The version lives in package.json only.
  version: packageJson.version,
  // A JS bundle runs only on the native build it was made for. The fingerprint
  // changes with native code, the Watch target, plugins and app config; see
  // fingerprint.config.js and RELEASE.md.
  runtimeVersion: { policy: "fingerprint" },
  icon: "./assets/app-icon.png",
  scheme: variant.scheme,
  orientation: "portrait",
  userInterfaceStyle: "dark",
  platforms: ["ios", "android"],
  backgroundColor: "#121410",
  ios: {
    ...(process.env.APPLE_TEAM_ID
      ? { appleTeamId: process.env.APPLE_TEAM_ID }
      : {}),
    buildNumber,
    bundleIdentifier: variant.id,
    supportsTablet: true,
    usesAppleSignIn: true,
    infoPlist: {
      CFBundleDevelopmentRegion: "es",
      CFBundleLocalizations: ["es"],
      ITSAppUsesNonExemptEncryption: false,
    },
  },
  android: {
    package: variant.id,
    versionCode: Number(buildNumber),
    permissions: [],
  },
  plugins: [
    "expo-router",
    "expo-font",
    "expo-secure-store",
    "expo-web-browser",
    "expo-apple-authentication",
    ["expo-splash-screen", { backgroundColor: "#121410" }],
    "@bacons/apple-targets",
    "./plugins/with-watch-build-number",
  ],
};
export default config;
