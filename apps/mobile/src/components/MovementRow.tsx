import { StyleSheet, Text, View } from "react-native";
import { TONES } from "../design/tones";
import { colors, fontSizes, fontWeights, spacing } from "../design/tokens";
import { describeEntry, formatDateTime } from "../lib/statement";
import type { StatementEntry } from "../lib/types";
import { ListRow } from "./ListRow";

interface Props {
  entry: StatementEntry;
  currency?: string;
  last?: boolean;
}

export function MovementRow({ entry, currency, last = false }: Props) {
  const view = describeEntry(entry, currency);
  const when = formatDateTime(entry.createdAt);
  const subtitle = view.subtitle ? `${when} · ${view.subtitle}` : when;
  const tone = view.positive ? TONES.success : TONES.neutral;

  return (
    <ListRow
      title={view.title}
      subtitle={subtitle}
      last={last}
      left={
        <View
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          style={[styles.icon, { backgroundColor: tone.bg }]}
        >
          <Text style={[styles.glyph, { color: tone.fg }]}>{view.positive ? "↓" : "↑"}</Text>
        </View>
      }
      right={
        <Text style={[styles.amount, { color: view.positive ? colors.brandText : colors.textPrimary }]}>
          {view.amountText}
        </Text>
      }
    />
  );
}

const styles = StyleSheet.create({
  icon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    marginRight: spacing.xs,
  },
  glyph: { fontSize: fontSizes.bodyLarge, fontWeight: fontWeights.bold },
  amount: { fontSize: fontSizes.body, fontWeight: fontWeights.bold },
});
