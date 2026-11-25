import { describe, expect, it } from "vitest";
import { ApiError } from "./api-client";
import { downloadCsv, parseFilename, type DownloadDeps } from "./csv-download";

interface Saved {
  blob: Blob;
  filename: string;
}

function makeDeps(response: Response | Error, token: string | null = "token-1") {
  const saved: Saved[] = [];
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const deps: DownloadDeps = {
    baseUrl: "https://api.exemplo.local",
    getToken: async () => token,
    save: (blob, filename) => {
      saved.push({ blob, filename });
    },
    fetchFn: (async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push(init === undefined ? { url: String(input) } : { url: String(input), init });
      if (response instanceof Error) {
        throw response;
      }
      return response;
    }) as typeof fetch,
  };
  return { deps, saved, calls };
}

function csv(headers: Record<string, string> = {}): Response {
  return new Response("Dia,Valor\r\nTotal,5\r\n", {
    status: 200,
    headers: { "content-type": "text/csv", ...headers },
  });
}

describe("parseFilename", () => {
  it("lê o nome do cabeçalho", () => {
    expect(parseFilename('attachment; filename="relatorio-diario-2026-11-01_2026-11-10.csv"')).toBe(
      "relatorio-diario-2026-11-01_2026-11-10.csv",
    );
  });

  it("sem cabeçalho usa o nome por omissão", () => {
    expect(parseFilename(null)).toBe("relatorio.csv");
    expect(parseFilename("")).toBe("relatorio.csv");
  });

  it("recusa nomes com caminhos, sem a extensão .csv ou com caracteres estranhos", () => {
    for (const header of [
      'attachment; filename="../../etc/passwd.csv"',
      'attachment; filename="relatorio.exe"',
      'attachment; filename="a b.csv"',
      "attachment",
    ]) {
      expect(parseFilename(header)).toBe("relatorio.csv");
    }
  });
});

describe("downloadCsv", () => {
  it("pede o endereço certo com o token e guarda o ficheiro", async () => {
    const { deps, saved, calls } = makeDeps(csv({ "content-disposition": 'attachment; filename="r.csv"' }));

    const name = await downloadCsv(deps, "/admin/v1/reports/daily.csv?from=2026-11-01&to=2026-11-10");

    expect(name).toBe("r.csv");
    expect(calls[0]?.url).toBe("https://api.exemplo.local/admin/v1/reports/daily.csv?from=2026-11-01&to=2026-11-10");
    expect((calls[0]?.init?.headers as Record<string, string>).Authorization).toBe("Bearer token-1");
    expect(saved).toHaveLength(1);
    expect(saved[0]?.filename).toBe("r.csv");
    expect(await saved[0]?.blob.text()).toBe("Dia,Valor\r\nTotal,5\r\n");
  });

  it("sem token não envia o cabeçalho de autorização", async () => {
    const { deps, calls } = makeDeps(csv(), null);

    await downloadCsv(deps, "/x.csv");

    expect((calls[0]?.init?.headers as Record<string, string>).Authorization).toBeUndefined();
  });

  it("um erro da API vira ApiError com o código e a mensagem, e nada é guardado", async () => {
    const response = new Response(JSON.stringify({ error: "forbidden", message: "Sem permissão." }), {
      status: 403,
      headers: { "content-type": "application/json" },
    });
    const { deps, saved } = makeDeps(response);

    const error = await downloadCsv(deps, "/x.csv").catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 403, code: "forbidden", message: "Sem permissão." });
    expect(saved).toEqual([]);
  });

  it("um erro sem JSON vira http_error", async () => {
    const { deps } = makeDeps(new Response("<html>erro</html>", { status: 502 }));

    await expect(downloadCsv(deps, "/x.csv")).rejects.toMatchObject({ status: 502, code: "http_error" });
  });

  it("uma falha de rede vira network_error", async () => {
    const { deps, saved } = makeDeps(new Error("rede em baixo"));

    await expect(downloadCsv(deps, "/x.csv")).rejects.toMatchObject({ status: 0, code: "network_error" });
    expect(saved).toEqual([]);
  });
});
