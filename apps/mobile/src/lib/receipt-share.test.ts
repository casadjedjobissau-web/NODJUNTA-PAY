import { describe, expect, it } from "vitest";
import { SHARE_TYPES, shareReceipt, type ShareDeps, type ShareOptions } from "./receipt-share";

function makeDeps(overrides: Partial<ShareDeps> = {}) {
  const calls = { pdf: [] as string[], image: 0, shared: [] as Array<{ uri: string; options: ShareOptions }> };
  const deps: ShareDeps = {
    isAvailable: async () => true,
    makePdf: async (html) => {
      calls.pdf.push(html);
      return "file:///cache/recibo.pdf";
    },
    makeImage: async () => {
      calls.image += 1;
      return "file:///cache/recibo.png";
    },
    share: async (uri, options) => {
      calls.shared.push({ uri, options });
    },
    ...overrides,
  };
  return { deps, calls };
}

describe("shareReceipt", () => {
  it("sem partilha disponível, não cria ficheiros nem abre a folha", async () => {
    const { deps, calls } = makeDeps({ isAvailable: async () => false });

    expect(await shareReceipt(deps, "pdf", "<html></html>", "Recibo")).toEqual({ status: "unavailable" });
    expect(calls.pdf).toEqual([]);
    expect(calls.image).toBe(0);
    expect(calls.shared).toEqual([]);
  });

  it("em PDF, gera o ficheiro a partir do HTML e partilha-o como application/pdf", async () => {
    const { deps, calls } = makeDeps();

    expect(await shareReceipt(deps, "pdf", "<html>recibo</html>", "Recibo NP-1")).toEqual({ status: "shared" });
    expect(calls.pdf).toEqual(["<html>recibo</html>"]);
    expect(calls.image).toBe(0);
    expect(calls.shared).toEqual([
      {
        uri: "file:///cache/recibo.pdf",
        options: { mimeType: "application/pdf", dialogTitle: "Recibo NP-1", uti: "com.adobe.pdf" },
      },
    ]);
  });

  it("em imagem, captura o ecrã e partilha-o como image/png, sem gerar PDF", async () => {
    const { deps, calls } = makeDeps();

    expect(await shareReceipt(deps, "image", "<html></html>", "Recibo")).toEqual({ status: "shared" });
    expect(calls.image).toBe(1);
    expect(calls.pdf).toEqual([]);
    expect(calls.shared[0]).toEqual({
      uri: "file:///cache/recibo.png",
      options: { mimeType: "image/png", dialogTitle: "Recibo", uti: "public.png" },
    });
  });

  it("se verificar a disponibilidade falhar, devolve failed em vez de lançar erro", async () => {
    const { deps } = makeDeps({
      isAvailable: async () => {
        throw new Error("falha nativa");
      },
    });

    expect(await shareReceipt(deps, "pdf", "", "Recibo")).toEqual({ status: "failed" });
  });

  it("se gerar o PDF falhar, não abre a folha de partilha", async () => {
    const { deps, calls } = makeDeps({
      makePdf: async () => {
        throw new Error("sem espaço");
      },
    });

    expect(await shareReceipt(deps, "pdf", "", "Recibo")).toEqual({ status: "failed" });
    expect(calls.shared).toEqual([]);
  });

  it("se capturar a imagem falhar, não abre a folha de partilha", async () => {
    const { deps, calls } = makeDeps({
      makeImage: async () => {
        throw new Error("captura falhou");
      },
    });

    expect(await shareReceipt(deps, "image", "", "Recibo")).toEqual({ status: "failed" });
    expect(calls.shared).toEqual([]);
  });

  it("se a partilha falhar, devolve failed", async () => {
    const { deps } = makeDeps({
      share: async () => {
        throw new Error("falha ao partilhar");
      },
    });

    expect(await shareReceipt(deps, "image", "", "Recibo")).toEqual({ status: "failed" });
  });

  it("os tipos de ficheiro estão certos", () => {
    expect(SHARE_TYPES.pdf).toEqual({ mimeType: "application/pdf", uti: "com.adobe.pdf" });
    expect(SHARE_TYPES.image).toEqual({ mimeType: "image/png", uti: "public.png" });
  });
});
