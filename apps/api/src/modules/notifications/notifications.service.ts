import type { SupabaseClient } from "@supabase/supabase-js";
import {
  NotificationError,
  toKind,
  type ListOptions,
  type NotificationPage,
  type NotificationService,
  type NotificationView,
} from "./notifications.types.js";

interface Row {
  id: string;
  seq: number;
  kind: string;
  title: string;
  body: string;
  data: unknown;
  read_at: string | null;
  created_at: string;
}

const COLUMNS = "id, seq, kind, title, body, data, read_at, created_at";

function toView(row: Row): NotificationView {
  const data =
    typeof row.data === "object" && row.data !== null && !Array.isArray(row.data)
      ? (row.data as Record<string, unknown>)
      : {};
  return {
    id: row.id,
    seq: Number(row.seq),
    kind: toKind(row.kind),
    title: row.title,
    body: row.body,
    data,
    read: row.read_at !== null,
    createdAt: row.created_at,
  };
}

export function createNotificationService(client: SupabaseClient): NotificationService {
  async function list(userId: string, options: ListOptions): Promise<NotificationPage> {
    let query = client
      .from("notifications")
      .select(COLUMNS)
      .eq("user_id", userId)
      .order("seq", { ascending: false })
      .limit(options.limit + 1);
    if (options.before !== undefined) {
      query = query.lt("seq", options.before);
    }

    const result = await query;
    if (result.error) {
      throw new Error(`Falha ao ler notificações: ${result.error.message}`);
    }

    const rows = (result.data ?? []) as unknown as Row[];
    const hasMore = rows.length > options.limit;
    const items = (hasMore ? rows.slice(0, options.limit) : rows).map(toView);
    const last = items[items.length - 1];

    const unread = await client
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .is("read_at", null);
    if (unread.error) {
      throw new Error(`Falha ao contar notificações: ${unread.error.message}`);
    }

    return {
      items,
      nextCursor: hasMore && last ? last.seq : null,
      unreadCount: unread.count ?? 0,
    };
  }

  async function markRead(userId: string, notificationId: string): Promise<void> {
    const found = await client
      .from("notifications")
      .select("id")
      .eq("id", notificationId)
      .eq("user_id", userId)
      .maybeSingle();
    if (found.error) {
      throw new Error(`Falha ao ler notificação: ${found.error.message}`);
    }
    if (!found.data) {
      throw new NotificationError("notification_not_found", 404, "Notificação não encontrada.");
    }

    const updated = await client
      .from("notifications")
      .update({ read_at: new Date().toISOString() })
      .eq("id", notificationId)
      .eq("user_id", userId)
      .is("read_at", null);
    if (updated.error) {
      throw new Error(`Falha ao marcar notificação como lida: ${updated.error.message}`);
    }
  }

  async function markAllRead(userId: string): Promise<number> {
    const result = await client
      .from("notifications")
      .update({ read_at: new Date().toISOString() })
      .eq("user_id", userId)
      .is("read_at", null)
      .select("id");
    if (result.error) {
      throw new Error(`Falha ao marcar notificações como lidas: ${result.error.message}`);
    }
    return (result.data ?? []).length;
  }

  return { list, markRead, markAllRead };
}
