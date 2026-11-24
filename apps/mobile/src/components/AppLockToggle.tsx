import { useState } from "react";
import { StyleSheet, Switch, Text, View } from "react-native";
import { colors, fontSizes, fontWeights, lineHeights, spacing } from "../design/tokens";
import { LOCK_AFTER_MS } from "../lib/app-lock";
import { useAppLock } from "./AppLock";
import { Card } from "./Card";

export function AppLockToggle() {
  const { enabled, setEnabled } = useAppLock();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onChange(next: boolean) {
    setBusy(true);
    setError(null);
    const result = await setEnabled(next);
    if (!result.ok) {
      setError(result.message);
    }
    setBusy(false);
  }

  return (
    <Card>
      <View style={styles.row}>
        <View style={styles.texts}>
          <Text style={styles.title}>Bloquear a app</Text>
          <Text style={styles.hint}>
            Pede a biometria ou o código do telemóvel ao abrir a app e depois de {Math.round(LOCK_AFTER_MS / 1000)}{" "}
            segundos fora dela. Não substitui o PIN: o dinheiro continua a pedir sempre o PIN.
          </Text>
        </View>
        <Switch
          value={enabled}
          onValueChange={(next) => void onChange(next)}
          disabled={busy}
          trackColor={{ false: colors.borderStrong, true: colors.brand }}
          thumbColor={colors.surface}
          accessibilityLabel="Bloquear a app"
        />
      </View>
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  texts: { flex: 1, gap: spacing.xs },
  title: { fontSize: fontSizes.body, fontWeight: fontWeights.bold, color: colors.textPrimary },
  hint: { fontSize: fontSizes.small, lineHeight: lineHeights.small, color: colors.textSecondary },
  error: { fontSize: fontSizes.small, color: colors.error },
});
