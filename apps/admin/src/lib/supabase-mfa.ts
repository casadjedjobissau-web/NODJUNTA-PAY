import { createMfaApi, type MfaClient } from "./mfa-api";
import { supabase } from "./supabase";

const mfa = supabase.auth.mfa;

const client: MfaClient = {
  getAuthenticatorAssuranceLevel: async () => {
    const { data, error } = await mfa.getAuthenticatorAssuranceLevel();
    return error || !data
      ? { data: null, error: { message: error?.message ?? "" } }
      : { data: { currentLevel: data.currentLevel, nextLevel: data.nextLevel }, error: null };
  },

  listFactors: async () => {
    const { data, error } = await mfa.listFactors();
    return error || !data
      ? { data: null, error: { message: error?.message ?? "" } }
      : { data: { totp: data.totp.map((factor) => ({ id: factor.id, status: factor.status })) }, error: null };
  },

  enroll: async (params) => {
    const { data, error } = await mfa.enroll({
      factorType: params.factorType,
      friendlyName: params.friendlyName,
      issuer: params.issuer,
    });
    return error || !data
      ? { data: null, error: { message: error?.message ?? "" } }
      : {
          data: {
            id: data.id,
            totp: { qr_code: data.totp.qr_code, secret: data.totp.secret, uri: data.totp.uri },
          },
          error: null,
        };
  },

  challenge: async (params) => {
    const { data, error } = await mfa.challenge({ factorId: params.factorId });
    return error || !data
      ? { data: null, error: { message: error?.message ?? "" } }
      : { data: { id: data.id }, error: null };
  },

  verify: async (params) => {
    const { error } = await mfa.verify({
      factorId: params.factorId,
      challengeId: params.challengeId,
      code: params.code,
    });
    return error ? { data: null, error: { message: error.message } } : { data: {}, error: null };
  },

  unenroll: async (params) => {
    const { error } = await mfa.unenroll({ factorId: params.factorId });
    return error ? { data: null, error: { message: error.message } } : { data: {}, error: null };
  },
};

export const mfaApi = createMfaApi(client);
