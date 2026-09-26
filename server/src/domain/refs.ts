import { Errors } from '../errors/index';

/**
 * Formats of the business references the AI passes to tools.
 * Checking them early gives a clear VALIDATION_ERROR instead of a confusing
 * NOT_FOUND, and stops arbitrary text from reaching upstream systems.
 */
export const REF_PATTERNS = {
  customer: /^CUS-\d{4,6}$/,
  invoice: /^INV-\d{4}-\d{4,6}$/,
  ticket: /^TCK-\d{4,6}$/,
} as const;

const EXAMPLES: Record<keyof typeof REF_PATTERNS, string> = {
  customer: 'CUS-1001',
  invoice: 'INV-2026-0042',
  ticket: 'TCK-1007',
};

/** Trims and uppercases, then checks the format. Returns the normalized reference. */
export function assertRef(
  kind: keyof typeof REF_PATTERNS,
  value: string,
  field: string,
): string {
  const normalized = value.trim().toUpperCase();
  if (!REF_PATTERNS[kind].test(normalized)) {
    throw Errors.validation(`${field} must look like ${EXAMPLES[kind]}`, {
      field,
      received: value,
    });
  }
  return normalized;
}
