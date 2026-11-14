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
] as const;

export type NotificationKind = (typeof NOTIFICATION_KINDS)[number];

export function toKind(value: unknown): NotificationKind {
  return NOTIFICATION_KINDS.find((kind) => kind === value) ?? "system";
}

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

export interface ListOptions {
  limit: number;
  before?: number;
}

export interface NotificationService {
  list(userId: string, options: ListOptions): Promise<NotificationPage>;
  markRead(userId: string, notificationId: string): Promise<void>;
  markAllRead(userId: string): Promise<number>;
}

export class NotificationError extends Error {
  readonly code: string;
  readonly httpStatus: number;

  constructor(code: string, httpStatus: number, message: string) {
    super(message);
    this.name = "NotificationError";
    this.code = code;
    this.httpStatus = httpStatus;
  }
}
