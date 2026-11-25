import type { RequestFn } from "./admin-api";
import type { AdminTicketDetail, AdminTicketItem, SupportStatus } from "./support-types";

export function createSupportApi(request: RequestFn) {
  return {
    list: (status?: SupportStatus) =>
      request<{ items: AdminTicketItem[] }>(
        status ? `/admin/v1/support/tickets?status=${status}&limit=50` : "/admin/v1/support/tickets?limit=50",
      ),

    // Cada consulta fica na auditoria, antes de o conteúdo ser devolvido.
    get: (ticketId: string) => request<AdminTicketDetail>(`/admin/v1/support/tickets/${ticketId}`),

    reply: (ticketId: string, message: string, resolve: boolean) =>
      request<{ ok: true }>(`/admin/v1/support/tickets/${ticketId}/reply`, {
        method: "POST",
        body: { message, resolve },
      }),

    setStatus: (ticketId: string, status: "open" | "resolved" | "closed") =>
      request<{ status: "open" | "resolved" | "closed" }>(`/admin/v1/support/tickets/${ticketId}/status`, {
        method: "POST",
        body: { status },
      }),
  };
}

export type SupportApi = ReturnType<typeof createSupportApi>;
