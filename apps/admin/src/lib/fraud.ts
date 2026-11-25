export type FraudAlertStatus = "open" | "reviewed";

export interface FraudAlertItem {
  id: string;
  seq: number;
  userId: string;
  fullName: string | null;
  phoneMasked: string | null;
  rule: string;
  decision: "block" | "flag";
  operation: string;
  amount: number;
  details: Record<string, unknown>;
  status: FraudAlertStatus;
  reviewedBy: string | null;
  reviewedAt: string | null;
  reviewNote: string | null;
  createdAt: string;
}

export const NOTE_MAX = 300;

export function ruleLabel(rule: string): string {
  switch (rule) {
    case "velocity":
      return "Velocidade";
    case "cooldown":
      return "Pausa nos levantamentos";
    case "large_amount":
      return "Montante elevado";
    default:
      return rule;
  }
}

// O que fazer com cada alerta (resumo do guia do antifraude).
export function ruleHelp(rule: string): string {
  switch (rule) {
    case "velocity":
      return "Contacte o cliente. Uma conta comprometida costuma fazer muitas operações seguidas. Se houver suspeita, o administrador pode congelar a carteira.";
    case "cooldown":
      return "É o esperado depois de trocar o PIN ou o número. Só é suspeito se o cliente disser que não alterou nada: nesse caso, congele a carteira.";
    case "large_amount":
      return "Confirme que a origem do dinheiro e o destino fazem sentido para o nível de verificação do cliente.";
    default:
      return "";
  }
}

export function decisionLabel(decision: "block" | "flag"): string {
  return decision === "block" ? "Bloqueou a operação" : "Deixou passar (só alerta)";
}

export function operationLabel(operation: string): string {
  switch (operation) {
    case "transfer":
      return "Transferência";
    case "merchant_payment":
      return "Pagamento a comerciante";
    case "withdrawal":
      return "Levantamento";
    default:
      return operation;
  }
}

function num(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

// Traduz os detalhes guardados pelo servidor. Um valor em falta ou inesperado devolve "".
export function detailsText(rule: string, details: Record<string, unknown>): string {
  if (rule === "velocity") {
    const count = num(details.count);
    const max = num(details.max);
    const window = num(details.window_minutes);
    return count !== null && max !== null && window !== null
      ? `${count} operações em ${window} min (limite ${max})`
      : "";
  }
  if (rule === "cooldown") {
    const hours = num(details.hours);
    return hours !== null ? `Pausa de ${hours} h` : "";
  }
  if (rule === "large_amount") {
    const threshold = num(details.threshold);
    return threshold !== null ? `Acima do limiar de ${threshold}` : "";
  }
  return "";
}

// Só se tratam alertas abertos, e nunca os da própria conta.
export function reviewBlock(item: FraudAlertItem, meId: string): string | null {
  if (item.status !== "open") {
    return "O alerta já foi tratado.";
  }
  if (item.userId === meId) {
    return "Não pode tratar alertas da sua própria conta.";
  }
  return null;
}

export function validateNote(text: string): string | null {
  return text.trim().length > NOTE_MAX ? `A nota pode ter no máximo ${NOTE_MAX} caracteres.` : null;
}
