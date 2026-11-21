import { describe, expect, it } from "vitest";
import { ApiError } from "./api-client";
import { userMessage } from "./errors";

const NOW = new Date(2026, 10, 14, 10, 0, 0);

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

  it("a verificação antifraude indisponível (503) mostra a mensagem da API", () => {
    const message = "Não foi possível validar a operação neste momento. Tente novamente dentro de instantes.";
    expect(userMessage(new ApiError(503, "fraud_check_unavailable", message))).toBe(message);
  });

  it("o provedor financeiro indisponível (502) mostra a mensagem da API", () => {
    const message = "Provedor indisponível. Tente mais tarde.";
    expect(userMessage(new ApiError(502, "provider_unavailable", message))).toBe(message);
  });

  it("PIN bloqueado com a hora de fim mostra quanto falta", () => {
    const until = new Date(NOW.getTime() + 15 * 60_000).toISOString();

    expect(userMessage(new ApiError(429, "pin_locked", "texto da API", { lockedUntil: until }), NOW)).toBe(
      "PIN bloqueado por tentativas falhadas. Tente novamente dentro de 15 minutos.",
    );
  });

  it("PIN bloqueado sem hora de fim mantém a mensagem da API", () => {
    expect(userMessage(new ApiError(429, "pin_locked", "PIN bloqueado. Tente mais tarde."), NOW)).toBe(
      "PIN bloqueado. Tente mais tarde.",
    );
  });

  it("PIN incorreto mantém a mensagem da API, que já traz as tentativas restantes", () => {
    const message = "PIN incorreto. Restam 2 tentativas.";
    expect(userMessage(new ApiError(403, "invalid_pin", message, { attemptsLeft: 2 }))).toBe(message);
  });
});
