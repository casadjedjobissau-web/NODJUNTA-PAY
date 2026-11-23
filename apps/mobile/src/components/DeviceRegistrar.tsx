import { useEffect } from "react";
import { Platform } from "react-native";
import Constants from "expo-constants";
import * as Crypto from "expo-crypto";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import { api } from "../lib/api";
import { devicePlatform, getOrCreateDeviceId } from "../lib/device";
import { registerForPush, type PermissionState } from "../lib/push";
import { secureStorage } from "../lib/secure-storage";

// Mostra a notificação também quando a app está aberta.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

function toState(status: string): PermissionState {
  return status === "granted" || status === "denied" ? status : "undetermined";
}

function readProjectId(): string | undefined {
  const fromConfig: unknown = Constants.expoConfig?.extra?.eas?.projectId;
  if (typeof fromConfig === "string" && fromConfig.length > 0) {
    return fromConfig;
  }
  const fromEas = Constants.easConfig?.projectId;
  return typeof fromEas === "string" && fromEas.length > 0 ? fromEas : undefined;
}

// Regista este telemóvel na API quando o utilizador entra. Falhas são ignoradas:
// o registo do dispositivo e do push nunca devem impedir o uso da app.
export function DeviceRegistrar() {
  useEffect(() => {
    let cancelled = false;

    async function register() {
      const platform = devicePlatform(Platform.OS);
      if (!platform) {
        return;
      }
      try {
        const deviceId = await getOrCreateDeviceId(secureStorage, () => Crypto.randomUUID());
        if (cancelled) {
          return;
        }
        await api.request("/v1/devices", { method: "POST", body: { deviceId, platform } });

        if (Platform.OS === "android") {
          await Notifications.setNotificationChannelAsync("default", {
            name: "Notificações",
            importance: Notifications.AndroidImportance.DEFAULT,
          });
        }

        const projectId = readProjectId();
        const push = await registerForPush({
          isDevice: Device.isDevice,
          platform: Platform.OS,
          getPermission: async () => toState((await Notifications.getPermissionsAsync()).status),
          requestPermission: async () => toState((await Notifications.requestPermissionsAsync()).status),
          getToken: async () =>
            (projectId
              ? await Notifications.getExpoPushTokenAsync({ projectId })
              : await Notifications.getExpoPushTokenAsync()
            ).data,
        });
        if (cancelled || push.status !== "registered") {
          return;
        }
        await api.request("/v1/devices", {
          method: "POST",
          body: { deviceId, platform, pushToken: push.token },
        });
      } catch {
        // sem consequências para o utilizador
      }
    }

    void register();
    return () => {
      cancelled = true;
    };
  }, []);

  return null;
}
