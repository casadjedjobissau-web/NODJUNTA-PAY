import type { SupabaseClient } from "@supabase/supabase-js";
import type { MerchantService, MerchantStatus, MerchantView } from "./merchants.types.js";

interface MerchantRow {
  merchant_code: string;
  business_name: string;
  status: string;
}

const COLUMNS = "merchant_code, business_name, status";

function toStatus(value: string): MerchantStatus {
  if (value === "active" || value === "suspended") {
    return value;
  }
  return "pending";
}

function toView(row: MerchantRow): MerchantView {
  return {
    merchantCode: row.merchant_code,
    businessName: row.business_name,
    status: toStatus(row.status),
  };
}

export function createMerchantService(client: SupabaseClient, currency: string): MerchantService {
  async function getByOwner(userId: string): Promise<MerchantView | null> {
    const { data, error } = await client
      .from("merchants")
      .select(COLUMNS)
      .eq("owner_id", userId)
      .maybeSingle();
    if (error) {
      throw new Error(`Falha ao ler comerciante: ${error.message}`);
    }
    return data ? toView(data as MerchantRow) : null;
  }

  async function register(userId: string, businessName: string): Promise<MerchantView> {
    const created = await client.rpc("register_merchant", {
      p_owner_id: userId,
      p_business_name: businessName,
      p_currency: currency,
    });
    if (created.error) {
      throw new Error(`Falha ao registar comerciante: ${created.error.message}`);
    }
    const view = await getByOwner(userId);
    if (!view) {
      throw new Error("Comerciante não encontrado após o registo");
    }
    return view;
  }

  return { register, getByOwner };
}
