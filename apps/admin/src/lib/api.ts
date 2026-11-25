import { config } from "../config";
import { createAdminApi } from "./admin-api";
import { createApiClient } from "./api-client";
import { supabase } from "./supabase";

const client = createApiClient({
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

export const request = client.request;

export const api = createAdminApi(client.request);
