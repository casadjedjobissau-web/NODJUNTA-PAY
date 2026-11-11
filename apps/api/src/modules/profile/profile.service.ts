import type { SupabaseClient } from "@supabase/supabase-js";
import type { Language, ProfilePatch, ProfileService, ProfileView } from "./profile.types.js";

interface ProfileRow {
  user_id: string;
  full_name: string | null;
  language: string;
  kyc_level: number;
}

function toView(row: ProfileRow): ProfileView {
  return {
    userId: row.user_id,
    fullName: row.full_name,
    language: row.language === "kri" ? "kri" : ("pt" as Language),
    kycLevel: Number(row.kyc_level),
  };
}

const COLUMNS = "user_id, full_name, language, kyc_level";

export function createProfileService(client: SupabaseClient): ProfileService {
  async function ensure(userId: string): Promise<void> {
    const { error } = await client
      .from("profiles")
      .upsert({ user_id: userId }, { onConflict: "user_id", ignoreDuplicates: true });
    if (error) {
      throw new Error(`Falha ao garantir perfil: ${error.message}`);
    }
  }

  async function getOrCreate(userId: string): Promise<ProfileView> {
    await ensure(userId);
    const { data, error } = await client
      .from("profiles")
      .select(COLUMNS)
      .eq("user_id", userId)
      .single();
    if (error || !data) {
      throw new Error(`Falha ao ler perfil: ${error?.message ?? "sem dados"}`);
    }
    return toView(data as ProfileRow);
  }

  async function update(userId: string, patch: ProfilePatch): Promise<ProfileView> {
    await ensure(userId);

    const changes: Record<string, unknown> = {};
    if (patch.fullName !== undefined) {
      changes.full_name = patch.fullName;
    }
    if (patch.language !== undefined) {
      changes.language = patch.language;
    }
    if (Object.keys(changes).length === 0) {
      return getOrCreate(userId);
    }

    const { data, error } = await client
      .from("profiles")
      .update(changes)
      .eq("user_id", userId)
      .select(COLUMNS)
      .single();
    if (error || !data) {
      throw new Error(`Falha ao atualizar perfil: ${error?.message ?? "sem dados"}`);
    }
    return toView(data as ProfileRow);
  }

  return { getOrCreate, update };
}
