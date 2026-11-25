import { ApiError } from "./api-client";

export interface DownloadDeps {
  baseUrl: string;
  getToken: () => Promise<string | null>;
  save: (blob: Blob, filename: string) => void;
  fetchFn?: typeof fetch;
}

const FALLBACK_NAME = "relatorio.csv";
const NETWORK_MESSAGE = "Sem ligação ao servidor. Verifique a internet e tente novamente.";

// Só aceita nomes simples terminados em .csv. Qualquer outra coisa usa o nome por omissão.
export function parseFilename(header: string | null): string {
  if (!header) {
    return FALLBACK_NAME;
  }
  const match = /filename="([A-Za-z0-9._-]+\.csv)"/.exec(header);
  return match?.[1] ?? FALLBACK_NAME;
}

export async function downloadCsv(deps: DownloadDeps, path: string): Promise<string> {
  const token = await deps.getToken();
  const headers: Record<string, string> = { Accept: "text/csv" };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  const doFetch = deps.fetchFn ?? ((input: RequestInfo | URL, init?: RequestInit) => fetch(input, init));

  let response: Response;
  try {
    response = await doFetch(`${deps.baseUrl}${path}`, { headers });
  } catch {
    throw new ApiError(0, "network_error", NETWORK_MESSAGE);
  }

  if (!response.ok) {
    let body: { error?: unknown; message?: unknown } = {};
    try {
      body = (await response.json()) as typeof body;
    } catch {
      body = {};
    }
    throw new ApiError(
      response.status,
      typeof body.error === "string" ? body.error : "http_error",
      typeof body.message === "string" ? body.message : `Erro do servidor (${response.status}).`,
    );
  }

  const filename = parseFilename(response.headers.get("content-disposition"));
  deps.save(await response.blob(), filename);
  return filename;
}

export function saveBlobInBrowser(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
