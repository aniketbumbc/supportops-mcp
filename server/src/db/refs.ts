/** Formats human-readable business references, e.g. formatRef('TCK', 1007) → "TCK-1007". */
export function formatRef(
  prefix: string,
  value: number | bigint,
  width = 4,
): string {
  return `${prefix}-${String(value).padStart(width, '0')}`;
}

/** Invoice numbers are per year: formatInvoiceNumber(2026, 42) → "INV-2026-0042". */
export function formatInvoiceNumber(year: number, sequence: number): string {
  return `INV-${year}-${String(sequence).padStart(4, '0')}`;
}
