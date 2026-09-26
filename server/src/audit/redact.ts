/**
 * Makes tool arguments safe to keep in the audit log for years:
 * - secrets (passwords, tokens, keys, card data) → "[redacted]"
 * - long strings truncated, deep nesting and huge arrays cut short
 * - the whole result capped in size
 */

const SENSITIVE_KEY =
  /pass(word)?|secret|token|authorization|api[_-]?key|private|credential|card|cvv|cvc|pin|otp|ssn|iban/i;

const MAX_STRING = 500;
const MAX_ARRAY_ITEMS = 50;
const MAX_DEPTH = 5;
const MAX_TOTAL_CHARS = 8_000;

function redactValue(value: unknown, depth: number): unknown {
  if (value === null || typeof value === 'number' || typeof value === 'boolean')
    return value;
  if (typeof value === 'string') {
    return value.length > MAX_STRING
      ? `${value.slice(0, MAX_STRING)}…[+${value.length - MAX_STRING} chars]`
      : value;
  }
  if (depth >= MAX_DEPTH) return '[too deep]';
  if (Array.isArray(value)) {
    const items = value
      .slice(0, MAX_ARRAY_ITEMS)
      .map((v) => redactValue(v, depth + 1));
    if (value.length > MAX_ARRAY_ITEMS)
      items.push(`[+${value.length - MAX_ARRAY_ITEMS} items]`);
    return items;
  }
  if (typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, v]) => [
        key,
        SENSITIVE_KEY.test(key) ? '[redacted]' : redactValue(v, depth + 1),
      ]),
    );
  }
  return `[${typeof value}]`; // functions, symbols, bigint: never stored
}

export function redactForAudit(input: unknown): Record<string, unknown> {
  const redacted = redactValue(input ?? {}, 0);
  const safe =
    redacted && typeof redacted === 'object' && !Array.isArray(redacted)
      ? (redacted as Record<string, unknown>)
      : { value: redacted };
  const size = JSON.stringify(safe).length;
  return size > MAX_TOTAL_CHARS
    ? { truncated: true, originalSizeChars: size }
    : safe;
}
