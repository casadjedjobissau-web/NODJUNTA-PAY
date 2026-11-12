import { describe, expect, it } from "vitest";
import { ApiError } from "./api-client";
import { userMessage } from "./errors";

describe("userMessage", () => {
  it("falha de rede mantém a mensagem de ligação", () => {
    const message = "Sem ligação ao servidor. Verifique a internet e tente novamente.";
    expect(userMessage(new ApiError(0, "network_error", message))).toBe(message);
  });

  it("401 pede para entrar de novo", () => {
    expect(userMessage(new ApiError(401, "unauthorized", "x"))).toBe("A sessão expirou. Entre novamente.");
  });

  it("403 usa a mensagem da API", () => {
    expect(userMessage(new ApiError(403, "forbidden", "Sem permissão para esta operação."))).toBe(
      "Sem permissão para esta operação.",
    );
  });

  it("429 pede para aguardar", () => {
    expect(userMessage(new ApiError(429, "request_error", "x"))).toBe(
      "Demasiados pedidos. Aguarde um pouco e tente novamente.",
    );
  });

  it("erros 5xx escondem detalhes técnicos", () => {
    expect(userMessage(new ApiError(500, "internal_error", "detalhe interno"))).toBe(
      "O servidor está com problemas. Tente mais tarde.",
    );
  });

  it("erros desconhecidos recebem mensagem genérica", () => {
    expect(userMessage(new Error("algo"))).toBe("Algo correu mal. Tente novamente.");
    expect(userMessage(null)).toBe("Algo correu mal. Tente novamente.");
  });
});
