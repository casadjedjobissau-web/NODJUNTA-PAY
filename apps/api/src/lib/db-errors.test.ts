import { describe, expect, it } from "vitest";
import { mapLimitError } from "./db-errors.js";

describe("mapLimitError", () => {
  it("NJ011 vira limit_exceeded (422)", () => {
    expect(mapLimitError("NJ011")).toMatchObject({ code: "limit_exceeded", httpStatus: 422 });
  });

  it("NJ012 vira kyc_level_required (403)", () => {
    expect(mapLimitError("NJ012")).toMatchObject({ code: "kyc_level_required", httpStatus: 403 });
  });

  it("outros códigos ou ausência de código devolvem null", () => {
    expect(mapLimitError("NJ004")).toBeNull();
    expect(mapLimitError(undefined)).toBeNull();
  });
});
