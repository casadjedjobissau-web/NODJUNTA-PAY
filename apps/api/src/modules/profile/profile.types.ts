export type Language = "pt" | "kri";

export interface ProfileView {
  userId: string;
  fullName: string | null;
  language: Language;
  kycLevel: number;
}

export interface ProfilePatch {
  fullName?: string;
  language?: Language;
}

export interface ProfileService {
  getOrCreate(userId: string): Promise<ProfileView>;
  update(userId: string, patch: ProfilePatch): Promise<ProfileView>;
}
