import { StyleSheet, Text, View } from "react-native";
import { describeEntry, formatDateTime } from "../lib/statement";
import type { StatementEntry } from "../lib/types";
import { colors, fontSize, spacing } from "../theme";

interface Props {
  entry: StatementEntry;
  currency?: string;
}

export function MovementRow({ entry, currency }: Props) {
  const view = describeEntry(entry, currency);
  const when = formatDateTime(entry.createdAt);
  const meta = view.subtitle ? `${when} · ${view.subtitle}` : when;

  return (
    <View style={styles.row}>
      <View style={styles.left}>
        <Text style={styles.title}>{view.title}</Text>
        <Text style={styles.meta}>{meta}</Text>
      </View>
      <Text style={[styles.amount, view.positive ? styles.positive : styles.negative]}>
        {view.amountText}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
    gap: spacing.sm,
  },
  left: { flex: 1, gap: 2 },
  title: { fontSize: fontSize.body, color: colors.text, fontWeight: "600" },
  meta: { fontSize: fontSize.small, color: colors.textMuted },
  amount: { fontSize: fontSize.body, fontWeight: "700" },
  positive: { color: colors.success },
  negative: { color: colors.text },
});
