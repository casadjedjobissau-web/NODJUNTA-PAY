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
      }}
    />
  );
}
