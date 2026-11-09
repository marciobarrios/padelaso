import { createClient, processLock } from "@supabase/supabase-js";
import * as SecureStore from "expo-secure-store";
import * as Crypto from "expo-crypto";
import { settings } from "../config/settings";
import { createSessionStorage } from "./storage";
import { installAuthCrypto } from "./crypto";

installAuthCrypto(globalThis, {
  getRandomValues: (array) => {
    Crypto.getRandomValues(
      new Uint8Array(array.buffer, array.byteOffset, array.byteLength),
    );
    return array;
  },
  randomUUID: Crypto.randomUUID,
  digest: (_algorithm, data) =>
    Crypto.digest(Crypto.CryptoDigestAlgorithm.SHA256, data),
});

const options: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  // No biometric prompt on refresh. OS device protection guards the keychain.
  requireAuthentication: false,
};
export const sessionStorage = createSessionStorage({
  getItem: (key) => SecureStore.getItemAsync(key, options),
  setItem: (key, value) => SecureStore.setItemAsync(key, value, options),
  removeItem: (key) => SecureStore.deleteItemAsync(key, options),
});
export const scheme =
  settings.status !== "invalid" && settings.environment === "test"
    ? "padelaso-test"
    : "padelaso-dev";
export const storageKey =
  settings.status === "configured"
    ? `padelaso.${settings.environment}.${new URL(settings.url).host.replaceAll(":", "_")}.auth`
    : "padelaso.unconfigured.auth";
export const supabase =
  settings.status === "configured"
    ? createClient(settings.url, settings.publishableKey, {
        auth: {
          storage: sessionStorage,
          storageKey,
          flowType: "pkce",
          persistSession: true,
          autoRefreshToken: false,
          detectSessionInUrl: false,
          lock: processLock,
        },
      })
    : null;
