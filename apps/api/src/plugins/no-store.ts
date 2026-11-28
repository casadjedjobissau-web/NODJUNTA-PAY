import type { FastifyReply, FastifyRequest } from "fastify";

// Nenhuma resposta da API deve ser guardada por proxies ou caches intermédios: há saldos, movimentos e dados pessoais.
// Se a rota já definiu o seu próprio valor, esse valor mantém-se.
export function createNoStoreHook() {
  return async function noStore(_request: FastifyRequest, reply: FastifyReply, payload: unknown): Promise<unknown> {
    if (!reply.hasHeader("cache-control")) {
      reply.header("cache-control", "no-store");
    }
    return payload;
  };
}
