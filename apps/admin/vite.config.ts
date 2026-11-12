import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  // allowedHosts: necessário para abrir o servidor de desenvolvimento por um domínio do Replit.
  server: { host: true, port: 5173, allowedHosts: true },
  test: { environment: "node", include: ["src/**/*.test.ts"] },
});
