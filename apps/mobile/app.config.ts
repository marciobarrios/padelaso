import type { ExpoConfig } from "expo/config";

// Expo evaluates this on the build host. Never spread process.env into extra.
const environment = process.env.EXPO_PUBLIC_APP_ENV ?? "development";
if (!["development", "test"].includes(environment)) {
  throw new Error("EXPO_PUBLIC_APP_ENV must be development or test.");
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

const config: ExpoConfig = {
  name: environment === "test" ? "Padelaso Test" : "Padelaso Dev",
  slug: "padelaso",
  version: "0.1.0",
  scheme: environment === "test" ? "padelaso-test" : "padelaso-dev",
  orientation: "portrait",
  userInterfaceStyle: "dark",
  platforms: ["ios", "android"],
  backgroundColor: "#121410",
  ios: {
    bundleIdentifier: `com.padelaso.mobile.${environment === "test" ? "test" : "dev"}`,
    supportsTablet: true,
    infoPlist: {
      CFBundleDevelopmentRegion: "es",
      CFBundleLocalizations: ["es"],
      ITSAppUsesNonExemptEncryption: false,
    },
  },
  android: {
    package: `com.padelaso.mobile.${environment === "test" ? "test" : "dev"}`,
    permissions: [],
  },
  plugins: [
    "expo-router",
    "expo-font",
    ["expo-splash-screen", { backgroundColor: "#121410" }],
  ],
};
export default config;
