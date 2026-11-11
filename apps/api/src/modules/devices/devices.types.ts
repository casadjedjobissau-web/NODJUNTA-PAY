export interface DeviceInput {
  deviceId: string;
  platform: "ios" | "android";
  pushToken: string | null;
}

export interface DeviceService {
  register(userId: string, input: DeviceInput): Promise<void>;
  remove(userId: string, deviceId: string): Promise<void>;
}
