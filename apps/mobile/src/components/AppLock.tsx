import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AppState, StyleSheet, Text, View } from "react-native";
import * as LocalAuthentication from "expo-local-authentication";
import { Logo } from "../design/Logo";
import { colors, fontSizes, fontWeights, lineHeights, spacing } from "../design/tokens";
import {
  canEnable,
  loadEnabled,
  saveEnabled,
  shouldLockOnResume,
  unlockMessage,
  unlockOutcome,
} from "../lib/app-lock";
import { secureStorage } from "../lib/secure-storage";
import { useAuth } from "../lib/session";
import { Button } from "./Button";
import { SplashView } from "./SplashView";

type SetEnabledResult = { ok: true } | { ok: false; message: string };

interface AppLockValue {
  enabled: boolean;
  setEnabled: (next: boolean) => Promise<SetEnabledResult>;
}

const AppLockContext = createContext<AppLockValue | null>(null);

const PROMPT = "Desbloqueie a NODJUNTA-PAY";

export function AppLockProvider({ children }: { children: ReactNode }) {
  const { signOut } = useAuth();
  const [loading, setLoading] = useState(true);
  const [enabled, setEnabledState] = useState(false);
  const [locked, setLocked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const backgroundedAt = useRef<number | null>(null);
  const asking = useRef(false);

  // Ao arrancar com o bloqueio ligado, a app começa bloqueada.
  useEffect(() => {
    let active = true;
    void loadEnabled(secureStorage).then((on) => {
      if (!active) {
        return;
      }
      setEnabledState(on);
      setLocked(on);
      setLoading(false);
    });
    return () => {
      active = false;
    };
  }, []);

  // Só conta o estado "background": no iOS o próprio pedido de biometria passa por "inactive".
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "background") {
        backgroundedAt.current = Date.now();
        return;
      }
      if (state === "active") {
        const at = backgroundedAt.current;
        backgroundedAt.current = null;
        if (at !== null && shouldLockOnResume({ enabled, backgroundedAt: at, now: Date.now() })) {
          setLocked(true);
        }
      }
    });
    return () => subscription.remove();
  }, [enabled]);

  const unlock = useCallback(async () => {
    if (asking.current) {
      return;
    }
    asking.current = true;
    setBusy(true);
    setMessage(null);
    try {
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: PROMPT,
        cancelLabel: "Cancelar",
      });
      const outcome = unlockOutcome(result);
      if (outcome === "unlocked") {
        setLocked(false);
      } else {
        setMessage(unlockMessage(outcome));
      }
    } catch {
      setMessage(unlockMessage("failed"));
    } finally {
      asking.current = false;
      setBusy(false);
    }
  }, []);

  // Pede a biometria logo que a app fica bloqueada.
  const unlockRef = useRef(unlock);
  unlockRef.current = unlock;
  useEffect(() => {
    if (locked && !loading) {
      void unlockRef.current();
    }
  }, [locked, loading]);

  const setEnabled = useCallback(async (next: boolean): Promise<SetEnabledResult> => {
    if (!next) {
      await saveEnabled(secureStorage, false);
      setEnabledState(false);
      return { ok: true };
    }
    try {
      const [hasHardware, isEnrolled] = await Promise.all([
        LocalAuthentication.hasHardwareAsync(),
        LocalAuthentication.isEnrolledAsync(),
      ]);
      const check = canEnable({ hasHardware, isEnrolled });
      if (!check.ok) {
        return check;
      }
      // Só se liga depois de uma verificação com sucesso, para ninguém ficar bloqueado sem poder entrar.
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: "Confirme para ligar o bloqueio",
        cancelLabel: "Cancelar",
      });
      const outcome = unlockOutcome(result);
      if (outcome !== "unlocked") {
        return { ok: false, message: unlockMessage(outcome) ?? "Não foi possível ligar o bloqueio." };
      }
      await saveEnabled(secureStorage, true);
      setEnabledState(true);
      return { ok: true };
    } catch {
      return { ok: false, message: "Não foi possível ligar o bloqueio. Tente outra vez." };
    }
  }, []);

  const value = useMemo<AppLockValue>(() => ({ enabled, setEnabled }), [enabled, setEnabled]);

  if (loading) {
    return <SplashView />;
  }

  return (
    <AppLockContext.Provider value={value}>
      <View
        style={styles.fill}
        accessibilityElementsHidden={locked}
        importantForAccessibility={locked ? "no-hide-descendants" : "auto"}
      >
        {children}
      </View>
      {locked ? (
        <View style={styles.overlay} accessibilityViewIsModal>
          <Logo size={72} tone="onDark" />
          <Text style={styles.title} accessibilityRole="header">
            NODJUNTA-PAY bloqueada
          </Text>
          <Text style={styles.text}>Desbloqueie com a biometria ou com o código do telemóvel.</Text>
          {message ? <Text style={styles.message}>{message}</Text> : null}
          <View style={styles.buttons}>
            <Button title="Desbloquear" onPress={() => void unlock()} loading={busy} />
            <Button title="Terminar sessão" onPress={() => void signOut()} variant="secondary" disabled={busy} />
          </View>
        </View>
      ) : null}
    </AppLockContext.Provider>
  );
}

export function useAppLock(): AppLockValue {
  const context = useContext(AppLockContext);
  if (!context) {
    throw new Error("useAppLock tem de ser usado dentro de AppLockProvider");
  }
  return context;
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: colors.surfaceInverse,
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.lg,
    gap: spacing.md,
  },
  title: {
    fontSize: fontSizes.title,
    lineHeight: lineHeights.title,
    fontWeight: fontWeights.heavy,
    color: colors.surface,
    textAlign: "center",
  },
  text: { fontSize: fontSizes.body, lineHeight: lineHeights.body, color: colors.surface, textAlign: "center" },
  message: { fontSize: fontSizes.small, color: colors.brand, textAlign: "center" },
  buttons: { alignSelf: "stretch", gap: spacing.sm, marginTop: spacing.md },
});
