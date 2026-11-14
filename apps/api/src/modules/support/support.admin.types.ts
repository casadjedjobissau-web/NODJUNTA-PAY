import type { SupportCategory, SupportStatus, TicketMessage } from "./support.types.js";

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

export interface AdminTicketDetail extends AdminTicketItem {
  messages: TicketMessage[];
}

export interface SupportAdminService {
  list(status: SupportStatus | null, limit: number): Promise<AdminTicketItem[]>;
  get(adminId: string, ticketId: string, ip: string | null): Promise<AdminTicketDetail>;
  reply(adminId: string, ticketId: string, message: string, resolve: boolean): Promise<void>;
  setStatus(
    adminId: string,
    ticketId: string,
    status: "open" | "resolved" | "closed",
  ): Promise<"open" | "resolved" | "closed">;
}
