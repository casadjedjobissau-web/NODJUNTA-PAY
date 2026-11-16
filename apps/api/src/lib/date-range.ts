export interface DateRange {
  from: string;
  to: string;
}

export class DateRangeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DateRangeError";
  }
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 86_400_000;

function toIso(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function isRealDate(value: string): boolean {
  if (!ISO_DATE.test(value)) {
    return false;
  }
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && toIso(date) === value;
}

function addDays(value: string, days: number): string {
  return toIso(new Date(Date.parse(`${value}T00:00:00.000Z`) + days * DAY_MS));
}

// Datas no formato AAAA-MM-DD, em UTC. Sem datas, devolve os últimos `defaultDays` dias até hoje.
export function resolveDateRange(
  from: string | undefined,
  to: string | undefined,
  today: Date,
  maxDays = 92,
  defaultDays = 30,
): DateRange {
  const todayIso = toIso(today);

  const end = to ?? todayIso;
  if (!isRealDate(end)) {
    throw new DateRangeError("A data final é inválida. Use o formato AAAA-MM-DD.");
  }
  if (end > todayIso) {
    throw new DateRangeError("A data final não pode estar no futuro.");
  }

  const start = from ?? addDays(end, -(defaultDays - 1));
  if (!isRealDate(start)) {
    throw new DateRangeError("A data inicial é inválida. Use o formato AAAA-MM-DD.");
  }
  if (start > end) {
    throw new DateRangeError("A data inicial não pode ser posterior à data final.");
  }

  const days = (Date.parse(`${end}T00:00:00.000Z`) - Date.parse(`${start}T00:00:00.000Z`)) / DAY_MS + 1;
  if (days > maxDays) {
    throw new DateRangeError(`O intervalo máximo é de ${maxDays} dias.`);
  }

  return { from: start, to: end };
}
