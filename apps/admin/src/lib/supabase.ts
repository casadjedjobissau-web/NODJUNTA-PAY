import { createClient } from "@supabase/supabase-js";
import { config } from "../config";

// sessionStorage: a sessão do administrador não sobrevive ao fecho do separador.
export const supabase = createClient(config.supabaseUrl, config.supabaseAnonKey, {
  auth: {
    storage: window.sessionStorage,
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
  },
});
