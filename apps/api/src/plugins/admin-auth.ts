import type { FastifyReply, FastifyRequest } from "fastify";
import { can, type AdminPermission, type AdminRole } from "../lib/admin-permissions.js";
import type { AdminService } from "../modules/admin/admin.types.js";

declare module "fastify" {
  interface FastifyRequest {
    adminRole: AdminRole | null;
  }
}

// Usado depois do hook de autenticação: confirma o papel na base de dados a cada pedido
// e valida a permissão exigida pela rota.
export function createAdminGuard(admin: AdminService) {
  return function requirePermission(permission: AdminPermission) {
    return async function guard(request: FastifyRequest, reply: FastifyReply) {
      const user = request.authUser;
      if (!user) {
        return reply.status(401).send({ error: "unauthorized", message: "Autenticação necessária." });
      }

      const role = await admin.getRole(user.id);
      if (!role) {
        return reply
          .status(403)
          .send({ error: "forbidden", message: "Acesso reservado a administradores." });
      }
      if (!can(role, permission)) {
        return reply
          .status(403)
          .send({ error: "forbidden", message: "Sem permissão para esta operação." });
      }
      request.adminRole = role;
    };
  };
}
