import type { FundingProvider } from "./funding.types.js";

/**
 * Provedor SIMULADO para desenvolvimento e testes.
 * Não se liga a nenhum banco ou operadora e não move dinheiro real.
 */
export function createSandboxProvider(): FundingProvider {
  return {
    name: "sandbox",

    async initiateDeposit(input) {
      return { providerRef: `sandbox-dep-${input.requestId}` };
    },

    async initiateWithdrawal(input) {
      return { providerRef: `sandbox-wd-${input.requestId}` };
    },
  };
}
