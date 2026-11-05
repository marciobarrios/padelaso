import { parsePublicSettings } from "./public-settings";

// Static property access is required for Expo's public env replacement.
export const settings = parsePublicSettings({
  environment: process.env.EXPO_PUBLIC_APP_ENV,
  url: process.env.EXPO_PUBLIC_SUPABASE_URL,
  publishableKey: process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
});
