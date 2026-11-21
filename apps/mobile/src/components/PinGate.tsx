import type { ReactNode } from "react";
import { ActivityIndicator, StyleSheet, Text } from "react-native";
import { Redirect, usePathname } from "expo-router";
import { colors, fontSizes, spacing } from "../design/tokens";
import { usePinStatus } from "../lib/pin-status";
import { useAuth } from "../lib/session";
import { Button } from "./Button";
import { Screen } from "./Screen";

export function PinGate({ children }: { children: ReactNode }) {
  const { state, hasPin, error, refresh } = usePinStatus();
  const { signOut } = useAuth();
  const pathname = usePathname();

  if (state === "loading") {
    return (
      <Screen>
        <ActivityIndicator color={colors.brandText} />
      </Screen>
    );
  }

  if (state === "error") {
    return (
      <Screen>
        <Text style={styles.error}>{error ?? "Não foi possível verificar o seu PIN."}</Text>
        <Button title="Tentar novamente" onPress={() => void refresh()} />
        <Button title="Terminar sessão" onPress={() => void signOut()} variant="secondary" />
      </Screen>
    );
  }

  if (!hasPin && pathname !== "/pin-setup") {
    return <Redirect href="/pin-setup" />;
  }

  return <>{children}</>;
}

const styles = StyleSheet.create({
  error: { fontSize: fontSizes.body, color: colors.error, marginTop: spacing.lg },
});
