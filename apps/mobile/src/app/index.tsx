import { useEffect, useState } from "react";
import { Redirect } from "expo-router";
import { SplashView } from "../components/SplashView";
import { hasSeenWelcome } from "../lib/onboarding";
import { secureStorage } from "../lib/secure-storage";
import { useAuth } from "../lib/session";

export default function Index() {
  const { session, loading } = useAuth();
  const [welcomeSeen, setWelcomeSeen] = useState<boolean | null>(null);

  useEffect(() => {
    let active = true;
    void hasSeenWelcome(secureStorage).then((seen) => {
      if (active) {
        setWelcomeSeen(seen);
      }
    });
    return () => {
      active = false;
    };
  }, []);

  if (loading || welcomeSeen === null) {
    return <SplashView />;
  }
  if (session) {
    return <Redirect href="/home" />;
  }
  return <Redirect href={welcomeSeen ? "/phone" : "/welcome"} />;
}
