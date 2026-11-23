import { describe, expect, it } from "vitest";
import {
  NOTIFICATION_KINDS,
  applyRead,
  applyReadAll,
  formatRelativeTime,
  mergePages,
  notificationIcon,
  toNotificationKind,
  unreadLabel,
  type NotificationView,
} from "./notifications";

const NOW = new Date(2026, 10, 14, 10, 0, 0);

function ago(ms: number): string {
  return new Date(NOW.getTime() - ms).toISOString();
}

function item(id: string, read = false): NotificationView {
  return {
    id,
    seq: 1,
    kind: "transfer_received",
    title: "Dinheiro recebido",
    body: "Recebeu 4 000 XOF.",
    data: {},
    read,
    createdAt: "2026-11-14T10:00:00.000Z",
  };
}

describe("tipos de notificação", () => {
  it("são os 13 tipos que a API envia, sem repetições", () => {
    expect([...NOTIFICATION_KINDS]).toEqual([
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
    ]);
    expect(new Set(NOTIFICATION_KINDS).size).toBe(13);
  });

  it("um tipo desconhecido vira system", () => {
    expect(toNotificationKind("security")).toBe("security");
    for (const value of ["algo_novo", "", null, undefined, 42]) {
      expect(toNotificationKind(value)).toBe("system");
    }
  });

  it("todos os tipos têm um ícone", () => {
    for (const kind of NOTIFICATION_KINDS) {
      expect(notificationIcon(kind).length).toBeGreaterThan(0);
    }
  });
});

describe("formatRelativeTime", () => {
  it("menos de um minuto é 'agora'", () => {
    expect(formatRelativeTime(ago(0), NOW)).toBe("agora");
    expect(formatRelativeTime(ago(30_000), NOW)).toBe("agora");
  });

  it("um instante no futuro também é 'agora'", () => {
    expect(formatRelativeTime(ago(-5 * 60_000), NOW)).toBe("agora");
  });

  it("minutos", () => {
    expect(formatRelativeTime(ago(5 * 60_000), NOW)).toBe("há 5 min");
    expect(formatRelativeTime(ago(59 * 60_000), NOW)).toBe("há 59 min");
  });

  it("horas", () => {
    expect(formatRelativeTime(ago(3 * 3_600_000), NOW)).toBe("há 3 h");
    expect(formatRelativeTime(ago(23 * 3_600_000), NOW)).toBe("há 23 h");
  });

  it("entre 24 e 48 horas é 'ontem'", () => {
    expect(formatRelativeTime(ago(30 * 3_600_000), NOW)).toBe("ontem");
  });

  it("depois de dois dias mostra a data", () => {
    expect(formatRelativeTime(ago(5 * 86_400_000), NOW)).toBe("09/11/2026");
  });

  it("uma data inválida devolve vazio", () => {
    expect(formatRelativeTime("ontem", NOW)).toBe("");
    expect(formatRelativeTime("", NOW)).toBe("");
  });
});

describe("mergePages", () => {
  it("acrescenta os itens novos pela ordem", () => {
    expect(mergePages([item("a")], [item("b"), item("c")]).map((entry) => entry.id)).toEqual(["a", "b", "c"]);
  });

  it("ignora os que já existem", () => {
    expect(mergePages([item("a"), item("b")], [item("b"), item("c")]).map((entry) => entry.id)).toEqual([
      "a",
      "b",
      "c",
    ]);
  });
});

describe("applyRead", () => {
  it("marca como lida e desce o contador", () => {
    const result = applyRead([item("a"), item("b")], 2, "a");
    expect(result.items.map((entry) => entry.read)).toEqual([true, false]);
    expect(result.unread).toBe(1);
  });

  it("uma notificação já lida não muda nada", () => {
    const result = applyRead([item("a", true)], 3, "a");
    expect(result.unread).toBe(3);
    expect(result.items[0]?.read).toBe(true);
  });

  it("um identificador desconhecido não muda nada", () => {
    expect(applyRead([item("a")], 1, "x").unread).toBe(1);
  });

  it("o contador nunca fica abaixo de zero", () => {
    expect(applyRead([item("a")], 0, "a").unread).toBe(0);
  });

  it("não altera a lista original", () => {
    const original = [item("a")];
    applyRead(original, 1, "a");
    expect(original[0]?.read).toBe(false);
  });
});

describe("applyReadAll", () => {
  it("marca tudo como lido e põe o contador a zero", () => {
    const result = applyReadAll([item("a"), item("b", true)]);
    expect(result.items.every((entry) => entry.read)).toBe(true);
    expect(result.unread).toBe(0);
  });
});

describe("unreadLabel", () => {
  it("zero, um, vários e mais de 99", () => {
    expect(unreadLabel(0)).toBe("Sem notificações novas");
    expect(unreadLabel(1)).toBe("1 nova");
    expect(unreadLabel(5)).toBe("5 novas");
    expect(unreadLabel(150)).toBe("99+ novas");
  });

  it("um valor negativo conta como zero", () => {
    expect(unreadLabel(-3)).toBe("Sem notificações novas");
  });
});
