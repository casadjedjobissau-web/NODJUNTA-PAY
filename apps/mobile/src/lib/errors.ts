import { ApiError } from "./api-client";

const GENERIC = "Algo correu mal. Tente novamente.";
const NETWORK = "Sem ligação ao servidor. Verifique a internet e tente novamente.";

function readAuthFields(error: unknown): { code: string; message: string } {
  if (typeof error !== "object" || error === null) {
    return { code: "", message: "" };
  }
  const record = error as { code?: unknown; message?: unknown };
  return {
    code: typeof record.code === "string" ? record.code : "",
    message: typeof record.message === "string" ? record.message : "",
  };
}

// Converte qualquer erro (da nossa API ou do Supabase Auth) numa mensagem para o utilizador.
export function userMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.code === "network_error") {
      return error.message;
    }
    if (error.status === 401) {
      return "A sua sessão expirou. Entre novamente.";
    }
    if (error.status >= 500) {
      return "O servidor está com problemas. Tente mais tarde.";
    }
    return error.message;
  }

  const { code, message } = readAuthFields(error);
  const lower = message.toLowerCase();

  if (code === "over_sms_send_rate_limit" || code === "over_request_rate_limit") {
    return "Muitos pedidos. Aguarde um pouco e tente novamente.";
  }
  if (code === "sms_send_failed") {
    return "Não foi possível enviar o SMS. Tente novamente.";
  }
  if (code === "phone_provider_disabled") {
    return "O início de sessão por telefone não está disponível de momento.";
  }
  if (code === "otp_expired" || lower.includes("expired or is invalid") || lower.includes("invalid token")) {
    return "Código inválido ou expirado.";
  }
  if (lower.includes("network")) {
    return NETWORK;
  }
  return GENERIC;
}
