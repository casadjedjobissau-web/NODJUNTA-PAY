import { StyleSheet } from "react-native";
import { colors, spacing } from "../design/tokens";
import { Card } from "./Card";
import { Icon } from "./Icon";
import { ListRow } from "./ListRow";

interface Option<T extends string> {
  value: T;
  label: string;
}

interface Props<T extends string> {
  options: readonly Option<T>[];
  selected: T | null;
  onSelect: (value: T) => void;
}

export function OptionList<T extends string>({ options, selected, onSelect }: Props<T>) {
  return (
    <Card padded={false} style={styles.card}>
      {options.map((option, index) => {
        const isSelected = option.value === selected;
        return (
          <ListRow
            key={option.value}
            title={option.label}
            subtitle={isSelected ? "Selecionado" : null}
            right={isSelected ? <Icon name="check" size={22} color={colors.brandText} /> : null}
            onPress={() => onSelect(option.value)}
            last={index === options.length - 1}
          />
        );
      })}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { paddingHorizontal: spacing.md },
});
