import { ApiError } from "./api-client";

// Falha "ambígua": não sabemos se o servidor chegou a processar o pedido.
export function isAmbiguousFailure(error: unknown): boolean {
  if (error instanceof ApiError) {
    return error.code === "network_error" || error.status >= 500;
  }
  return false;
}

/**
 * Guarda a chave de idempotência da tentativa em curso.
 * - Dados iguais (mesma impressão digital) reutilizam a mesma chave.
 * - Dados diferentes geram uma chave nova.
 * - Depois de um sucesso (reset) ou de um erro definitivo (settle) a chave é descartada.
 * - Depois de uma falha ambígua a chave é mantida: repetir não cobra duas vezes.
 */
export function createAttemptKeeper(generate: () => string) {
  let key: string | null = null;
  let current: string | null = null;

  return {
    acquire(fingerprint: string): string {
      if (key === null || current !== fingerprint) {
        key = generate();
        current = fingerprint;
      }
      return key;
    },
    reset(): void {
      key = null;
      current = null;
    },
    settle(error: unknown): void {
      if (!isAmbiguousFailure(error)) {
        key = null;
        current = null;
      }
    },
  };
}
