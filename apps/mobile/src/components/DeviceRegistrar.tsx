import { useEffect } from "react";
import { Platform } from "react-native";
import * as Crypto from "expo-crypto";
import { api } from "../lib/api";
import { devicePlatform, getOrCreateDeviceId } from "../lib/device";
import { secureStorage } from "../lib/secure-storage";

// Regista este telemóvel na API quando o utilizador entra. Falhas são ignoradas:
// o registo do dispositivo nunca deve impedir o uso da app.
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
