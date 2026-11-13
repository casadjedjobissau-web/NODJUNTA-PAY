import type { ReactNode } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, type ScrollViewProps } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { colors, spacing } from "../design/tokens";

interface Props {
  children: ReactNode;
  refreshControl?: ScrollViewProps["refreshControl"];
  tone?: "light" | "dark";
}

export function Screen({ children, refreshControl, tone = "light" }: Props) {
  const background = tone === "dark" ? colors.surfaceInverse : colors.background;

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: background }]}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          refreshControl={refreshControl}
        >
          {children}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  flex: { flex: 1 },
  content: { flexGrow: 1, padding: spacing.lg, gap: spacing.md },
});
