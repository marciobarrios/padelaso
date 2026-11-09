import { Stack } from "expo-router";
import { useEffect } from "react";
import { useFonts } from "expo-font";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { ActivityIndicator, Platform, View } from "react-native";
import { Body, styles } from "../components/ui";
import { theme } from "../theme";
import { es } from "../strings";
import { AuthProvider, useAuth } from "../auth/provider";
import { settings } from "../config/settings";

export { RouteError as ErrorBoundary } from "../components/route-error";

export default function RootLayout() {
  useEffect(() => {
    if (__DEV__ && Platform.OS === "ios") {
      // On iOS 27 the floating dev-menu window can cover the app and OAuth
      // sheets while collapsed. Keep the menu available via Cmd+D or shake.
      void import("expo-dev-client").then(({ setToolsButtonVisible }) => {
        setToolsButtonVisible(false);
      });
    }
  }, []);

  return (
    <AuthProvider>
      <Navigation />
    </AuthProvider>
  );
}

function Navigation() {
  const { state } = useAuth();
  const [loaded, error] = useFonts({
    Geist: require("../../assets/fonts/Geist-Regular.ttf"),
    GeistMono: require("../../assets/fonts/GeistMono-Regular.ttf"),
  });
  if ((!loaded && !error) || state.status === "loading") {
    return (
      <SafeAreaProvider>
        <View
          style={[
            styles.fill,
            {
              justifyContent: "center",
              alignItems: "center",
              gap: theme.space.md,
            },
          ]}
          accessibilityRole="progressbar"
          accessibilityLabel={es.loading}
        >
          <ActivityIndicator color={theme.color.accent} />
          <Body>{es.loading}</Body>
        </View>
      </SafeAreaProvider>
    );
  }
  // A font load failure uses the platform font so navigation remains usable.
  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      <Stack
        key={`${state.session?.user.id ?? "signed-out"}:${state.revision}`}
        screenOptions={{
          headerStyle: { backgroundColor: theme.color.background },
          headerTintColor: theme.color.text,
          contentStyle: { backgroundColor: theme.color.background },
          headerBackTitle: es.home,
          headerTitleStyle: {
            fontFamily: loaded ? theme.font.heading : undefined,
          },
        }}
      >
        <Stack.Protected
          guard={state.status === "ready" || settings.status === "sample"}
        >
          <Stack.Screen name="index" options={{ title: es.app }} />
          <Stack.Screen name="matches/[id]" options={{ title: "Partido" }} />
          <Stack.Screen name="join/[code]" options={{ title: "Invitación" }} />
          <Stack.Screen name="settings" options={{ title: es.settings }} />
        </Stack.Protected>
        <Stack.Protected guard={state.status !== "ready"}>
          <Stack.Screen
            name="sign-in"
            options={{ title: "Entrar en Padelaso" }}
          />
        </Stack.Protected>
        <Stack.Screen name="auth/callback" options={{ title: "Acceso" }} />
      </Stack>
    </SafeAreaProvider>
  );
}
