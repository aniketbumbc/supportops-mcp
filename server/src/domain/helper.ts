/** 1240000 + "INR" → "₹12,400.00". For messages only; data stays in integer minor units. */
export function formatMoney(amountMinor: number, currency: string): string {
  try {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency,
    }).format(amountMinor / 100);
  } catch {
    return `${(amountMinor / 100).toFixed(2)} ${currency}`;
  }
}
