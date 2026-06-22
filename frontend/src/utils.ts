const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Lightweight client-side email check (non-empty local part, domain, and TLD).
 * Used for UX guarding only — the backend remains the source of truth.
 *
 * @param value - The string to validate.
 * @returns True when `value` looks like a well-formed email address.
 */
export const isValidEmail = (value: string): boolean => {
  return EMAIL_PATTERN.test(value);
}