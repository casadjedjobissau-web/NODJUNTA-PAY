export type CsvValue = string | number | null;

const BOM = "\uFEFF";
const EOL = "\r\n";

// Um texto que comece por = + - @ (ou tabulação / retorno) seria executado como fórmula pelo Excel.
// O apóstrofo à frente obriga a folha de cálculo a tratá-lo como texto.
const FORMULA_START = /^[=+\-@\t\r]/;

export function csvCell(value: CsvValue): string {
  if (value === null) {
    return "";
  }
  if (typeof value === "number") {
    return Number.isFinite(value) ? String(value) : "";
  }

  const safe = FORMULA_START.test(value) ? `'${value}` : value;
  if (/[",\r\n]/.test(safe)) {
    return `"${safe.replace(/"/g, '""')}"`;
  }
  return safe;
}

export function toCsv(
  headers: readonly string[],
  rows: ReadonlyArray<readonly CsvValue[]>,
  options: { bom?: boolean } = {},
): string {
  const lines = [headers, ...rows].map((row) => row.map(csvCell).join(","));
  return (options.bom ? BOM : "") + lines.join(EOL) + EOL;
}
