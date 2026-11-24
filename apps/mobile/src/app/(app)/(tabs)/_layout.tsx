import { Tabs } from "expo-router";
import { Icon } from "../../../components/Icon";
import type { IconName } from "../../../design/icons";
import { colors, fontSizes, fontWeights } from "../../../design/tokens";
import { badgeText } from "../../../lib/badge";
import { useUnread } from "../../../lib/unread";

function tabIcon(name: IconName) {
  return function TabIcon({ color, size }: { color: string; size: number }) {
    return <Icon name={name} size={size} color={color} />;
  };
}

export default function TabsLayout() {
  const { unread } = useUnread();

  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: colors.surfaceInverse },
        headerTintColor: colors.surface,
        headerTitleStyle: { fontWeight: fontWeights.bold },
        tabBarActiveTintColor: colors.brandText,
        tabBarInactiveTintColor: colors.textSecondary,
        tabBarLabelStyle: { fontSize: fontSizes.small, fontWeight: fontWeights.semibold },
        tabBarStyle: { height: 64, paddingTop: 6, paddingBottom: 8 },
        tabBarBadgeStyle: { backgroundColor: colors.brand, color: colors.textPrimary },
      }}
    >
      <Tabs.Screen name="home" options={{ title: "Início", tabBarLabel: "Início", tabBarIcon: tabIcon("home") }} />
      <Tabs.Screen
        name="send"
        options={{ title: "Enviar dinheiro", tabBarLabel: "Enviar", tabBarIcon: tabIcon("send") }}
      />
      <Tabs.Screen name="pay" options={{ title: "Pagar", tabBarLabel: "Pagar", tabBarIcon: tabIcon("qr") }} />
      <Tabs.Screen
        name="more"
        options={{ title: "Mais", tabBarLabel: "Mais", tabBarIcon: tabIcon("user"), tabBarBadge: badgeText(unread) }}
      />
    </Tabs>
  );
}
