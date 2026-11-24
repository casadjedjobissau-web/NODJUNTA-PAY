export const TOTP_LENGTH = 6;

// Só dígitos ASCII, no máximo 6.
export function sanitizeTotp(text: string): string {
  return text.replace(/\D/g, "").slice(0, TOTP_LENGTH);
}

export function isValidTotpCode(code: string): boolean {
  return /^[0-9]{6}$/.test(code);
}

export interface AalInfo {
  currentLevel: string | null;
  nextLevel: string | null;
}

export interface FactorInfo {
  id: string;
  status: string;
}

export type MfaStep = { step: "done" } | { step: "challenge"; factorId: string } | { step: "enroll" };

// Falha fechada: só "aal2" conta como concluído. Um nível em falta pede o segundo fator.
export function decideMfaStep(aal: AalInfo, factors: readonly FactorInfo[]): MfaStep {
  if (aal.currentLevel === "aal2") {
    return { step: "done" };
  }
  const verified = factors.find((factor) => factor.status === "verified");
  if (verified) {
    return { step: "challenge", factorId: verified.id };
  }
  return { step: "enroll" };
}

export class MfaError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MfaError";
  }
}

// Converte a mensagem do Supabase Auth numa mensagem em português para o administrador.
export function mfaErrorMessage(raw: string): string {
  const lower = raw.toLowerCase();
  if (lower.includes("rate") || lower.includes("too many")) {
    return "Demasiadas tentativas. Aguarde um minuto e tente outra vez.";
  }
  if (lower.includes("invalid") || lower.includes("incorrect") || lower.includes("expired")) {
    return "Código incorreto ou expirado. Confirme a hora do telemóvel e tente outra vez.";
  }
  if (lower.includes("network") || lower.includes("fetch")) {
    return "Sem ligação ao servidor. Verifique a internet e tente novamente.";
  }
  return "Não foi possível confirmar o código. Tente novamente.";
}
