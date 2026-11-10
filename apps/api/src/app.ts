import Fastify from "fastify";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import type { Env } from "./config/env.js";

export async function buildApp(env: Env) {
  const app = Fastify({
    logger:
      env.NODE_ENV === "test"
        ? false
        : {
            level: env.LOG_LEVEL,
            redact: {
              paths: [
                "req.headers.authorization",
                "req.headers.cookie",
                'req.headers["x-api-key"]',
                'req.headers["x-webhook-signature"]',
              ],
              censor: "[REDACTED]",
            },
          },
    trustProxy: true,
    bodyLimit: 1_048_576,
  });

  await app.register(helmet);
  await app.register(cors, {
    origin: env.CORS_ORIGINS.length > 0 ? env.CORS_ORIGINS : false,
  });
  await app.register(rateLimit, { max: 100, timeWindow: "1 minute" });

  app.setErrorHandler((error, request, reply) => {
    const statusCode =
      typeof error.statusCode === "number" && error.statusCode >= 400 ? error.statusCode : 500;
    if (statusCode >= 500) {
      request.log.error({ err: error }, "erro interno");
      return reply.status(500).send({ error: "internal_error", message: "Erro interno do servidor." });
    }
    return reply.status(statusCode).send({ error: "request_error", message: error.message });
  });

  app.setNotFoundHandler((_request, reply) =>
    reply.status(404).send({ error: "not_found", message: "Recurso não encontrado." }),
  );

  app.get("/health", async () => ({
    status: "ok",
    service: "nodjunta-pay-api",
    currency: env.DEFAULT_CURRENCY,
    time: new Date().toISOString(),
  }));

  return app;
}
