import type { FundingKind, FundingRequestView, FundingStatus } from "./types";

export function fundingKindLabel(kind: FundingKind): string {
  return kind === "withdrawal" ? "Levantamento" : "Depósito";
}

export function fundingStatusLabel(status: FundingStatus): string {
  switch (status) {
    case "completed":
      return "Concluído";
    case "failed":
      return "Falhado";
    case "pending":
      return "Pendente";
  }
}

// Só os pedidos pendentes podem ser simulados (ferramentas de teste).
export function canSimulate(request: FundingRequestView): boolean {
  return request.status === "pending";
}
