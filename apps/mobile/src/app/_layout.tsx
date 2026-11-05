import { Stack } from "expo-router";
import { useFonts } from "expo-font";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { ActivityIndicator, View } from "react-native";
import { Body, styles } from "../components/ui";
import { theme } from "../theme";
import { es } from "../strings";

export { RouteError as ErrorBoundary } from "../components/route-error";

export default function RootLayout() {
  const [loaded, error] = useFonts({
    Geist: require("../../assets/fonts/Geist-Regular.ttf"),
    GeistMono: require("../../assets/fonts/GeistMono-Regular.ttf"),
  });
  if (!loaded && !error) {
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
        <Stack.Screen name="index" options={{ title: es.app }} />
        <Stack.Screen name="matches/[id]" options={{ title: es.details }} />
        <Stack.Screen name="settings" options={{ title: es.settings }} />
      </Stack>
    </SafeAreaProvider>
  );
}
