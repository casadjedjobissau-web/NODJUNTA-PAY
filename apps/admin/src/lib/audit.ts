export function actionLabel(action: string): string {
  switch (action) {
    case "KYC_REVIEW":
      return "Revisão de KYC";
    case "ADMIN_KYC_DOCUMENTS_VIEW":
      return "Consulta de documentos KYC";
    case "ADMIN_USER_LOOKUP":
      return "Procura de utilizador";
    case "ADMIN_MERCHANT_STATUS":
      return "Alteração do estado de comerciante";
    case "ADMIN_WALLET_FREEZE":
      return "Carteira congelada";
    case "ADMIN_WALLET_UNFREEZE":
      return "Carteira descongelada";
    default:
      break;
  }
  if (action.startsWith("WEBHOOK_")) {
    return `Webhook: ${action.slice("WEBHOOK_".length).toLowerCase().replace(/_/g, " ")}`;
  }
  return action;
}

export function shortId(id: string | null): string {
  return id ? id.slice(0, 8) : "—";
}

export function summarizeMetadata(metadata: Record<string, unknown>, max = 120): string {
  if (Object.keys(metadata).length === 0) {
    return "";
  }
  const text = JSON.stringify(metadata);
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}
