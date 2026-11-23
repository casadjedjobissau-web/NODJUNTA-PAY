export type ShareFormat = "pdf" | "image";

export interface ShareOptions {
  mimeType: string;
  dialogTitle: string;
  uti: string;
}

export interface ShareDeps {
  isAvailable(): Promise<boolean>;
  makePdf(html: string): Promise<string>;
  makeImage(): Promise<string>;
  share(uri: string, options: ShareOptions): Promise<void>;
}

export type ShareResult = { status: "shared" } | { status: "unavailable" } | { status: "failed" };

export const SHARE_TYPES: Readonly<Record<ShareFormat, { mimeType: string; uti: string }>> = {
  pdf: { mimeType: "application/pdf", uti: "com.adobe.pdf" },
  image: { mimeType: "image/png", uti: "public.png" },
};

// Nunca lança erro: a partilha falhar não pode estragar o ecrã do recibo.
export async function shareReceipt(
  deps: ShareDeps,
  format: ShareFormat,
  html: string,
  title: string,
): Promise<ShareResult> {
  try {
    if (!(await deps.isAvailable())) {
      return { status: "unavailable" };
    }
    const uri = format === "pdf" ? await deps.makePdf(html) : await deps.makeImage();
    const type = SHARE_TYPES[format];
    await deps.share(uri, { mimeType: type.mimeType, dialogTitle: title, uti: type.uti });
    return { status: "shared" };
  } catch {
    return { status: "failed" };
  }
}
