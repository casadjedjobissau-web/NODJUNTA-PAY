import { useState } from "react";
import { Linking, StyleSheet, Text, View } from "react-native";
import { colors, fontSizes, lineHeights, spacing } from "../design/tokens";
import { FALLBACK_CONTACTS, telUrl, type SupportContact } from "../lib/support";
import { Button } from "./Button";

interface Props {
  intro: string;
  contacts?: readonly SupportContact[];
}

export function SupportContacts({ intro, contacts = FALLBACK_CONTACTS }: Props) {
  const [error, setError] = useState<string | null>(null);

  async function onCall(contact: SupportContact) {
    const url = telUrl(contact.e164);
    setError(null);
    if (!url) {
      return;
    }
    try {
      await Linking.openURL(url);
    } catch {
      setError("Não foi possível abrir o marcador do telemóvel. Ligue para o número mostrado.");
    }
  }

  return (
    <View style={styles.wrapper}>
      <Text style={styles.intro}>{intro}</Text>
      {contacts.map((contact) => (
        <Button
          key={contact.e164}
          title={`Ligar ${contact.display}`}
          onPress={() => void onCall(contact)}
          variant="secondary"
        />
      ))}
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { gap: spacing.sm, marginTop: spacing.md },
  intro: { fontSize: fontSizes.small, lineHeight: lineHeights.small, color: colors.textSecondary },
  error: { fontSize: fontSizes.small, color: colors.error },
});
