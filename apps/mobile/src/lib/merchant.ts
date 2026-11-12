export type MerchantStatus = "pending" | "active" | "suspended";

export interface MerchantView {
  merchantCode: string;
  businessName: string;
  status: MerchantStatus;
}

export interface MerchantQr {
  merchantCode: string;
  payload: string;
}

export function merchantStatusLabel(status: MerchantStatus): string {
  switch (status) {
    case "pending":
      return "Em análise";
    case "active":
      return "Ativo";
    case "suspended":
      return "Suspenso";
  }
}

export function merchantStatusHint(status: MerchantStatus): string {
  switch (status) {
    case "pending":
      return "O seu negócio está em análise. Só poderá receber pagamentos depois de ser aprovado.";
    case "active":
      return "Mostre este QR Code ao cliente. Ele lê com a app e paga.";
    case "suspended":
      return "O seu negócio está suspenso e não pode receber pagamentos. Contacte o suporte.";
  }
}

export function isValidBusinessName(name: string): boolean {
  const length = name.trim().length;
  return length >= 2 && length <= 120;
}
