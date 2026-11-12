import { StyleSheet, Text, View } from "react-native";
import { colors, fontSize, radius, spacing } from "../theme";
import { Button } from "./Button";

interface Line {
  label: string;
  value: string;
}

interface Props {
  title: string;
  lines: Line[];
  note?: string;
  buttonLabel: string;
  onDone: () => void;
}

export function ResultCard({ title, lines, note, buttonLabel, onDone }: Props) {
  return (
    <View style={styles.wrapper}>
      <View style={styles.card}>
        <Text style={styles.title}>{title}</Text>
        {lines.map((line) => (
          <View key={line.label} style={styles.line}>
            <Text style={styles.label}>{line.label}</Text>
            <Text style={styles.value}>{line.value}</Text>
          </View>
        ))}
        {note ? <Text style={styles.note}>{note}</Text> : null}
      </View>
      <Button title={buttonLabel} onPress={onDone} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { gap: spacing.md },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.md,
  },
  title: { fontSize: fontSize.title, fontWeight: "800", color: colors.success },
  line: { gap: 2 },
  label: { fontSize: fontSize.small, color: colors.textMuted, fontWeight: "600" },
  value: { fontSize: fontSize.body, color: colors.text, fontWeight: "600" },
  note: { fontSize: fontSize.small, color: colors.textMuted },
});
