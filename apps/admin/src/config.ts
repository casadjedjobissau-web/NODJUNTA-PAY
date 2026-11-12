function required(name: string, value: unknown): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`Variável de ambiente em falta: ${name}. Veja apps/admin/.env.example`);
  }
  return value.trim();
}

export const config = {
  apiUrl: required("VITE_API_URL", import.meta.env.VITE_API_URL).replace(/\/+$/, ""),
  supabaseUrl: required("VITE_SUPABASE_URL", import.meta.env.VITE_SUPABASE_URL),
  supabaseAnonKey: required("VITE_SUPABASE_ANON_KEY", import.meta.env.VITE_SUPABASE_ANON_KEY),
} as const;
