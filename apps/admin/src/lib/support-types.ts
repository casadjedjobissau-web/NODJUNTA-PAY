export type SupportStatus = "open" | "pending_user" | "resolved" | "closed";

export type SupportCategory =
  | "account"
  | "payment"
  | "deposit_withdrawal"
  | "kyc"
  | "merchant"
  | "security"
  | "other";

export interface AdminTicketItem {
  id: string;
  seq: number;
  userId: string;
  phone: string | null;
  fullName: string | null;
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

export interface AdminTicketDetail extends AdminTicketItem {
  messages: TicketMessage[];
}
