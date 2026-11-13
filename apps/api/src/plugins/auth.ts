import type { FastifyReply, FastifyRequest } from "fastify";

export interface AuthUser {
  id: string;
  phone: string | null;
  lastSignInAt?: string | null;
}

export type Authenticator = (token: string) => Promise<AuthUser | null>;

declare module "fastify" {
  interface FastifyRequest {
    authUser: AuthUser | null;
  }
}

function unauthorized(reply: FastifyReply) {
  return reply
    .status(401)
    .send({ error: "unauthorized", message: "Autenticação necessária ou inválida." });
}

export function createAuthHook(authenticator: Authenticator) {
  return async function requireAuth(request: FastifyRequest, reply: FastifyReply) {
    const header = request.headers.authorization;
    if (!header || !header.startsWith("Bearer ")) {
      return unauthorized(reply);
    }
    const token = header.slice("Bearer ".length).trim();
    if (token.length === 0) {
      return unauthorized(reply);
    }

    let user: AuthUser | null;
    try {
      user = await authenticator(token);
    } catch (err) {
      request.log.error({ err }, "falha ao validar token");
      return reply
        .status(503)
        .send({ error: "auth_unavailable", message: "Serviço de autenticação indisponível." });
    }

    if (!user) {
      return unauthorized(reply);
    }
    request.authUser = user;
  };
}
