import { useEffect, useState } from "react";
import { Platform, StyleSheet, View } from "react-native";
import * as Apple from "expo-apple-authentication";
import { Action, Body } from "../components/ui";
import { useAuth } from "./provider";
import { authMessages } from "./messages";

export function AccountActions({ link = false }: { link?: boolean }) {
  const { state, controller } = useAuth();
  const [appleAvailable, setAppleAvailable] = useState(false);
  useEffect(() => {
    let active = true;
    if (Platform.OS === "ios")
      void Apple.isAvailableAsync()
        .then((available) => {
          if (active) setAppleAvailable(available);
        })
        .catch(() => {});
    return () => {
      active = false;
    };
  }, []);
  const identities = state.session?.user.identities ?? [];
  return (
    <>
      {!link && <Body muted>{authMessages.recovery}</Body>}
      {(!link ||
        !identities.some((identity) => identity.provider === "google")) && (
        <Action
          label={link ? "Vincular Google" : "Continuar con Google"}
          disabled={state.busy || !controller}
          onPress={() => {
            void controller?.signIn("google", link);
          }}
        />
      )}
      {appleAvailable &&
        (!link ||
          !identities.some((identity) => identity.provider === "apple")) && (
          <View
            pointerEvents={state.busy ? "none" : "auto"}
            accessibilityElementsHidden={state.busy}
            importantForAccessibility={
              state.busy ? "no-hide-descendants" : "auto"
            }
          >
            {link && <Body>Vincular Apple a esta cuenta</Body>}
            <Apple.AppleAuthenticationButton
              buttonType={
                link
                  ? Apple.AppleAuthenticationButtonType.CONTINUE
                  : Apple.AppleAuthenticationButtonType.SIGN_IN
              }
              buttonStyle={Apple.AppleAuthenticationButtonStyle.WHITE}
              cornerRadius={12}
              style={styles.apple}
              onPress={() => {
                void controller?.signIn("apple", link);
              }}
            />
          </View>
        )}
      {state.busy && <Body>Comprobando el acceso…</Body>}
      {state.message && (
        <View accessibilityLiveRegion="polite">
          <Body>{state.message}</Body>
        </View>
      )}
    </>
  );
}
const styles = StyleSheet.create({ apple: { width: "100%", height: 52 } });
