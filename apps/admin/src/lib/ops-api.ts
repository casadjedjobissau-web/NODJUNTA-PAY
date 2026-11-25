import type { RequestFn } from "./admin-api";
import type { FraudAlertItem, FraudAlertStatus } from "./fraud";
import type { CreatePhoneChangeInput, PhoneChangeItem, PhoneChangeStatus } from "./phone-change";
import type { DailyReport, MerchantReportRow, ReportSummary } from "./reports";

export function createReportsApi(request: RequestFn) {
  return {
    summary: () => request<ReportSummary>("/admin/v1/reports/summary"),

    daily: (from: string, to: string) => request<DailyReport>(`/admin/v1/reports/daily?from=${from}&to=${to}`),

    merchants: (from: string, to: string, limit = 10) =>
      request<{ items: MerchantReportRow[] }>(`/admin/v1/reports/merchants?from=${from}&to=${to}&limit=${limit}`),
  };
}

export function createPhoneChangeApi(request: RequestFn) {
  return {
    list: (status?: PhoneChangeStatus) =>
      request<{ items: PhoneChangeItem[] }>(
        status ? `/admin/v1/phone-changes?status=${status}&limit=50` : "/admin/v1/phone-changes?limit=50",
      ),

    create: (input: CreatePhoneChangeInput) =>
      request<{ id: string }>("/admin/v1/phone-changes", { method: "POST", body: input }),

    decide: (id: string, approve: boolean, reason?: string) =>
      request<{ status: "approved" | "rejected" }>(`/admin/v1/phone-changes/${id}/decide`, {
        method: "POST",
        body: reason ? { approve, reason } : { approve },
      }),
  };
}

export function createFraudApi(request: RequestFn) {
  return {
    list: (status?: FraudAlertStatus) =>
      request<{ items: FraudAlertItem[] }>(
        status ? `/admin/v1/fraud/alerts?status=${status}&limit=50` : "/admin/v1/fraud/alerts?limit=50",
      ),

    review: (id: string, note?: string) =>
      request<{ status: "reviewed" }>(`/admin/v1/fraud/alerts/${id}/review`, {
        method: "POST",
        body: note ? { note } : {},
      }),
  };
}
