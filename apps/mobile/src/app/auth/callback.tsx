import { Redirect } from "expo-router";
import { Body, Screen } from "../../components/ui";
import { useAuth } from "../../auth/provider";

// The provider handles the full URL from initial/warm Linking events. Do not
// exchange again here: iOS and Android can deliver it through multiple paths.
export default function AuthCallbackScreen() {
  const { state } = useAuth();
  if (state.busy || state.status === "loading")
    return (
      <Screen>
        <Body>Comprobando el acceso…</Body>
      </Screen>
    );
  return <Redirect href={state.status === "ready" ? "/" : "/sign-in"} />;
}
