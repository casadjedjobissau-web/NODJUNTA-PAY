import { useCallback, useEffect, useRef, useState } from "react";
import { userMessage } from "./errors";

export interface LoadState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  reload: () => void;
}

// Carrega dados quando `key` muda e devolve estado, erro e uma função para recarregar.
export function useLoad<T>(loader: () => Promise<T>, key: string): LoadState<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const loaderRef = useRef(loader);
  loaderRef.current = loader;

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);

    loaderRef
      .current()
      .then((value) => {
        if (active) {
          setData(value);
        }
      })
      .catch((err: unknown) => {
        if (active) {
          setError(userMessage(err));
        }
      })
      .finally(() => {
        if (active) {
          setLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [key, tick]);

  const reload = useCallback(() => setTick((value) => value + 1), []);

  return { data, loading, error, reload };
}
