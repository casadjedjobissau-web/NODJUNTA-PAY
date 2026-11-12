import { describe, expect, it } from "vitest";
import { canSimulate, fundingKindLabel, fundingStatusLabel } from "./funding";
import type { FundingRequestView } from "./types";

function request(status: FundingRequestView["status"]): FundingRequestView {
  return {
    id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    kind: "deposit",
    status,
    amount: 5000,
    currency: "XOF",
    destination: null,
    failureReason: null,
    createdAt: "2026-11-10T12:00:00.000Z",
  };
}

describe("funding", () => {
  it("nomes dos tipos de pedido", () => {
    expect(fundingKindLabel("deposit")).toBe("Depósito");
    expect(fundingKindLabel("withdrawal")).toBe("Levantamento");
  });

  it("nomes dos estados", () => {
    expect(fundingStatusLabel("pending")).toBe("Pendente");
    expect(fundingStatusLabel("completed")).toBe("Concluído");
    expect(fundingStatusLabel("failed")).toBe("Falhado");
  });

  it("só pedidos pendentes podem ser simulados", () => {
    expect(canSimulate(request("pending"))).toBe(true);
    expect(canSimulate(request("completed"))).toBe(false);
    expect(canSimulate(request("failed"))).toBe(false);
  });
});
