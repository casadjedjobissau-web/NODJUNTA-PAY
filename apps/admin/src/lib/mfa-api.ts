import { MfaError, decideMfaStep, isValidTotpCode, mfaErrorMessage, type AalInfo, type FactorInfo, type MfaStep } from "./mfa";

interface MfaResult<T> {
  data: T | null;
  error: { message: string } | null;
}

export interface MfaClient {
  getAuthenticatorAssuranceLevel(): Promise<MfaResult<AalInfo>>;
  listFactors(): Promise<MfaResult<{ totp: readonly FactorInfo[] }>>;
  enroll(params: {
    factorType: "totp";
    friendlyName: string;
    issuer: string;
  }): Promise<MfaResult<{ id: string; totp: { qr_code: string; secret: string; uri: string } }>>;
  challenge(params: { factorId: string }): Promise<MfaResult<{ id: string }>>;
  verify(params: { factorId: string; challengeId: string; code: string }): Promise<MfaResult<unknown>>;
  unenroll(params: { factorId: string }): Promise<MfaResult<unknown>>;
}

export interface EnrollInfo {
  factorId: string;
  qrCode: string;
  secret: string;
}

export interface MfaApi {
  status(): Promise<MfaStep>;
  startEnroll(): Promise<EnrollInfo>;
  verify(factorId: string, code: string): Promise<void>;
}

export const MFA_FRIENDLY_NAME = "NODJUNTA-PAY";
export const MFA_ISSUER = "NODJUNTA-PAY";

function fail(raw: string | undefined): never {
  throw new MfaError(mfaErrorMessage(raw ?? ""));
}

export function createMfaApi(client: MfaClient): MfaApi {
  async function status(): Promise<MfaStep> {
    const aal = await client.getAuthenticatorAssuranceLevel();
    if (aal.error || !aal.data) {
      return fail(aal.error?.message);
    }
    if (aal.data.currentLevel === "aal2") {
      return { step: "done" };
    }
    const list = await client.listFactors();
    if (list.error || !list.data) {
      return fail(list.error?.message);
    }
    return decideMfaStep(aal.data, list.data.totp);
  }

  async function startEnroll(): Promise<EnrollInfo> {
    const list = await client.listFactors();
    if (list.error || !list.data) {
      return fail(list.error?.message);
    }
    // Nunca se cria um segundo autenticador por cima de um já confirmado.
    if (list.data.totp.some((factor) => factor.status === "verified")) {
      throw new MfaError("Esta conta já tem um autenticador. Use o código dele.");
    }
    // Inscrições deixadas a meio são removidas. Se a remoção falhar, a inscrição seguinte reporta o erro.
    for (const factor of list.data.totp) {
      if (factor.status !== "verified") {
        await client.unenroll({ factorId: factor.id });
      }
    }

    const enrolled = await client.enroll({
      factorType: "totp",
      friendlyName: MFA_FRIENDLY_NAME,
      issuer: MFA_ISSUER,
    });
    if (enrolled.error || !enrolled.data) {
      return fail(enrolled.error?.message);
    }
    return {
      factorId: enrolled.data.id,
      qrCode: enrolled.data.totp.qr_code,
      secret: enrolled.data.totp.secret,
    };
  }

  async function verify(factorId: string, code: string): Promise<void> {
    if (!isValidTotpCode(code)) {
      throw new MfaError("O código tem 6 dígitos.");
    }
    const challenge = await client.challenge({ factorId });
    if (challenge.error || !challenge.data) {
      return fail(challenge.error?.message);
    }
    const verified = await client.verify({ factorId, challengeId: challenge.data.id, code });
    if (verified.error) {
      return fail(verified.error.message);
    }
  }

  return { status, startEnroll, verify };
}
