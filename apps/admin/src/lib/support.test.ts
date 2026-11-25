import { describe, expect, it } from "vitest";
import type { AdminTicketItem } from "./support-types";
import {
  MESSAGE_MAX,
  SUPPORT_STATUSES,
  canAct,
  categoryLabel,
  statusLabel,
  statusTone,
  validateReply,
  waitingFor,
  waitingLabel,
} from "./support";

const NOW = new Date(2026, 10, 14, 12, 0, 0);

function ago(ms: number): string {
  return new Date(NOW.getTime() - ms).toISOString();
}

function item(overrides: Partial<AdminTicketItem> = {}): AdminTicketItem {
  return {
    id: "t1",
    seq: 1,
    userId: "u1",
    phone: "+245955000401",
    fullName: "Ana Gomes",
    category: "payment",
    subject: "Pagamento em falta",
    status: "open",
    createdAt: ago(3 * 3_600_000),
    lastMessageAt: ago(3 * 3_600_000),
    ...overrides,
  };
}

describe("estados", () => {
  it("cada estado tem um texto diferente, do ponto de vista da equipa", () => {
    expect(new Set(SUPPORT_STATUSES.map(statusLabel)).size).toBe(4);
    expect(statusLabel("open")).toBe("Aguarda resposta");
    expect(statusLabel("pending_user")).toBe("Aguarda o cliente");
  });

  it("só o que aguarda resposta da equipa chama a atenção", () => {
    expect(statusTone("open")).toBe("warn");
    expect(statusTone("resolved")).toBe("ok");
    expect(statusTone("pending_user")).toBe("neutral");
    expect(statusTone("closed")).toBe("neutral");
  });

  it("só um pedido fechado deixa de aceitar ações", () => {
    expect(canAct("open")).toBe(true);
    expect(canAct("pending_user")).toBe(true);
    expect(canAct("resolved")).toBe(true);
    expect(canAct("closed")).toBe(false);
  });
});

describe("categoryLabel", () => {
  it("traduz as categorias conhecidas e usa 'Outro assunto' para as desconhecidas", () => {
    expect(categoryLabel("kyc")).toBe("Verificação de identidade");
    expect(categoryLabel("deposit_withdrawal")).toBe("Depósitos e levantamentos");
    expect(categoryLabel("inventada")).toBe("Outro assunto");
    expect(categoryLabel("")).toBe("Outro assunto");
  });
});

describe("validateReply", () => {
  it("aceita uma resposta normal e o limite exato", () => {
    expect(validateReply("Estamos a verificar.")).toBeNull();
    expect(validateReply("a".repeat(MESSAGE_MAX))).toBeNull();
  });

  it("recusa vazia, só espaços, ou acima de 2000", () => {
    expect(validateReply("")).toBe("Escreva a resposta.");
    expect(validateReply("   ")).toBe("Escreva a resposta.");
    expect(validateReply("a".repeat(MESSAGE_MAX + 1))).toContain("2000");
  });
});

describe("waitingLabel", () => {
  it("menos de uma hora", () => {
    expect(waitingLabel(ago(10 * 60_000), NOW)).toBe("menos de 1 h");
    expect(waitingLabel(ago(0), NOW)).toBe("menos de 1 h");
  });

  it("horas, arredondadas para baixo", () => {
    expect(waitingLabel(ago(3_600_000), NOW)).toBe("1 h");
    expect(waitingLabel(ago(5.9 * 3_600_000), NOW)).toBe("5 h");
    expect(waitingLabel(ago(23 * 3_600_000), NOW)).toBe("23 h");
  });

  it("dias", () => {
    expect(waitingLabel(ago(24 * 3_600_000), NOW)).toBe("1 d");
    expect(waitingLabel(ago(50 * 3_600_000), NOW)).toBe("2 d");
  });

  it("uma data inválida devolve um traço, e uma data futura conta como menos de 1 h", () => {
    expect(waitingLabel("ontem", NOW)).toBe("—");
    expect(waitingLabel("", NOW)).toBe("—");
    expect(waitingLabel(ago(-3_600_000), NOW)).toBe("menos de 1 h");
  });
});

describe("waitingFor", () => {
  it("só mostra o tempo de espera aos pedidos que aguardam resposta", () => {
    expect(waitingFor(item({ status: "open" }), NOW)).toBe("3 h");
    for (const status of ["pending_user", "resolved", "closed"] as const) {
      expect(waitingFor(item({ status }), NOW)).toBe("—");
    }
  });
});
