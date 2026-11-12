import type {
  AdminMe,
  AuditPage,
  KycDocument,
  KycItem,
  KycStatus,
  MerchantItem,
  MerchantStatus,
  Overview,
  UserView,
} from "./types";

export interface AdminRequestOptions {
  method?: "GET" | "POST";
  body?: unknown;
}

export type RequestFn = <T>(path: string, options?: AdminRequestOptions) => Promise<T>;

export function createAdminApi(request: RequestFn) {
  return {
    me: () => request<AdminMe>("/admin/v1/me"),

    overview: () => request<Overview>("/admin/v1/overview"),

    listKyc: (status: KycStatus) =>
      request<{ items: KycItem[] }>(`/admin/v1/kyc/submissions?status=${status}&limit=50`),

    kycDocuments: (submissionId: string) =>
      request<{ documents: KycDocument[] }>(`/admin/v1/kyc/submissions/${submissionId}/documents`),

    reviewKyc: (submissionId: string, approve: boolean, reason?: string) =>
      request<{ status: "approved" | "rejected" }>(`/admin/v1/kyc/submissions/${submissionId}/review`, {
        method: "POST",
        body: reason ? { approve, reason } : { approve },
      }),

    listMerchants: (status?: MerchantStatus) =>
      request<{ items: MerchantItem[] }>(
        status ? `/admin/v1/merchants?status=${status}&limit=50` : "/admin/v1/merchants?limit=50",
      ),

    setMerchantStatus: (merchantCode: string, status: "active" | "suspended") =>
      request<{ status: "active" | "suspended" }>(`/admin/v1/merchants/${merchantCode}/status`, {
        method: "POST",
        body: { status },
      }),

    lookupUser: (phone: string) =>
      request<UserView>(`/admin/v1/users/lookup?phone=${encodeURIComponent(phone)}`),

    setFrozen: (userId: string, frozen: boolean, reason?: string) =>
      request<{ status: "frozen" | "active" }>(`/admin/v1/users/${userId}/freeze`, {
        method: "POST",
        body: reason ? { frozen, reason } : { frozen },
      }),

    listAudit: (before?: number) =>
      request<AuditPage>(
        before === undefined ? "/admin/v1/audit?limit=50" : `/admin/v1/audit?limit=50&before=${before}`,
      ),
  };
}

export type AdminApi = ReturnType<typeof createAdminApi>;
