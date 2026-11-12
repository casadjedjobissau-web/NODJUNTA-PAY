import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { api } from "./lib/api";
import { ApiError } from "./lib/api-client";
import { userMessage } from "./lib/errors";
import { supabase } from "./lib/supabase";
import type { AdminMe } from "./lib/types";

export type AuthStatus = "loading" | "signedOut" | "denied" | "error" | "ready";

interface AuthContextValue {
  status: AuthStatus;
  me: AdminMe | null;
  email: string | null;
  error: string | null;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  retry: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [booting, setBooting] = useState(true);
  const [me, setMe] = useState<AdminMe | null>(null);
  const [checking, setChecking] = useState(false);
  const [denied, setDenied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;

    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (active) {
          setSession(data.session);
        }
      })
      .finally(() => {
        if (active) {
          setBooting(false);
        }
      });

    const { data } = supabase.auth.onAuthStateChange((_event, next) => {
      if (active) {
        setSession(next);
      }
    });

    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, []);

  const userId = session?.user.id ?? null;

  // Confirma na API se este utilizador é administrador e com que permissões.
  useEffect(() => {
    if (!userId) {
      setMe(null);
      setDenied(false);
      setError(null);
      return;
    }

    let active = true;
    setChecking(true);
    api
      .me()
      .then((view) => {
        if (active) {
          setMe(view);
          setDenied(false);
          setError(null);
        }
      })
      .catch((err: unknown) => {
        if (!active) {
          return;
        }
        setMe(null);
        if (err instanceof ApiError && err.status === 403) {
          setDenied(true);
          setError(null);
        } else {
          setDenied(false);
          setError(userMessage(err));
        }
      })
      .finally(() => {
        if (active) {
          setChecking(false);
        }
      });

    return () => {
      active = false;
    };
  }, [userId, attempt]);

  const value = useMemo<AuthContextValue>(() => {
    let status: AuthStatus;
    if (booting || (userId !== null && checking)) {
      status = "loading";
    } else if (userId === null) {
      status = "signedOut";
    } else if (denied) {
      status = "denied";
    } else if (me) {
      status = "ready";
    } else {
      status = "error";
    }

    return {
      status,
      me,
      email: session?.user.email ?? null,
      error,
      signIn: async (email, password) => {
        const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
        if (signInError) {
          const invalid = signInError.message.toLowerCase().includes("invalid login credentials");
          throw new Error(invalid ? "Email ou palavra-passe incorretos." : "Não foi possível entrar. Tente novamente.");
        }
      },
      signOut: async () => {
        await supabase.auth.signOut();
      },
      retry: () => setAttempt((value) => value + 1),
    };
  }, [booting, checking, userId, denied, me, error, session]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth tem de ser usado dentro de AuthProvider");
  }
  return context;
}
