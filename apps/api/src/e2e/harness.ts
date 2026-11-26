import { randomBytes, randomInt } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export interface E2eConfig {
  url: string;
  anonKey: string;
  serviceKey: string;
}

export type E2eConfigResult = { ok: true; config: E2eConfig } | { ok: false; reason: string };

const LOCAL_HOSTS = new Set(["127.0.0.1", "localhost", "::1", "[::1]"]);

// Recusa tudo o que não seja um Supabase local, a menos que E2E_ALLOW_REMOTE=yes: estes testes criam dados reais.
export function readE2eConfig(source: Record<string, string | undefined> = process.env): E2eConfigResult {
  const url = (source.E2E_SUPABASE_URL ?? "").trim();
  const anonKey = (source.E2E_ANON_KEY ?? "").trim();
  const serviceKey = (source.E2E_SERVICE_ROLE_KEY ?? "").trim();

  for (const [name, value] of [
    ["E2E_SUPABASE_URL", url],
    ["E2E_ANON_KEY", anonKey],
    ["E2E_SERVICE_ROLE_KEY", serviceKey],
  ] as const) {
    if (value.length === 0) {
      return { ok: false, reason: `Falta a variável ${name}.` };
    }
  }

  let host: string;
  try {
    host = new URL(url).hostname;
  } catch {
    return { ok: false, reason: "E2E_SUPABASE_URL não é um endereço válido." };
  }

  if (!LOCAL_HOSTS.has(host) && source.E2E_ALLOW_REMOTE !== "yes") {
    return {
      ok: false,
      reason:
        "Recusado: E2E_SUPABASE_URL não é um Supabase local. Estes testes criam utilizadores, saldos e pedidos reais. " +
        "Se é mesmo um projeto de TESTES, repita com E2E_ALLOW_REMOTE=yes.",
    };
  }

  return { ok: true, config: { url, anonKey, serviceKey } };
}

// +245 e 9 dígitos, como o resto do sistema. O número é aleatório para as corridas não colidirem.
export function randomPhone(): string {
  return `2459${String(randomInt(0, 100_000_000)).padStart(8, "0")}`;
}

export function strongPassword(): string {
  return `${randomBytes(12).toString("base64url")}Aa1!`;
}

export interface TestUser {
  id: string;
  phone: string;
  email: string;
  password: string;
  token: string;
}

// Cria o utilizador pela API de administração do Supabase e entra com email e palavra-passe para obter um token real.
export async function createTestUser(config: E2eConfig, admin: SupabaseClient, label: string): Promise<TestUser> {
  const phone = randomPhone();
  const email = `${label}-${Date.now().toString(36)}-${randomBytes(4).toString("hex")}@example.com`;
  const password = strongPassword();

  const created = await admin.auth.admin.createUser({
    email,
    password,
    phone,
    email_confirm: true,
    phone_confirm: true,
  });
  if (created.error || !created.data.user) {
    throw new Error(`Não foi possível criar o utilizador de teste: ${created.error?.message ?? "sem dados"}`);
  }

  const client = createClient(config.url, config.anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const signedIn = await client.auth.signInWithPassword({ email, password });
  if (signedIn.error || !signedIn.data.session) {
    throw new Error(`Não foi possível entrar com o utilizador de teste: ${signedIn.error?.message ?? "sem sessão"}`);
  }

  return { id: created.data.user.id, phone, email, password, token: signedIn.data.session.access_token };
}
