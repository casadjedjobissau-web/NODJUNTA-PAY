import { z } from "zod";

const optionalSecret = z.preprocess(
  (value) => (value === "" ? undefined : value),
  z.string().min(32, "o segredo deve ter pelo menos 32 caracteres").optional(),
);

const envSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "staging", "production"]).default("development"),
    PORT: z.coerce.number().int().min(1).max(65535).default(3000),
    HOST: z.string().min(1).default("0.0.0.0"),
    LOG_LEVEL: z
      .enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"])
      .default("info"),
    CORS_ORIGINS: z
      .string()
      .default("")
      .transform((value) =>
        value
          .split(",")
          .map((item) => item.trim())
          .filter((item) => item.length > 0),
      ),
    DEFAULT_CURRENCY: z
      .string()
      .regex(/^[A-Z]{3}$/, "DEFAULT_CURRENCY deve ser um código ISO 4217 de 3 letras maiúsculas"),
    SUPABASE_URL: z.string().url(),
    SUPABASE_SERVICE_ROLE_KEY: z.string().min(20),
    SANDBOX_ENABLED: z
      .enum(["true", "false"])
      .default("false")
      .transform((value) => value === "true"),
    WEBHOOK_SECRET_SANDBOX: optionalSecret,
    PIN_PEPPER: z.string().min(32, "PIN_PEPPER deve ter pelo menos 32 caracteres"),
    PIN_ENFORCEMENT: z
      .enum(["on", "off"])
      .default("on")
      .transform((value) => value === "on"),
    SUPPORT_PHONES: z
      .string()
      .default("+245956191968,+245956656700")
      .transform((value) =>
        value
          .split(",")
          .map((item) => item.replace(/\s/g, ""))
          .filter((item) => item.length > 0),
      )
      .refine(
        (list) => list.every((phone) => /^\+[0-9]{8,15}$/.test(phone)),
        "SUPPORT_PHONES deve conter números internacionais (+...) separados por vírgulas",
      ),
  })
  .superRefine((value, ctx) => {
    if (value.NODE_ENV === "production" && value.SANDBOX_ENABLED) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["SANDBOX_ENABLED"],
        message: "SANDBOX_ENABLED não pode ser true em produção",
      });
    }
    if (value.NODE_ENV === "production" && value.WEBHOOK_SECRET_SANDBOX !== undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["WEBHOOK_SECRET_SANDBOX"],
        message: "WEBHOOK_SECRET_SANDBOX não pode ser definido em produção",
      });
    }
    if (value.NODE_ENV === "production" && !value.PIN_ENFORCEMENT) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["PIN_ENFORCEMENT"],
        message: "PIN_ENFORCEMENT não pode ser off em produção",
      });
    }
  });

export type Env = z.infer<typeof envSchema>;

export function loadEnv(source: NodeJS.ProcessEnv | Record<string, string | undefined>): Env {
  const result = envSchema.safeParse(source);
  if (!result.success) {
    const details = result.error.issues
      .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
      .join("; ");
    throw new Error(`Configuração de ambiente inválida: ${details}`);
  }
  return result.data;
}
