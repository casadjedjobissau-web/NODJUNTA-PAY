import { config } from "../config";
import { createApiClient } from "./api-client";
import { supabase } from "./supabase";

export const api = createApiClient({
  baseUrl: config.apiUrl,
  getToken: async () => {
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token ?? null;
  },
  refreshToken: async () => {
    const { data, error } = await supabase.auth.refreshSession();
    return error ? null : (data.session?.access_token ?? null);
  },
});
