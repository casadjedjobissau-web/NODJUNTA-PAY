import { describe, expect, it } from "vitest";
import { isExpoPushToken, registerForPush, type PermissionState, type PushDeps } from "./push";

const TOKEN = "ExponentPushToken[abc123XYZ]";

function makeDeps(overrides: Partial<PushDeps> = {}) {
  const calls: string[] = [];
  const deps: PushDeps = {
    isDevice: true,
    platform: "android",
    getPermission: async () => {
      calls.push("get");
      return "granted";
    },
    requestPermission: async () => {
      calls.push("request");
      return "granted";
    },
    getToken: async () => {
      calls.push("token");
      return TOKEN;
    },
    ...overrides,
  };
  return { deps, calls };
}

function withPermission(state: PermissionState, afterRequest: PermissionState = "granted") {
  return makeDeps({
    getPermission: async () => state,
    requestPermission: async () => afterRequest,
  });
}

describe("isExpoPushToken", () => {
  it("aceita os dois formatos e rejeita o resto", () => {
    expect(isExpoPushToken("ExponentPushToken[abc-123_X]")).toBe(true);
    expect(isExpoPushToken("ExpoPushToken[abc123]")).toBe(true);
    for (const value of ["", "token", "ExponentPushToken[]", "ExponentPushToken[a b]", "xExponentPushToken[abc]"]) {
      expect(isExpoPushToken(value)).toBe(false);
    }
  });
});

describe("registerForPush", () => {
  it("com a permissão já dada, devolve o token sem voltar a pedir", async () => {
    const { deps, calls } = makeDeps();

    expect(await registerForPush(deps)).toEqual({ status: "registered", token: TOKEN });
    expect(calls).toEqual(["get", "token"]);
  });

  it("se a permissão ainda não foi decidida, pede-a uma vez", async () => {
    const { deps } = withPermission("undetermined", "granted");

    expect(await registerForPush(deps)).toEqual({ status: "registered", token: TOKEN });
  });

  it("se o utilizador recusar o pedido, devolve denied e não pede o token", async () => {
    const { deps, calls } = makeDeps({
      getPermission: async () => "undetermined",
      requestPermission: async () => {
        calls.push("request");
        return "denied";
      },
    });

    expect(await registerForPush(deps)).toEqual({ status: "denied" });
    expect(calls).toEqual(["request"]);
  });

  it("quem já tinha recusado não é incomodado outra vez", async () => {
    const { deps, calls } = makeDeps({
      getPermission: async () => "denied",
      requestPermission: async () => {
        calls.push("request");
        return "granted";
      },
    });

    expect(await registerForPush(deps)).toEqual({ status: "denied" });
    expect(calls).not.toContain("request");
  });

  it("num simulador, não faz nada", async () => {
    const { deps, calls } = makeDeps({ isDevice: false });

    expect(await registerForPush(deps)).toEqual({ status: "unavailable" });
    expect(calls).toEqual([]);
  });

  it("fora de iOS e Android, não faz nada", async () => {
    const { deps, calls } = makeDeps({ platform: "web" });

    expect(await registerForPush(deps)).toEqual({ status: "unavailable" });
    expect(calls).toEqual([]);
  });

  it("um token que não parece válido é recusado", async () => {
    const { deps } = makeDeps({ getToken: async () => "isto-nao-e-um-token" });

    expect(await registerForPush(deps)).toEqual({ status: "unavailable" });
  });

  it("se pedir o token falhar, devolve unavailable em vez de lançar erro", async () => {
    const { deps } = makeDeps({
      getToken: async () => {
        throw new Error("sem projeto EAS");
      },
    });

    expect(await registerForPush(deps)).toEqual({ status: "unavailable" });
  });

  it("se ler a permissão falhar, devolve unavailable em vez de lançar erro", async () => {
    const { deps } = makeDeps({
      getPermission: async () => {
        throw new Error("falha nativa");
      },
    });

    expect(await registerForPush(deps)).toEqual({ status: "unavailable" });
  });
});
