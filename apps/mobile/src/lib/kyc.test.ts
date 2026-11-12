import { describe, expect, it } from "vitest";
import { ApiError } from "./api-client";
import {
  documentTypeLabel,
  kindLabel,
  kycErrorMessage,
  nextLevel,
  photoContentType,
  requiredKinds,
  submissionStatusLabel,
} from "./kyc";

describe("kyc", () => {
  it("bilhete de identidade exige frente, verso e selfie", () => {
    expect(requiredKinds("id_card")).toEqual(["front", "back", "selfie"]);
  });

  it("passaporte e outros documentos não exigem verso", () => {
    expect(requiredKinds("passport")).toEqual(["front", "selfie"]);
    expect(requiredKinds("other")).toEqual(["front", "selfie"]);
  });

  it("nextLevel sobe um nível e para no máximo", () => {
    expect(nextLevel(0)).toBe(1);
    expect(nextLevel(2)).toBe(3);
    expect(nextLevel(3)).toBeNull();
  });

  it("photoContentType aceita JPEG, PNG e ausência de tipo", () => {
    expect(photoContentType("image/jpeg")).toBe("image/jpeg");
    expect(photoContentType("image/jpg")).toBe("image/jpeg");
    expect(photoContentType(null)).toBe("image/jpeg");
    expect(photoContentType(undefined)).toBe("image/jpeg");
    expect(photoContentType("image/png")).toBe("image/png");
  });

  it("photoContentType rejeita outros formatos", () => {
    expect(photoContentType("image/heic")).toBeNull();
    expect(photoContentType("image/gif")).toBeNull();
    expect(photoContentType("application/pdf")).toBeNull();
  });

  it("documentos em falta têm mensagem própria em português", () => {
    expect(kycErrorMessage(new ApiError(422, "missing_documents", "Faltam documentos: back."))).toBe(
      "Faltam fotografias. Tire todas as fotos pedidas e tente submeter de novo.",
    );
  });

  it("outros erros usam a mensagem geral da app", () => {
    const message = "Já existe um pedido de verificação em aberto.";
    expect(kycErrorMessage(new ApiError(409, "submission_open", message))).toBe(message);
  });

  it("nomes de fotos, documentos e estados", () => {
    expect(kindLabel("front")).toBe("Frente do documento");
    expect(kindLabel("back")).toBe("Verso do documento");
    expect(kindLabel("selfie")).toBe("Selfie");
    expect(documentTypeLabel("id_card")).toBe("Bilhete de identidade");
    expect(documentTypeLabel("passport")).toBe("Passaporte");
    expect(submissionStatusLabel("pending")).toBe("Em análise");
    expect(submissionStatusLabel("rejected")).toBe("Recusado");
  });
});
