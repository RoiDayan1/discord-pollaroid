/**
 * Shared validation logic for poll option parsing and validation.
 * Used by both the poll creation command and the poll edit modal.
 */

import { MAX_POLL_OPTIONS, MAX_STAR_OPTIONS, MAX_RANK_OPTIONS } from './constants.js';

/** Splits raw text into trimmed, non-empty lines. */
export function parseOptions(raw: string, delimiter = '\n'): string[] {
  return raw
    .split(delimiter)
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Validates poll options. Returns an error message string if invalid, or null if valid.
 * Checks: minimum count (2), maximum count, and no duplicates.
 */
export function validatePollOptions(options: string[]): string | null {
  if (options.length < 2) {
    return 'You need at least 2 options (one per line).';
  }
  if (options.length > MAX_POLL_OPTIONS) {
    return `Too many options (max ${MAX_POLL_OPTIONS}).`;
  }
  const duplicates = options.filter((o, i) => options.indexOf(o) !== i);
  if (duplicates.length > 0) {
    return `Duplicate options are not allowed: **${[...new Set(duplicates)].join(', ')}**`;
  }
  return null;
}

/**
 * Validates rank options. Returns an error message string if invalid, or null if valid.
 * Star mode is limited to MAX_STAR_OPTIONS (4) due to modal component limits.
 */
export function validateRankOptions(options: string[], mode: 'star' | 'order'): string | null {
  if (options.length < 2) {
    return 'You need at least 2 options (one per line).';
  }
  const max = mode === 'star' ? MAX_STAR_OPTIONS : MAX_RANK_OPTIONS;
  if (options.length > max) {
    return `Too many options for ${mode === 'star' ? 'star rating' : 'ordering'} mode (max ${max}).`;
  }
  const duplicates = options.filter((o, i) => options.indexOf(o) !== i);
  if (duplicates.length > 0) {
    return `Duplicate options are not allowed: **${[...new Set(duplicates)].join(', ')}**`;
  }
  return null;
}
