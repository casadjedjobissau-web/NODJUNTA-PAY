import "dotenv/config";
import { loadEnv } from "../config/env.js";
import { createSupabaseAdmin } from "../lib/supabase.js";

interface ReportRow {
  check_name: string;
  expected: number | string;
  actual: number | string;
  ok: boolean;
}

async function main(): Promise<void> {
  const env = loadEnv(process.env);
  const client = createSupabaseAdmin(env);

  const { data, error } = await client.rpc("reconcile_report", {
    p_currency: env.DEFAULT_CURRENCY,
  });
  if (error) {
    throw new Error(`Falha na reconciliação: ${error.message}`);
  }

  const rows = (data ?? []) as ReportRow[];
  for (const row of rows) {
    console.log(
      `${row.ok ? "OK   " : "FALHA"} ${row.check_name}: esperado=${row.expected} atual=${row.actual}`,
    );
  }

  const failed = rows.filter((row) => !row.ok);
  if (rows.length === 0 || failed.length > 0) {
    console.error(`Reconciliação com problemas (${failed.length} falhas).`);
    process.exit(1);
  }
  console.log("Reconciliação concluída sem diferenças.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
