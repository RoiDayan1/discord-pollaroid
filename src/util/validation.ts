/**
 * Shared validation logic for poll option parsing and validation.
 * Used by both the poll creation command and the poll edit modal.
 */

/** Splits raw text into trimmed, non-empty lines. */
export function parseOptions(raw: string, delimiter = '\n'): string[] {
  return raw
    .split(delimiter)
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Validates poll options. Returns an error message string if invalid, or null if valid.
 * Checks: minimum count (2) and no duplicates.
 */
export function validatePollOptions(options: string[]): string | null {
  if (options.length < 2) {
    return 'You need at least 2 options (one per line).';
  }
  const duplicates = options.filter((o, i) => options.indexOf(o) !== i);
  if (duplicates.length > 0) {
    return `Duplicate options are not allowed: **${[...new Set(duplicates)].join(', ')}**`;
  }
  return null;
}

/**
 * Validates rank options. Returns an error message string if invalid, or null if valid.
 * Checks: minimum count (2) and no duplicates.
 */
export function validateRankOptions(options: string[]): string | null {
  if (options.length < 2) {
    return 'You need at least 2 options (one per line).';
  }
  const duplicates = options.filter((o, i) => options.indexOf(o) !== i);
  if (duplicates.length > 0) {
    return `Duplicate options are not allowed: **${[...new Set(duplicates)].join(', ')}**`;
  }
  return null;
}
