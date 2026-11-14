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

export const SUPPORT_STATUSES = ["open", "pending_user", "resolved", "closed"] as const;

export type SupportStatus = (typeof SUPPORT_STATUSES)[number];

export const MAX_OPEN_TICKETS = 5;

export function toCategory(value: unknown): SupportCategory {
  return SUPPORT_CATEGORIES.find((category) => category === value) ?? "other";
}

export function toSupportStatus(value: unknown): SupportStatus {
  return SUPPORT_STATUSES.find((status) => status === value) ?? "open";
}

// Ao utilizador, o administrador nunca é identificado: aparece sempre como "suporte".
export function toAuthor(value: unknown): "user" | "support" {
  return value === "admin" ? "support" : "user";
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

export interface CreateTicketInput {
  category: SupportCategory;
  subject: string;
  message: string;
}

export interface ListTicketsOptions {
  limit: number;
  before?: number;
}

export interface SupportService {
  createTicket(userId: string, input: CreateTicketInput): Promise<TicketDetail>;
  list(userId: string, options: ListTicketsOptions): Promise<TicketPage>;
  get(userId: string, ticketId: string): Promise<TicketDetail>;
  reply(userId: string, ticketId: string, message: string): Promise<TicketDetail>;
  close(userId: string, ticketId: string): Promise<TicketDetail>;
}

export class SupportError extends Error {
  readonly code: string;
  readonly httpStatus: number;

  constructor(code: string, httpStatus: number, message: string) {
    super(message);
    this.name = "SupportError";
    this.code = code;
    this.httpStatus = httpStatus;
  }
}
