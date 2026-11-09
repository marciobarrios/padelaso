import type { ReactNode } from "react";
import { isLoaded } from "expo-font";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { theme } from "../theme";

export function Screen({ children }: { children: ReactNode }) {
  return (
    <SafeAreaView style={styles.fill} edges={["left", "right", "bottom"]}>
      <ScrollView contentContainerStyle={styles.content}>{children}</ScrollView>
    </SafeAreaView>
  );
}
export function Heading({ children }: { children: ReactNode }) {
  return (
    <Text
      accessibilityRole="header"
      style={[
        styles.heading,
        !isLoaded(theme.font.heading) && { fontFamily: undefined },
      ]}
    >
      {children}
    </Text>
  );
}
export function Body({
  children,
  muted = false,
}: {
  children: ReactNode;
  muted?: boolean;
}) {
  return (
    <Text
      style={[
        styles.body,
        !isLoaded(theme.font.body) && { fontFamily: undefined },
        muted && styles.muted,
      ]}
    >
      {children}
    </Text>
  );
}
export function Card({ children }: { children: ReactNode }) {
  return <View style={styles.card}>{children}</View>;
}
export function Action({
  label,
  onPress,
  disabled = false,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.action,
        (pressed || disabled) && styles.pressed,
      ]}
    >
      <Text
        style={[
          styles.actionText,
          !isLoaded(theme.font.body) && { fontFamily: undefined },
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}
export const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: theme.color.background },
  content: {
    padding: theme.space.lg,
    gap: theme.space.lg,
    flexGrow: 1,
    width: "100%",
    maxWidth: 640,
    alignSelf: "center",
  },
  heading: {
    color: theme.color.text,
    fontFamily: theme.font.heading,
    fontSize: 28,
    lineHeight: 36,
  },
  body: {
    color: theme.color.text,
    fontFamily: theme.font.body,
    fontSize: 17,
    lineHeight: 26,
  },
  muted: { color: theme.color.muted },
  card: {
    backgroundColor: theme.color.surface,
    borderColor: theme.color.border,
    borderWidth: 1,
    borderRadius: theme.radius,
    padding: theme.space.md,
    gap: theme.space.md,
  },
  action: {
    backgroundColor: theme.color.accent,
    borderRadius: theme.radius,
    padding: theme.space.md,
    minHeight: 48,
    alignItems: "center",
    justifyContent: "center",
  },
  actionText: {
    color: theme.color.onAccent,
    fontFamily: theme.font.body,
    fontSize: 17,
    textAlign: "center",
  },
  pressed: { opacity: 0.75 },
});
