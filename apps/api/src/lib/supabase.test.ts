import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import { makeJwt } from "../testing/tokens.js";
import { createSupabaseAuthenticator } from "./supabase.js";

const USER_ID = "11111111-1111-4111-8111-111111111111";

interface GetUserResult {
  data: { user: Record<string, unknown> | null };
  error: { message: string } | null;
}

function makeClient(result: GetUserResult) {
  const calls: string[] = [];
  const client = {
    auth: {
      getUser: async (token: string) => {
        calls.push(token);
        return result;
      },
    },
  } as unknown as SupabaseClient;
  return { client, calls };
}

function okUser(overrides: Record<string, unknown> = {}): GetUserResult {
  return {
    data: {
      user: {
        id: USER_ID,
        phone: "245955000001",
        last_sign_in_at: "2026-11-14T10:00:00.000Z",
        ...overrides,
      },
    },
    error: null,
  };
}

describe("createSupabaseAuthenticator", () => {
  it("devolve o utilizador com aal2 quando o token traz aal2", async () => {
    const { client, calls } = makeClient(okUser());
    const token = makeJwt({ sub: USER_ID, aal: "aal2" });

    const user = await createSupabaseAuthenticator(client)(token);

    expect(user).toEqual({
      id: USER_ID,
      phone: "245955000001",
      lastSignInAt: "2026-11-14T10:00:00.000Z",
      aal: "aal2",
    });
    expect(calls).toEqual([token]);
  });

  it("devolve aal1 quando o token traz aal1", async () => {
    const { client } = makeClient(okUser());

    const user = await createSupabaseAuthenticator(client)(makeJwt({ aal: "aal1" }));

    expect(user?.aal).toBe("aal1");
  });

  it("aal é null quando o token não tem a alegação", async () => {
    const { client } = makeClient(okUser());

    const user = await createSupabaseAuthenticator(client)(makeJwt({ sub: USER_ID }));

    expect(user?.aal).toBeNull();
  });

  it("aal é null quando o token não parece um JWT", async () => {
    const { client } = makeClient(okUser());

    const user = await createSupabaseAuthenticator(client)("token-qualquer");

    expect(user?.aal).toBeNull();
  });

  it("devolve null quando o Supabase recusa o token, mesmo que ele afirme aal2", async () => {
    const { client } = makeClient({ data: { user: null }, error: { message: "JWT inválido" } });

    const user = await createSupabaseAuthenticator(client)(makeJwt({ aal: "aal2" }));

    expect(user).toBeNull();
  });

  it("devolve null quando não há utilizador", async () => {
    const { client } = makeClient({ data: { user: null }, error: null });

    expect(await createSupabaseAuthenticator(client)(makeJwt({ aal: "aal2" }))).toBeNull();
  });

  it("telefone vazio ou ausente vira null", async () => {
    const empty = makeClient(okUser({ phone: "" }));
    expect((await createSupabaseAuthenticator(empty.client)(makeJwt({ aal: "aal1" })))?.phone).toBeNull();

    const missing = makeClient(okUser({ phone: undefined }));
    expect((await createSupabaseAuthenticator(missing.client)(makeJwt({ aal: "aal1" })))?.phone).toBeNull();
  });

  it("lastSignInAt ausente vira null", async () => {
    const { client } = makeClient(okUser({ last_sign_in_at: undefined }));

    const user = await createSupabaseAuthenticator(client)(makeJwt({ aal: "aal1" }));

    expect(user?.lastSignInAt).toBeNull();
  });
});
