import type { IconName } from "../design/icons";

export const NOTIFICATION_KINDS = [
  "transfer_received",
  "payment_received",
  "deposit_completed",
  "deposit_failed",
  "withdrawal_completed",
  "withdrawal_failed",
  "kyc_approved",
  "kyc_rejected",
  "merchant_active",
  "merchant_suspended",
  "security",
  "system",
  "support_reply",
] as const;

export type NotificationKind = (typeof NOTIFICATION_KINDS)[number];

export interface NotificationView {
  id: string;
  seq: number;
  kind: NotificationKind;
  title: string;
  body: string;
  data: Record<string, unknown>;
  read: boolean;
  createdAt: string;
}

export interface NotificationPage {
  items: NotificationView[];
  nextCursor: number | null;
  unreadCount: number;
}

// Um tipo que a app ainda não conhece (de uma versão futura da API) é tratado como "system".
export function toNotificationKind(value: unknown): NotificationKind {
  return NOTIFICATION_KINDS.find((kind) => kind === value) ?? "system";
}

export function notificationIcon(kind: NotificationKind): IconName {
  switch (kind) {
    case "transfer_received":
    case "payment_received":
      return "send";
    case "deposit_completed":
    case "deposit_failed":
      return "plus";
    case "withdrawal_completed":
    case "withdrawal_failed":
      return "minus";
    case "kyc_approved":
    case "kyc_rejected":
      return "shield";
    case "merchant_active":
    case "merchant_suspended":
      return "store";
    case "security":
      return "lock";
    case "system":
    case "support_reply":
      return "settings";
  }
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

// "agora", "há 5 min", "há 3 h", "ontem" ou a data (dd/mm/aaaa). Uma data inválida devolve "".
export function formatRelativeTime(iso: string, now: Date = new Date()): string {
  const time = Date.parse(iso);
  if (Number.isNaN(time)) {
    return "";
  }
  const diff = Math.max(0, now.getTime() - time);

  if (diff < MINUTE) {
    return "agora";
  }
  if (diff < HOUR) {
    return `há ${Math.floor(diff / MINUTE)} min`;
  }
  if (diff < DAY) {
    return `há ${Math.floor(diff / HOUR)} h`;
  }
  if (diff < 2 * DAY) {
    return "ontem";
  }
  const date = new Date(time);
  return `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()}`;
}

// Acrescenta os itens da página seguinte, sem repetir os que já existem.
export function mergePages(existing: readonly NotificationView[], incoming: readonly NotificationView[]): NotificationView[] {
  const known = new Set(existing.map((item) => item.id));
  return [...existing, ...incoming.filter((item) => !known.has(item.id))];
}

// Marca uma notificação como lida e ajusta o contador. Se já estava lida, ou não existe, nada muda.
export function applyRead(
  items: readonly NotificationView[],
  unread: number,
  id: string,
): { items: NotificationView[]; unread: number } {
  const target = items.find((item) => item.id === id);
  if (!target || target.read) {
    return { items: [...items], unread };
  }
  return {
    items: items.map((item) => (item.id === id ? { ...item, read: true } : item)),
    unread: Math.max(0, unread - 1),
  };
}

export function applyReadAll(items: readonly NotificationView[]): { items: NotificationView[]; unread: number } {
  return { items: items.map((item) => ({ ...item, read: true })), unread: 0 };
}

export function unreadLabel(count: number): string {
  if (count <= 0) {
    return "Sem notificações novas";
  }
  if (count === 1) {
    return "1 nova";
  }
  return count > 99 ? "99+ novas" : `${count} novas`;
}
