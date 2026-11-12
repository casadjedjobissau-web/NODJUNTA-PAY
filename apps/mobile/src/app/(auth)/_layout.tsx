import { Redirect, Stack } from "expo-router";
import { useAuth } from "../../lib/session";

export default function AuthLayout() {
  const { session, loading } = useAuth();

  if (loading) {
    return null;
  }
  if (session) {
    return <Redirect href="/home" />;
  }
  return <Stack screenOptions={{ headerShown: false }} />;
}
