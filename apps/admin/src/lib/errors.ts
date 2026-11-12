import { ApiError } from "./api-client";

export function userMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.code === "network_error") {
      return error.message;
    }
    if (error.status === 401) {
      return "A sessão expirou. Entre novamente.";
    }
    if (error.status === 429) {
      return "Demasiados pedidos. Aguarde um pouco e tente novamente.";
    }
    if (error.status >= 500) {
      return "O servidor está com problemas. Tente mais tarde.";
    }
    // 400, 403, 404 e 409 trazem uma mensagem em português escrita pela API.
    return error.message;
  }
  return "Algo correu mal. Tente novamente.";
}
