import { describe, expect, it } from "vitest";
import { formatPhoneDisplay, toSupportPhones } from "./phone-format.js";

describe("phone-format", () => {
  it("formata números da Guiné-Bissau em grupos de três", () => {
    expect(formatPhoneDisplay("+245956191968")).toBe("+245 956 191 968");
    expect(formatPhoneDisplay("+245956656700")).toBe("+245 956 656 700");
  });

  it("mantém números de outros formatos como estão", () => {
    expect(formatPhoneDisplay("+351912345678")).toBe("+351912345678");
    expect(formatPhoneDisplay("956191968")).toBe("956191968");
  });

  it("toSupportPhones devolve o número e a versão para mostrar", () => {
    expect(toSupportPhones(["+245956191968", "+245956656700"])).toEqual([
      { e164: "+245956191968", display: "+245 956 191 968" },
      { e164: "+245956656700", display: "+245 956 656 700" },
    ]);
  });

  it("uma lista vazia dá uma lista vazia", () => {
    expect(toSupportPhones([])).toEqual([]);
  });
});
