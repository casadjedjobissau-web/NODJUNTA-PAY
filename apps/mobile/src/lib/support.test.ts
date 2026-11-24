import { describe, expect, it } from "vitest";
import {
  CATEGORY_LABELS,
  FALLBACK_CONTACTS,
  MESSAGE_MAX,
  SUBJECT_MAX,
  SUPPORT_CATEGORIES,
  canClose,
  canReply,
  contactsFrom,
  isValidE164,
  statusLabel,
  telUrl,
  toCategory,
  toStatus,
  validateNewTicket,
  validateReply,
} from "./support";

const VALID = { category: "payment" as const, subject: "Pagamento em falta", message: "O meu pagamento não chegou." };

describe("categorias e estados", () => {
  it("há 7 categorias, cada uma com texto", () => {
    expect(SUPPORT_CATEGORIES).toHaveLength(7);
    for (const category of SUPPORT_CATEGORIES) {
      expect(CATEGORY_LABELS[category].length).toBeGreaterThan(0);
    }
  });

  it("valores desconhecidos voltam a 'other' e 'open'", () => {
    expect(toCategory("kyc")).toBe("kyc");
    expect(toCategory("inventada")).toBe("other");
    expect(toStatus("closed")).toBe("closed");
    expect(toStatus("estranho")).toBe("open");
    expect(toStatus(null)).toBe("open");
  });

  it("cada estado tem um texto diferente", () => {
    const labels = (["open", "pending_user", "resolved", "closed"] as const).map(statusLabel);
    expect(new Set(labels).size).toBe(4);
    expect(statusLabel("pending_user")).toBe("O suporte respondeu");
  });
});

describe("validateNewTicket", () => {
  it("aceita um pedido válido e apara os textos", () => {
    expect(validateNewTicket({ ...VALID, subject: "  Pagamento em falta  ", message: "  O meu pagamento não chegou.  " })).toEqual({
      ok: true,
      value: VALID,
    });
  });

  it("exige a categoria", () => {
    const result = validateNewTicket({ ...VALID, category: null });
    expect(result).toEqual({ ok: false, errors: { category: "Escolha o assunto." } });
  });

  it("recusa um assunto curto, ou só de espaços", () => {
    for (const subject of ["ab", "   ", ""]) {
      const result = validateNewTicket({ ...VALID, subject });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.errors.subject).toContain("mínimo 3");
      }
    }
  });

  it("recusa um assunto com mais de 120 caracteres e aceita exatamente 120", () => {
    expect(validateNewTicket({ ...VALID, subject: "a".repeat(SUBJECT_MAX + 1) }).ok).toBe(false);
    expect(validateNewTicket({ ...VALID, subject: "a".repeat(SUBJECT_MAX) }).ok).toBe(true);
  });

  it("recusa uma mensagem curta", () => {
    const result = validateNewTicket({ ...VALID, message: "ola" });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.message).toContain("mínimo 5");
    }
  });

  it("recusa uma mensagem com mais de 2000 caracteres e aceita exatamente 2000", () => {
    expect(validateNewTicket({ ...VALID, message: "a".repeat(MESSAGE_MAX + 1) }).ok).toBe(false);
    expect(validateNewTicket({ ...VALID, message: "a".repeat(MESSAGE_MAX) }).ok).toBe(true);
  });

  it("devolve todos os erros de uma vez", () => {
    const result = validateNewTicket({ category: null, subject: "", message: "" });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(Object.keys(result.errors).sort()).toEqual(["category", "message", "subject"]);
    }
  });
});

describe("validateReply", () => {
  it("aceita uma resposta normal", () => {
    expect(validateReply("Obrigado.")).toBeNull();
    expect(validateReply("a".repeat(MESSAGE_MAX))).toBeNull();
  });

  it("recusa vazia, só espaços, ou acima de 2000", () => {
    expect(validateReply("")).toBe("Escreva a sua mensagem.");
    expect(validateReply("   ")).toBe("Escreva a sua mensagem.");
    expect(validateReply("a".repeat(MESSAGE_MAX + 1))).toContain("2000");
  });
});

describe("estado do pedido", () => {
  it("só um pedido fechado deixa de aceitar mensagens e de poder ser fechado", () => {
    for (const status of ["open", "pending_user", "resolved"] as const) {
      expect(canReply(status)).toBe(true);
      expect(canClose(status)).toBe(true);
    }
    expect(canReply("closed")).toBe(false);
    expect(canClose("closed")).toBe(false);
  });
});

describe("contactos de suporte", () => {
  it("os números de reserva são os dois do suporte", () => {
    expect(FALLBACK_CONTACTS).toEqual([
      { e164: "+245956191968", display: "+245 956 191 968" },
      { e164: "+245956656700", display: "+245 956 656 700" },
    ]);
  });

  it("usa os números que a API devolve", () => {
    const raw = { phones: [{ e164: "+245955000111", display: "+245 955 000 111" }] };

    expect(contactsFrom(raw)).toEqual([{ e164: "+245955000111", display: "+245 955 000 111" }]);
  });

  it("uma resposta inesperada devolve os números de reserva", () => {
    for (const raw of [null, undefined, "texto", 42, {}, { phones: "x" }, { phones: null }]) {
      expect(contactsFrom(raw)).toEqual([...FALLBACK_CONTACTS]);
    }
  });

  it("ignora entradas inválidas e fica com as válidas", () => {
    const raw = {
      phones: [
        { e164: "956191968", display: "sem +" },
        { e164: "+245956191968" },
        null,
        "texto",
        { e164: "+245956656700", display: "+245 956 656 700" },
      ],
    };

    expect(contactsFrom(raw)).toEqual([{ e164: "+245956656700", display: "+245 956 656 700" }]);
  });

  it("uma lista vazia, ou sem nenhuma entrada válida, devolve os de reserva", () => {
    expect(contactsFrom({ phones: [] })).toEqual([...FALLBACK_CONTACTS]);
    expect(contactsFrom({ phones: [{ e164: "x", display: "y" }] })).toEqual([...FALLBACK_CONTACTS]);
  });

  it("isValidE164 e telUrl só aceitam números internacionais", () => {
    expect(isValidE164("+245956191968")).toBe(true);
    for (const value of ["", "245956191968", "+24", "+245 956 191 968", "+245abc", "tel:+245956191968"]) {
      expect(isValidE164(value)).toBe(false);
      expect(telUrl(value)).toBeNull();
    }
    expect(telUrl("+245956191968")).toBe("tel:+245956191968");
  });
});
