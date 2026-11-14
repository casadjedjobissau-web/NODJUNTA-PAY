import type { SupabaseClient } from "@supabase/supabase-js";
import { isExpoPushToken } from "./push.expo.js";
import type { PushMessage, PushSender, PushTicket } from "./push.types.js";

interface Claimed {
  id: string;
  userId: string;
  kind: string;
  title: string;
  body: string;
  data: Record<string, unknown>;
}

export interface DispatchResult {
  claimed: number;
  sent: number;
  skipped: number;
  failed: number;
}

export interface PushDispatcher {
  dispatchOnce(): Promise<DispatchResult>;
}

interface Tally {
  ok: boolean;
  errors: number;
  dead: number;
}

const DEAD_TOKEN = "DeviceNotRegistered";

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function parseClaimed(data: unknown): Claimed[] {
  if (!Array.isArray(data)) {
    return [];
  }
  const items: Claimed[] = [];
  for (const raw of data) {
    const row = asRecord(raw);
    if (typeof row.out_id !== "string" || typeof row.out_user_id !== "string") {
      continue;
    }
    items.push({
      id: row.out_id,
      userId: row.out_user_id,
      kind: typeof row.out_kind === "string" ? row.out_kind : "system",
      title: typeof row.out_title === "string" ? row.out_title : "",
      body: typeof row.out_body === "string" ? row.out_body : "",
      data: asRecord(row.out_data),
    });
  }
  return items;
}

export function createPushDispatcher(
  client: SupabaseClient,
  sender: PushSender,
  options: { batchSize?: number } = {},
): PushDispatcher {
  const batchSize = options.batchSize ?? 100;

  async function mark(ids: string[], state: "sent" | "skipped" | "failed"): Promise<void> {
    if (ids.length === 0) {
      return;
    }
    const { error } = await client.rpc("notifications_mark_push", { p_ids: ids, p_state: state });
    if (error) {
      throw new Error(`Falha ao marcar notificações (${state}): ${error.message}`);
    }
  }

  async function dispatchOnce(): Promise<DispatchResult> {
    const claimedResult = await client.rpc("notifications_claim_for_push", { p_limit: batchSize });
    if (claimedResult.error) {
      throw new Error(`Falha ao reclamar notificações: ${claimedResult.error.message}`);
    }
    const claimed = parseClaimed(claimedResult.data);
    if (claimed.length === 0) {
      return { claimed: 0, sent: 0, skipped: 0, failed: 0 };
    }

    const userIds = [...new Set(claimed.map((item) => item.userId))];
    const devices = await client
      .from("devices")
      .select("user_id, push_token")
      .in("user_id", userIds)
      .not("push_token", "is", null);
    if (devices.error) {
      await mark(
        claimed.map((item) => item.id),
        "failed",
      );
      throw new Error(`Falha ao ler dispositivos: ${devices.error.message}`);
    }

    const tokensByUser = new Map<string, Set<string>>();
    for (const row of (devices.data ?? []) as Array<{ user_id: string; push_token: string | null }>) {
      if (row.push_token && isExpoPushToken(row.push_token)) {
        const set = tokensByUser.get(row.user_id) ?? new Set<string>();
        set.add(row.push_token);
        tokensByUser.set(row.user_id, set);
      }
    }

    const messages: PushMessage[] = [];
    const owners: Array<{ notificationId: string; token: string }> = [];
    const skipped: string[] = [];
    for (const item of claimed) {
      const tokens = [...(tokensByUser.get(item.userId) ?? [])];
      if (tokens.length === 0) {
        skipped.push(item.id);
        continue;
      }
      for (const token of tokens) {
        messages.push({
          to: token,
          title: item.title,
          body: item.body,
          data: { ...item.data, notificationId: item.id, kind: item.kind },
        });
        owners.push({ notificationId: item.id, token });
      }
    }

    let tickets: PushTicket[] = [];
    let sendFailed = false;
    if (messages.length > 0) {
      try {
        tickets = await sender.send(messages);
      } catch {
        sendFailed = true;
      }
    }

    const sent: string[] = [];
    const failed: string[] = [];
    const deadTokens = new Set<string>();

    if (sendFailed) {
      failed.push(...new Set(owners.map((owner) => owner.notificationId)));
    } else if (owners.length > 0) {
      const tallies = new Map<string, Tally>();
      owners.forEach((owner, index) => {
        const ticket: PushTicket = tickets[index] ?? { status: "error", error: "unknown" };
        const tally = tallies.get(owner.notificationId) ?? { ok: false, errors: 0, dead: 0 };
        if (ticket.status === "ok") {
          tally.ok = true;
        } else {
          tally.errors += 1;
          if (ticket.error === DEAD_TOKEN) {
            tally.dead += 1;
            deadTokens.add(owner.token);
          }
        }
        tallies.set(owner.notificationId, tally);
      });

      for (const [notificationId, tally] of tallies) {
        if (tally.ok) {
          sent.push(notificationId);
        } else if (tally.errors === tally.dead) {
          skipped.push(notificationId);
        } else {
          failed.push(notificationId);
        }
      }
    }

    if (deadTokens.size > 0) {
      // Melhor esforço: tokens que o Expo diz que já não existem deixam de ser usados.
      await client.from("devices").update({ push_token: null }).in("push_token", [...deadTokens]);
    }

    await mark(sent, "sent");
    await mark(skipped, "skipped");
    await mark(failed, "failed");

    return { claimed: claimed.length, sent: sent.length, skipped: skipped.length, failed: failed.length };
  }

  return { dispatchOnce };
}
