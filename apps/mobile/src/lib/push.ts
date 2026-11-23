export type PermissionState = "granted" | "denied" | "undetermined";

export interface PushDeps {
  isDevice: boolean;
  platform: string;
  getPermission(): Promise<PermissionState>;
  requestPermission(): Promise<PermissionState>;
  getToken(): Promise<string>;
}

export type PushResult =
  | { status: "registered"; token: string }
  | { status: "denied" }
  | { status: "unavailable" };

// Mesmo formato que a API aceita.
export function isExpoPushToken(value: string): boolean {
  return /^Expo(nent)?PushToken\[[A-Za-z0-9_-]+\]$/.test(value);
}

// A permissão só é pedida se ainda não foi decidida: quem recusou uma vez não é incomodado outra vez.
// Qualquer falha vira "unavailable": o push nunca pode impedir o uso da app.
export async function registerForPush(deps: PushDeps): Promise<PushResult> {
  if (!deps.isDevice || (deps.platform !== "ios" && deps.platform !== "android")) {
    return { status: "unavailable" };
  }
  try {
    let state = await deps.getPermission();
    if (state === "undetermined") {
      state = await deps.requestPermission();
    }
    if (state !== "granted") {
      return { status: "denied" };
    }
    const token = await deps.getToken();
    if (!isExpoPushToken(token)) {
      return { status: "unavailable" };
    }
    return { status: "registered", token };
  } catch {
    return { status: "unavailable" };
  }
}
