import type { AppDeps } from "../app.js";
import type { AuthUser } from "../plugins/auth.js";

export const VALID_TOKEN = "token-de-teste-valido";

export const TEST_USER: AuthUser = {
  id: "11111111-1111-4111-8111-111111111111",
  phone: null,
};

export const TEST_ENV = {
  NODE_ENV: "test",
  DEFAULT_CURRENCY: "XOF",
  SUPABASE_URL: "http://localhost:54321",
  SUPABASE_SERVICE_ROLE_KEY: "placeholder-apenas-para-testes-123456",
};

export function makeFakeDeps(overrides: Partial<AppDeps> = {}): AppDeps {
  return {
    authenticator: async (token) => (token === VALID_TOKEN ? TEST_USER : null),
    wallet: {
      getOrCreateWallet: async () => ({
        accountId: "22222222-2222-4222-8222-222222222222",
        currency: "XOF",
        balance: 6000,
        status: "active",
      }),
      getStatement: async () => ({
        items: [
          {
            id: 7,
            transactionId: "33333333-3333-4333-8333-333333333333",
            direction: "debit",
            amount: 4000,
            balanceAfter: 6000,
            createdAt: "2026-11-10T12:00:00.000Z",
            type: "transfer",
            reference: null,
          },
        ],
        nextCursor: null,
      }),
    },
    transfers: {
      createTransfer: async (input) => ({
        transactionId: "44444444-4444-4444-8444-444444444444",
        replayed: false,
        amount: input.amount,
        currency: "XOF",
        toPhone: input.toPhone,
      }),
    },
    profile: {
      getOrCreate: async (userId) => ({
        userId,
        fullName: null,
        language: "pt",
        kycLevel: 0,
      }),
      update: async (userId, patch) => ({
        userId,
        fullName: patch.fullName ?? null,
        language: patch.language ?? "pt",
        kycLevel: 0,
      }),
    },
    devices: {
      register: async () => undefined,
      remove: async () => undefined,
    },
    audit: {
      record: async () => undefined,
    },
    ...overrides,
  };
}
