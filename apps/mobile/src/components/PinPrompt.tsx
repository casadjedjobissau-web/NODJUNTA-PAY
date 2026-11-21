import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Modal, StyleSheet, Text, View } from "react-native";
import { colors, fontSizes, fontWeights, lineHeights, radius, spacing } from "../design/tokens";
import { isComplete } from "../lib/pin-entry";
import { Button } from "./Button";
import { PinPad } from "./PinPad";

export interface PinPromptOptions {
  title: string;
  message?: string;
}

type RequestPin = (options: PinPromptOptions) => Promise<string | null>;

const PinPromptContext = createContext<RequestPin | null>(null);

// Fundo escuro translúcido, derivado do preto da marca (#101820).
const BACKDROP = "rgba(16, 24, 32, 0.6)";

export function PinPromptProvider({ children }: { children: ReactNode }) {
  const [options, setOptions] = useState<PinPromptOptions | null>(null);
  const [digits, setDigits] = useState("");
  const resolver = useRef<((pin: string | null) => void) | null>(null);

  const requestPin = useCallback<RequestPin>((next) => {
    // Só uma pergunta de cada vez: um segundo pedido recebe "cancelado".
    if (resolver.current) {
      return Promise.resolve(null);
    }
    return new Promise<string | null>((resolve) => {
      resolver.current = resolve;
      setDigits("");
      setOptions(next);
    });
  }, []);

  const finish = useCallback((pin: string | null) => {
    const resolve = resolver.current;
    resolver.current = null;
    setOptions(null);
    setDigits("");
    resolve?.(pin);
  }, []);

  useEffect(
    () => () => {
      const resolve = resolver.current;
      resolver.current = null;
      resolve?.(null);
    },
    [],
  );

  function onChange(next: string) {
    setDigits(next);
    if (isComplete(next)) {
      finish(next);
    }
  }

  const value = useMemo(() => requestPin, [requestPin]);

  return (
    <PinPromptContext.Provider value={value}>
      {children}
      <Modal
        visible={options !== null}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() => finish(null)}
      >
        <View style={styles.backdrop}>
          <View style={styles.sheet}>
            <Text style={styles.title} accessibilityRole="header">
              {options?.title ?? ""}
            </Text>
            {options?.message ? <Text style={styles.message}>{options.message}</Text> : null}
            <PinPad value={digits} onChange={onChange} />
            <Button title="Cancelar" variant="secondary" onPress={() => finish(null)} />
          </View>
        </View>
      </Modal>
    </PinPromptContext.Provider>
  );
}

// Devolve uma função que mostra a folha do PIN e resolve com o PIN, ou com null se o utilizador cancelar.
export function usePinPrompt(): RequestPin {
  const context = useContext(PinPromptContext);
  if (!context) {
    throw new Error("usePinPrompt tem de ser usado dentro de PinPromptProvider");
  }
  return context;
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: "flex-end", backgroundColor: BACKDROP },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    padding: spacing.lg,
    gap: spacing.md,
  },
  title: {
    fontSize: fontSizes.title,
    lineHeight: lineHeights.title,
    fontWeight: fontWeights.heavy,
    color: colors.textPrimary,
  },
  message: { fontSize: fontSizes.body, lineHeight: lineHeights.body, color: colors.textSecondary },
});
