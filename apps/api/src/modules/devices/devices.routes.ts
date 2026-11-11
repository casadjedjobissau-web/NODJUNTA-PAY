import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { DeviceService } from "./devices.types.js";

const deviceIdSchema = z
  .string()
  .min(8)
  .max(128)
  .regex(/^[A-Za-z0-9._-]+$/, "deviceId contém caracteres inválidos");

const registerSchema = z
  .object({
    deviceId: deviceIdSchema,
    platform: z.enum(["ios", "android"]),
    pushToken: z.string().min(1).max(512).optional(),
  })
  .strict();

export function registerDeviceRoutes(scope: FastifyInstance, devices: DeviceService): void {
  scope.post("/devices", async (request, reply) => {
    const user = request.authUser;
    if (!user) {
      return reply.status(401).send({ error: "unauthorized", message: "Autenticação necessária." });
    }

    const parsed = registerSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: "invalid_body",
        message: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "),
      });
    }

    await devices.register(user.id, {
      deviceId: parsed.data.deviceId,
      platform: parsed.data.platform,
      pushToken: parsed.data.pushToken ?? null,
    });
    return { ok: true };
  });

  scope.delete("/devices/:deviceId", async (request, reply) => {
    const user = request.authUser;
    if (!user) {
      return reply.status(401).send({ error: "unauthorized", message: "Autenticação necessária." });
    }

    const params = z.object({ deviceId: deviceIdSchema }).safeParse(request.params);
    if (!params.success) {
      return reply.status(400).send({ error: "invalid_params", message: "deviceId inválido." });
    }

    await devices.remove(user.id, params.data.deviceId);
    return reply.status(204).send();
  });
}
