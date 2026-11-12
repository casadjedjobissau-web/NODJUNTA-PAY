import { describe, expect, it } from "vitest";
import { ApiError } from "./api-client";
import { userMessage } from "./errors";

describe("userMessage", () => {
  it("usa a mensagem da API para erros de negócio (ex.: saldo insuficiente)", () => {
    expect(userMessage(new ApiError(422, "insufficient_funds", "Saldo insuficiente."))).toBe(
      "Saldo insuficiente.",
    );
  });

  it("falha de rede mantém a mensagem de ligação", () => {
    const message = "Sem ligação ao servidor. Verifique a internet e tente novamente.";
    expect(userMessage(new ApiError(0, "network_error", message))).toBe(message);
  });

  it("401 pede para entrar de novo", () => {
    expect(userMessage(new ApiError(401, "unauthorized", "x"))).toBe(
      "A sua sessão expirou. Entre novamente.",
    );
  });

  it("erros 5xx escondem detalhes técnicos", () => {
    expect(userMessage(new ApiError(500, "internal_error", "detalhe interno"))).toBe(
      "O servidor está com problemas. Tente mais tarde.",
    );
  });

  it("mapeia limites de SMS do Supabase", () => {
    expect(userMessage({ code: "over_sms_send_rate_limit", message: "x" })).toBe(
      "Muitos pedidos. Aguarde um pouco e tente novamente.",
    );
  });

  it("mapeia código inválido ou expirado", () => {
    expect(userMessage({ code: "", message: "Token has expired or is invalid" })).toBe(
      "Código inválido ou expirado.",
    );
    expect(userMessage({ code: "otp_expired", message: "x" })).toBe("Código inválido ou expirado.");
  });

  it("mapeia falha no envio do SMS", () => {
    expect(userMessage({ code: "sms_send_failed", message: "x" })).toBe(
      "Não foi possível enviar o SMS. Tente novamente.",
    );
  });

  it("devolve mensagem genérica para erros desconhecidos", () => {
    expect(userMessage(new Error("algo"))).toBe("Algo correu mal. Tente novamente.");
    expect(userMessage("texto solto")).toBe("Algo correu mal. Tente novamente.");
    expect(userMessage(null)).toBe("Algo correu mal. Tente novamente.");
  });
});
