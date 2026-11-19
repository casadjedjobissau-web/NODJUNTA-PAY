export type AuthenticatorLevel = "aal1" | "aal2";

// Lê o nível de garantia (aal) do token. NÃO verifica a assinatura: só deve ser chamado depois de o
// Supabase Auth já ter validado o token (getUser). Em qualquer dúvida devolve null (falha fechada).
export function readAal(token: string): AuthenticatorLevel | null {
  const parts = token.split(".");
  if (parts.length !== 3) {
    return null;
  }
  const payload = parts[1];
  if (!payload) {
    return null;
  }

  try {
    const json: unknown = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (typeof json !== "object" || json === null) {
      return null;
    }
    const aal = (json as { aal?: unknown }).aal;
    return aal === "aal1" || aal === "aal2" ? aal : null;
  } catch {
    return null;
  }
}
