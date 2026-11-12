export type MerchantStatus = "pending" | "active" | "suspended";

export interface MerchantView {
  merchantCode: string;
  businessName: string;
  status: MerchantStatus;
}

export interface MerchantService {
  register(userId: string, businessName: string): Promise<MerchantView>;
  getByOwner(userId: string): Promise<MerchantView | null>;
}
