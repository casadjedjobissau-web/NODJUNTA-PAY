import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Env } from "../config/env.js";
import type { Authenticator } from "../plugins/auth.js";
import { readAal } from "./jwt-claims.js";

export function createSupabaseAdmin(env: Env): SupabaseClient {
  return createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export function createSupabaseAuthenticator(client: SupabaseClient): Authenticator {
  return async (token) => {
    // O Supabase valida a assinatura e a validade do token. Só depois lemos o nível aal.
    const { data, error } = await client.auth.getUser(token);
    if (error || !data.user) {
      return null;
    }
    return {
      id: data.user.id,
      phone: data.user.phone ? data.user.phone : null,
      lastSignInAt: data.user.last_sign_in_at ?? null,
      aal: readAal(token),
    };
  };
}
