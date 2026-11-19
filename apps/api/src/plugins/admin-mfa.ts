import type { FastifyReply, FastifyRequest } from "fastify";

export const MFA_REQUIRED_MESSAGE =
  "A administração exige verificação em dois passos. Ative e confirme o autenticador e tente novamente.";

// Usado depois do hook de autenticação, antes de qualquer verificação de papel.
// Falha fechada: sem a prova de que o token foi emitido com o segundo fator, o acesso é recusado.
export function createAdminMfaGuard() {
  return async function requireAdminMfa(request: FastifyRequest, reply: FastifyReply) {
    const user = request.authUser;
    if (!user) {
      return reply.status(401).send({ error: "unauthorized", message: "Autenticação necessária." });
    }
    if (user.aal === "aal2") {
      return;
    }
    return reply.status(403).send({ error: "mfa_required", message: MFA_REQUIRED_MESSAGE });
  };
}
