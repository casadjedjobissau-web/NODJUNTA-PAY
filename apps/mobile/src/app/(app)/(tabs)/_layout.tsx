import { Tabs } from "expo-router";
import { colors } from "../../../theme";

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: colors.primary },
        headerTintColor: colors.surface,
        headerTitleStyle: { fontWeight: "700" },
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarIconStyle: { display: "none" },
        tabBarLabelStyle: { fontSize: 14, fontWeight: "600", marginBottom: 12 },
        tabBarStyle: { height: 64 },
      }}
    >
      <Tabs.Screen name="home" options={{ title: "Início", tabBarLabel: "Início" }} />
      <Tabs.Screen name="send" options={{ title: "Enviar dinheiro", tabBarLabel: "Enviar" }} />
      <Tabs.Screen name="pay" options={{ title: "Pagar", tabBarLabel: "Pagar" }} />
      <Tabs.Screen name="more" options={{ title: "Mais", tabBarLabel: "Mais" }} />
    </Tabs>
  );
}
