/**
 * Shared validation logic for poll option parsing and validation.
 * Used by both the poll creation command and the poll edit modal.
 */

import { type RankMode } from './constants.js';

export interface ParsedOption {
  label: string;
  target: number | null;
}

const TARGET_REGEX = / \/(\d+)$/;

/** Splits raw text into trimmed, non-empty lines. */
export function parseOptions(raw: string, delimiter = '\n'): string[] {
  return raw
    .split(delimiter)
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Parses option text with optional ` /N` target suffix per line. */
export function parseOptionsWithTargets(raw: string): ParsedOption[] {
  return raw
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((line) => {
      const match = line.match(TARGET_REGEX);
      if (match) {
        const target = parseInt(match[1], 10);
        const label = line.slice(0, match.index!).trim();
        return { label, target: target >= 1 ? target : null };
      }
      return { label: line, target: null };
    });
}

/**
 * Validates poll options. Returns an error message string if invalid, or null if valid.
 * Checks: minimum count (1), no duplicates, and valid targets.
 */
export function validatePollOptions(options: ParsedOption[]): string | null {
  if (options.length < 1) {
    return 'You need at least 1 option (one per line).';
  }
  const labels = options.map((o) => o.label);
  const duplicates = labels.filter((l, i) => labels.indexOf(l) !== i);
  if (duplicates.length > 0) {
    return `Duplicate options are not allowed: **${[...new Set(duplicates)].join(', ')}**`;
  }
  for (const opt of options) {
    if (opt.target !== null && opt.target < 1) {
      return `Target must be at least 1. Invalid option: **${opt.label}**`;
    }
  }
  return null;
}

/**
 * Validates rank options. Returns an error message string if invalid, or null if valid.
 * Checks: minimum count (1, or 2 for order mode) and no duplicates.
 */
export function validateRankOptions(options: string[], mode: RankMode): string | null {
  const min = mode === 'order' ? 2 : 1;
  if (options.length < min) {
    return `You need at least ${min} option${min > 1 ? 's' : ''} (one per line).`;
  }
  const duplicates = options.filter((o, i) => options.indexOf(o) !== i);
  if (duplicates.length > 0) {
    return `Duplicate options are not allowed: **${[...new Set(duplicates)].join(', ')}**`;
  }
  return null;
}
