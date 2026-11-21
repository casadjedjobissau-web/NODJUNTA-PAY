import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { api } from "./api";
import { userMessage } from "./errors";

export interface PinStatusResponse {
  hasPin: boolean;
  locked: boolean;
  lockedUntil: string | null;
}

type LoadState = "loading" | "ready" | "error";

interface PinStatusValue {
  state: LoadState;
  hasPin: boolean;
  locked: boolean;
  lockedUntil: string | null;
  error: string | null;
  refresh: () => Promise<void>;
}

const PinStatusContext = createContext<PinStatusValue | null>(null);

export function PinStatusProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<LoadState>("loading");
  const [status, setStatus] = useState<PinStatusResponse>({ hasPin: false, locked: false, lockedUntil: null });
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const next = await api.request<PinStatusResponse>("/v1/pin");
      setStatus(next);
      setError(null);
      setState("ready");
    } catch (err) {
      setError(userMessage(err));
      // Se já havia um estado conhecido, mantém-no em vez de bloquear a app.
      setState((previous) => (previous === "ready" ? "ready" : "error"));
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const value = useMemo<PinStatusValue>(
    () => ({
      state,
      hasPin: status.hasPin,
      locked: status.locked,
      lockedUntil: status.lockedUntil,
      error,
      refresh,
    }),
    [state, status, error, refresh],
  );

  return <PinStatusContext.Provider value={value}>{children}</PinStatusContext.Provider>;
}

export function usePinStatus(): PinStatusValue {
  const context = useContext(PinStatusContext);
  if (!context) {
    throw new Error("usePinStatus tem de ser usado dentro de PinStatusProvider");
  }
  return context;
}
