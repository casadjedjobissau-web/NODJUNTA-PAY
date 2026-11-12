import * as Crypto from "expo-crypto";

// Uma chave por tentativa de operação. Se a rede falhar, a repetição usa a mesma chave.
export function newIdempotencyKey(): string {
  return Crypto.randomUUID();
}
