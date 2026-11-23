import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { AppState } from "react-native";
import { api } from "./api";

interface UnreadValue {
  unread: number;
  refresh: () => Promise<void>;
  setUnread: (count: number) => void;
}

const UnreadContext = createContext<UnreadValue | null>(null);

export function UnreadProvider({ children }: { children: ReactNode }) {
  const [unread, setUnread] = useState(0);

  // Pede só uma notificação, porque o que interessa é o contador. Falhas são ignoradas.
  const refresh = useCallback(async () => {
    try {
      const page = await api.request<{ unreadCount: number }>("/v1/notifications?limit=1");
      setUnread(Number.isFinite(page.unreadCount) ? Math.max(0, page.unreadCount) : 0);
    } catch {
      return;
    }
  }, []);

  useEffect(() => {
    void refresh();
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") {
        void refresh();
      }
    });
    return () => subscription.remove();
  }, [refresh]);

  const value = useMemo<UnreadValue>(() => ({ unread, refresh, setUnread }), [unread, refresh]);

  return <UnreadContext.Provider value={value}>{children}</UnreadContext.Provider>;
}

export function useUnread(): UnreadValue {
  const context = useContext(UnreadContext);
  if (!context) {
    throw new Error("useUnread tem de ser usado dentro de UnreadProvider");
  }
  return context;
}
