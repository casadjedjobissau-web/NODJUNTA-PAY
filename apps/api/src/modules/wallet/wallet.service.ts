import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  StatementEntry,
  StatementOptions,
  StatementPage,
  WalletService,
  WalletView,
} from "./wallet.types.js";

interface TxJoin {
  type: string;
  reference: string | null;
}

interface LedgerRow {
  id: number;
  transaction_id: string;
  direction: "debit" | "credit";
  amount: number;
  balance_after: number;
  created_at: string;
  transactions: TxJoin | TxJoin[] | null;
}

function firstJoin(value: TxJoin | TxJoin[] | null): TxJoin | null {
  if (Array.isArray(value)) {
    return value[0] ?? null;
  }
  return value;
}

export function createWalletService(client: SupabaseClient, currency: string): WalletService {
  async function getOrCreateWallet(userId: string): Promise<WalletView> {
    const created = await client.rpc("create_wallet", {
      p_owner_id: userId,
      p_type: "user_wallet",
      p_currency: currency,
    });
    if (created.error || typeof created.data !== "string") {
      throw new Error(`Falha ao garantir carteira: ${created.error?.message ?? "resposta inesperada"}`);
    }

    const account = await client
      .from("accounts")
      .select("id, currency, balance, status")
      .eq("id", created.data)
      .single();
    if (account.error || !account.data) {
      throw new Error(`Falha ao ler carteira: ${account.error?.message ?? "sem dados"}`);
    }

    return {
      accountId: account.data.id as string,
      currency: account.data.currency as string,
      balance: Number(account.data.balance),
      status: account.data.status as string,
    };
  }

  async function getStatement(userId: string, options: StatementOptions): Promise<StatementPage> {
    const wallet = await getOrCreateWallet(userId);

    let query = client
      .from("ledger_entries")
      .select(
        "id, transaction_id, direction, amount, balance_after, created_at, transactions(type, reference)",
      )
      .eq("account_id", wallet.accountId)
      .order("id", { ascending: false })
      .limit(options.limit + 1);

    if (options.before !== undefined) {
      query = query.lt("id", options.before);
    }

    const result = await query;
    if (result.error) {
      throw new Error(`Falha ao ler extrato: ${result.error.message}`);
    }

    const rows = (result.data ?? []) as unknown as LedgerRow[];
    const hasMore = rows.length > options.limit;
    const pageRows = hasMore ? rows.slice(0, options.limit) : rows;

    const items: StatementEntry[] = pageRows.map((row) => {
      const tx = firstJoin(row.transactions);
      return {
        id: Number(row.id),
        transactionId: row.transaction_id,
        direction: row.direction,
        amount: Number(row.amount),
        balanceAfter: Number(row.balance_after),
        createdAt: row.created_at,
        type: tx ? tx.type : null,
        reference: tx ? tx.reference : null,
      };
    });

    const last = items[items.length - 1];
    return { items, nextCursor: hasMore && last ? last.id : null };
  }

  return { getOrCreateWallet, getStatement };
}
