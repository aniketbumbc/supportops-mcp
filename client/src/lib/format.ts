/** 1240000 + "INR" → "₹12,400.00". Amounts from the server are integer minor units. */
export function formatMoney(amountMinor: number, currency = 'INR'): string {
  try {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency,
    }).format(amountMinor / 100);
  } catch {
    return `${(amountMinor / 100).toFixed(2)} ${currency}`;
  }
}

/** "2026-09-13T10:22:00Z" → "13 Sep 2026". */
export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '–';
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? '–'
    : d.toLocaleDateString('en-IN', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      });
}

/** snake_case enum value → "Sentence case". */
export const humanize = (value: string) =>
  value.charAt(0).toUpperCase() + value.slice(1).replaceAll('_', ' ');
