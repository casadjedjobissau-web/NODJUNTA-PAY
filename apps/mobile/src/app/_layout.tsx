import { useEffect } from "react";
import { Slot } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { AuthProvider, useAuth } from "../lib/session";

void SplashScreen.preventAutoHideAsync().catch(() => undefined);

function SplashController() {
  const { loading } = useAuth();

  useEffect(() => {
    if (!loading) {
      void SplashScreen.hideAsync().catch(() => undefined);
    }
  }, [loading]);

  return null;
}

export default function RootLayout() {
  return (
    <AuthProvider>
      <StatusBar style="dark" />
      <SplashController />
      <Slot />
    </AuthProvider>
  );
}
