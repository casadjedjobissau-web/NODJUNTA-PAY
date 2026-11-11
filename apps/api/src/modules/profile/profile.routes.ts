import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { ProfilePatch, ProfileService } from "./profile.types.js";

// strict(): campos como kycLevel são rejeitados — só o backend altera o nível de KYC.
const patchSchema = z
  .object({
    fullName: z.string().trim().min(2).max(120).optional(),
    language: z.enum(["pt", "kri"]).optional(),
  })
  .strict()
  .refine((value) => value.fullName !== undefined || value.language !== undefined, {
    message: "Indique pelo menos um campo para atualizar",
  });

export function registerProfileRoutes(scope: FastifyInstance, profiles: ProfileService): void {
  scope.get("/profile", async (request, reply) => {
    const user = request.authUser;
    if (!user) {
      return reply.status(401).send({ error: "unauthorized", message: "Autenticação necessária." });
    }
    return profiles.getOrCreate(user.id);
  });

  scope.patch("/profile", async (request, reply) => {
    const user = request.authUser;
    if (!user) {
      return reply.status(401).send({ error: "unauthorized", message: "Autenticação necessária." });
    }

    const parsed = patchSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: "invalid_body",
        message: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "),
      });
    }

    const patch: ProfilePatch = {};
    if (parsed.data.fullName !== undefined) {
      patch.fullName = parsed.data.fullName;
    }
    if (parsed.data.language !== undefined) {
      patch.language = parsed.data.language;
    }
    return profiles.update(user.id, patch);
  });
}
