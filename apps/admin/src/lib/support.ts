import type { AdminTicketItem, SupportStatus } from "./support-types";

export const SUPPORT_STATUSES: readonly SupportStatus[] = ["open", "pending_user", "resolved", "closed"];

export const MESSAGE_MAX = 2000;

// Do ponto de vista da equipa: "open" quer dizer que o cliente está à espera de resposta.
export function statusLabel(status: SupportStatus): string {
  switch (status) {
    case "open":
      return "Aguarda resposta";
    case "pending_user":
      return "Aguarda o cliente";
    case "resolved":
      return "Resolvido";
    case "closed":
      return "Fechado";
  }
}

export type StatusTone = "ok" | "warn" | "bad" | "neutral";

export function statusTone(status: SupportStatus): StatusTone {
  switch (status) {
    case "open":
      return "warn";
    case "resolved":
      return "ok";
    case "pending_user":
    case "closed":
      return "neutral";
  }
}

const CATEGORY_LABELS: Readonly<Record<string, string>> = {
  account: "Conta",
  payment: "Pagamentos e transferências",
  deposit_withdrawal: "Depósitos e levantamentos",
  kyc: "Verificação de identidade",
  merchant: "Comerciante",
  security: "Segurança",
  other: "Outro assunto",
};

export function categoryLabel(category: string): string {
  return CATEGORY_LABELS[category] ?? CATEGORY_LABELS.other ?? "Outro assunto";
}

// Devolve a mensagem de erro, ou null se a resposta for válida.
export function validateReply(text: string): string | null {
  const trimmed = text.trim();
  if (trimmed.length === 0) {
    return "Escreva a resposta.";
  }
  if (trimmed.length > MESSAGE_MAX) {
    return `A resposta pode ter no máximo ${MESSAGE_MAX} caracteres.`;
  }
  return null;
}

// Um pedido fechado já não aceita respostas nem mudanças de estado.
export function canAct(status: SupportStatus): boolean {
  return status !== "closed";
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

// Há quanto tempo o cliente espera: "menos de 1 h", "3 h", "2 d". Uma data inválida devolve "—".
export function waitingLabel(iso: string, now: Date = new Date()): string {
  const time = Date.parse(iso);
  if (Number.isNaN(time)) {
    return "—";
  }
  const diff = now.getTime() - time;
  if (diff < HOUR) {
    return "menos de 1 h";
  }
  if (diff < DAY) {
    return `${Math.floor(diff / HOUR)} h`;
  }
  return `${Math.floor(diff / DAY)} d`;
}

// Só faz sentido para quem está à espera de resposta da equipa.
export function waitingFor(item: AdminTicketItem, now: Date = new Date()): string {
  return item.status === "open" ? waitingLabel(item.lastMessageAt, now) : "—";
}
