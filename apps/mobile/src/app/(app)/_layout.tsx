import { Redirect, Stack } from "expo-router";
import { useAuth } from "../../lib/session";
import { colors } from "../../theme";

export default function AppLayout() {
  const { session, loading } = useAuth();

  if (loading) {
    return null;
  }
  if (!session) {
    return <Redirect href="/phone" />;
  }
  return (
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
      <Stack.Screen name="deposit" options={{ title: "Depositar" }} />
      <Stack.Screen name="withdraw" options={{ title: "Levantar" }} />
      <Stack.Screen name="funding" options={{ title: "Depósitos e levantamentos" }} />
      <Stack.Screen name="limits" options={{ title: "Limites e tarifas" }} />
      <Stack.Screen name="kyc" options={{ title: "Verificação de identidade" }} />
    </Stack>
  );
}
