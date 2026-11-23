import { Redirect, Stack } from "expo-router";
import { DeviceRegistrar } from "../../components/DeviceRegistrar";
import { PinGate } from "../../components/PinGate";
import { PinPromptProvider } from "../../components/PinPrompt";
import { PinStatusProvider } from "../../lib/pin-status";
import { useAuth } from "../../lib/session";
import { UnreadProvider } from "../../lib/unread";
import { colors } from "../../theme";

export default function AppLayout() {
  const { session, loading } = useAuth();

  if (loading) {
    return null;
  }
  if (!session) {
    return <Redirect href="/" />;
  }

  return (
    <PinPromptProvider>
      <PinStatusProvider>
        <UnreadProvider>
          <DeviceRegistrar />
          <PinGate>
            <Stack
              screenOptions={{
                headerStyle: { backgroundColor: colors.primary },
                headerTintColor: colors.surface,
                headerTitleStyle: { fontWeight: "700" },
                headerBackTitle: "Voltar",
              }}
            >
              <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
              <Stack.Screen name="statement" options={{ title: "Extrato" }} />
              <Stack.Screen name="receipt" options={{ title: "Recibo" }} />
              <Stack.Screen name="deposit" options={{ title: "Depositar" }} />
              <Stack.Screen name="withdraw" options={{ title: "Levantar" }} />
              <Stack.Screen name="funding" options={{ title: "Depósitos e levantamentos" }} />
              <Stack.Screen name="limits" options={{ title: "Limites e tarifas" }} />
              <Stack.Screen name="kyc" options={{ title: "Verificação de identidade" }} />
              <Stack.Screen name="merchant" options={{ title: "Sou comerciante" }} />
              <Stack.Screen name="notifications" options={{ title: "Notificações" }} />
              <Stack.Screen
                name="pin-setup"
                options={{ title: "Criar PIN", headerBackVisible: false, gestureEnabled: false }}
              />
              <Stack.Screen name="pin-change" options={{ title: "Alterar PIN" }} />
              <Stack.Screen name="pin-reset" options={{ title: "Recuperar PIN" }} />
            </Stack>
          </PinGate>
        </UnreadProvider>
      </PinStatusProvider>
    </PinPromptProvider>
  );
}
