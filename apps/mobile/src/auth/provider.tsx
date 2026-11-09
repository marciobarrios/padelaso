import {
  createContext,
  useContext,
  useEffect,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { AppState } from "react-native";
import * as Linking from "expo-linking";
import * as WebBrowser from "expo-web-browser";
import * as Apple from "expo-apple-authentication";
import * as Crypto from "expo-crypto";
import { AuthController, type AuthState } from "./controller";
import { supabase, sessionStorage, storageKey, scheme } from "./client";

const controller = supabase
  ? new AuthController(supabase, sessionStorage, storageKey, scheme, {
      openBrowser: (url, redirect) =>
        WebBrowser.openAuthSessionAsync(url, redirect),
      appleCredential: async () => {
        const nonce = Crypto.randomUUID();
        const hashedNonce = await Crypto.digestStringAsync(
          Crypto.CryptoDigestAlgorithm.SHA256,
          nonce,
        );
        const credential = await Apple.signInAsync({
          requestedScopes: [Apple.AppleAuthenticationScope.EMAIL],
          nonce: hashedNonce,
        });
        if (!credential.identityToken)
          throw new Error("Missing Apple identity token");
        return { token: credential.identityToken, nonce };
      },
    })
  : null;
const unconfigured: AuthState = {
  status: "signedOut",
  session: null,
  busy: false,
  message: null,
  pending: null,
  revision: 0,
};
const noopSubscribe = () => () => {};
const getUnconfigured = () => unconfigured;
const AuthContext = createContext<{
  state: AuthState;
  controller: AuthController | null;
} | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const state = useSyncExternalStore(
    controller?.subscribe ?? noopSubscribe,
    controller?.getSnapshot ?? getUnconfigured,
  );
  useEffect(() => {
    if (!controller) return;
    let active = true;
    // Buffer warm links until restoration finishes. Both paths use one coordinator.
    const started = Linking.getInitialURL()
      .catch(() => null)
      .then((url) => {
        if (active) return controller.start(url);
      });
    const links = Linking.addEventListener("url", ({ url }) => {
      void started.then(() => {
        if (active) return controller.handleUrl(url);
      });
    });
    const app = AppState.addEventListener("change", (next) => {
      void started.then(() => {
        if (active) return controller.foreground(next === "active");
      });
    });
    void started.then(() => {
      if (active)
        void controller.foreground(AppState.currentState === "active");
    });
    return () => {
      active = false;
      links.remove();
      app.remove();
      controller.stop();
    };
  }, []);
  return <AuthContext value={{ state, controller }}>{children}</AuthContext>;
}
export function useAuth() {
  const auth = useContext(AuthContext);
  if (!auth) throw new Error("AuthProvider is required");
  return auth;
}
