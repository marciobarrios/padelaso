import { requireOptionalNativeModule } from "expo-modules-core";

export const watchSpike = requireOptionalNativeModule<{
  openSetup(): Promise<void>;
}>("WatchSpike");
