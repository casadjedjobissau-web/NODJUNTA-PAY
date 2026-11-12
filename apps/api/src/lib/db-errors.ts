export interface MappedDbError {
  code: string;
  httpStatus: number;
  message: string;
}

/**
 * Converte os códigos SQLSTATE de limites/KYC (NJ011, NJ012) em erros HTTP.
 * Devolve null para qualquer outro código.
 */
export function mapLimitError(sqlState: string | undefined): MappedDbError | null {
  switch (sqlState) {
    case "NJ011":
      return {
        code: "limit_exceeded",
        httpStatus: 422,
        message: "Limite de operações excedido para o seu nível de verificação.",
      };
    case "NJ012":
      return {
        code: "kyc_level_required",
        httpStatus: 403,
        message: "Esta operação exige um nível de verificação de identidade superior.",
      };
    default:
      return null;
  }
}
