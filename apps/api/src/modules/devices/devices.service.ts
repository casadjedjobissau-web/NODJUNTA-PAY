import type { SupabaseClient } from "@supabase/supabase-js";
import type { DeviceInput, DeviceService } from "./devices.types.js";

export function createDeviceService(client: SupabaseClient): DeviceService {
  return {
    async register(userId: string, input: DeviceInput): Promise<void> {
      const { error } = await client.from("devices").upsert(
        {
          user_id: userId,
          device_id: input.deviceId,
          platform: input.platform,
          push_token: input.pushToken,
          last_seen_at: new Date().toISOString(),
        },
        { onConflict: "user_id,device_id" },
      );
      if (error) {
        throw new Error(`Falha ao registar dispositivo: ${error.message}`);
      }
    },

    async remove(userId: string, deviceId: string): Promise<void> {
      const { error } = await client
        .from("devices")
        .delete()
        .eq("user_id", userId)
        .eq("device_id", deviceId);
      if (error) {
        throw new Error(`Falha ao remover dispositivo: ${error.message}`);
      }
    },
  };
}
