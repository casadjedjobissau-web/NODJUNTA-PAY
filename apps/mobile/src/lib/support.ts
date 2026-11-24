export const SUPPORT_CATEGORIES = [
  "account",
  "payment",
  "deposit_withdrawal",
  "kyc",
  "merchant",
  "security",
  "other",
] as const;

export type SupportCategory = (typeof SUPPORT_CATEGORIES)[number];

export const CATEGORY_LABELS: Readonly<Record<SupportCategory, string>> = {
  account: "A minha conta",
  payment: "Pagamentos e transferências",
  deposit_withdrawal: "Depósitos e levantamentos",
  kyc: "Verificação de identidade",
  merchant: "Sou comerciante",
  security: "Segurança",
  other: "Outro assunto",
};

export const SUPPORT_STATUSES = ["open", "pending_user", "resolved", "closed"] as const;

export type SupportStatus = (typeof SUPPORT_STATUSES)[number];

export const MAX_OPEN_TICKETS = 5;

export function toCategory(value: unknown): SupportCategory {
  return SUPPORT_CATEGORIES.find((category) => category === value) ?? "other";
}

export function toStatus(value: unknown): SupportStatus {
  return SUPPORT_STATUSES.find((status) => status === value) ?? "open";
}

export function statusLabel(status: SupportStatus): string {
  switch (status) {
    case "open":
      return "Aguarda o suporte";
    case "pending_user":
      return "O suporte respondeu";
    case "resolved":
      return "Resolvido";
    case "closed":
      return "Fechado";
  }
}

export interface TicketSummary {
  id: string;
  seq: number;
  category: SupportCategory;
  subject: string;
  status: SupportStatus;
  createdAt: string;
  lastMessageAt: string;
}

export interface TicketMessage {
  id: string;
  seq: number;
  author: "user" | "support";
  body: string;
  createdAt: string;
}

export interface TicketDetail extends TicketSummary {
  messages: TicketMessage[];
}

export interface TicketPage {
  items: TicketSummary[];
  nextCursor: number | null;
}

export const SUBJECT_MIN = 3;
export const SUBJECT_MAX = 120;
export const MESSAGE_MIN = 5;
export const MESSAGE_MAX = 2000;

export interface NewTicketInput {
  category: SupportCategory | null;
  subject: string;
  message: string;
}

export interface NewTicketErrors {
  category?: string;
  subject?: string;
  message?: string;
}

export type NewTicketValidation =
  | { ok: true; value: { category: SupportCategory; subject: string; message: string } }
  | { ok: false; errors: NewTicketErrors };

// Mesmos limites da API, para dar resposta imediata. Quem decide é sempre a API.
export function validateNewTicket(input: NewTicketInput): NewTicketValidation {
  const subject = input.subject.trim();
  const message = input.message.trim();
  const errors: NewTicketErrors = {};

  if (input.category === null) {
    errors.category = "Escolha o assunto.";
  }
  if (subject.length < SUBJECT_MIN) {
    errors.subject = `Escreva um assunto (mínimo ${SUBJECT_MIN} caracteres).`;
  } else if (subject.length > SUBJECT_MAX) {
    errors.subject = `O assunto pode ter no máximo ${SUBJECT_MAX} caracteres.`;
  }
  if (message.length < MESSAGE_MIN) {
    errors.message = `Descreva o problema (mínimo ${MESSAGE_MIN} caracteres).`;
  } else if (message.length > MESSAGE_MAX) {
    errors.message = `A mensagem pode ter no máximo ${MESSAGE_MAX} caracteres.`;
  }

  if (Object.keys(errors).length > 0 || input.category === null) {
    return { ok: false, errors };
  }
  return { ok: true, value: { category: input.category, subject, message } };
}

// Devolve a mensagem do problema, ou null se a resposta for aceitável.
export function validateReply(text: string): string | null {
  const trimmed = text.trim();
  if (trimmed.length === 0) {
    return "Escreva a sua mensagem.";
  }
  if (trimmed.length > MESSAGE_MAX) {
    return `A mensagem pode ter no máximo ${MESSAGE_MAX} caracteres.`;
  }
  return null;
}

export function canReply(status: SupportStatus): boolean {
  return status !== "closed";
}

export function canClose(status: SupportStatus): boolean {
  return status !== "closed";
}

export interface SupportContact {
  e164: string;
  display: string;
}

// Os dois números do suporte. Servem de reserva quando a API não responde.
export const FALLBACK_CONTACTS: readonly SupportContact[] = [
  { e164: "+245956191968", display: "+245 956 191 968" },
  { e164: "+245956656700", display: "+245 956 656 700" },
];

export function isValidE164(value: string): boolean {
  return /^\+[0-9]{8,15}$/.test(value);
}

// Lê a resposta de GET /public/support. Qualquer coisa inesperada devolve os números de reserva.
export function contactsFrom(raw: unknown): SupportContact[] {
  const phones = typeof raw === "object" && raw !== null ? (raw as { phones?: unknown }).phones : undefined;
  if (!Array.isArray(phones)) {
    return [...FALLBACK_CONTACTS];
  }

  const valid: SupportContact[] = [];
  for (const item of phones) {
    if (typeof item !== "object" || item === null) {
      continue;
    }
    const record = item as Record<string, unknown>;
    const e164 = record.e164;
    const display = record.display;
    if (typeof e164 === "string" && isValidE164(e164) && typeof display === "string" && display.trim().length > 0) {
      valid.push({ e164, display });
    }
  }
  return valid.length > 0 ? valid : [...FALLBACK_CONTACTS];
}

export function telUrl(e164: string): string | null {
  return isValidE164(e164) ? `tel:${e164}` : null;
}
