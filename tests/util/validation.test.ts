import { describe, it, expect } from 'vitest';
import {
  parseOptions,
  parseOptionsWithTargets,
  validatePollOptions,
  validateRankOptions,
} from '../../src/util/validation.js';
import { RankMode } from '../../src/util/constants.js';

describe('parseOptions', () => {
  it('splits multiline text into trimmed non-empty lines', () => {
    expect(parseOptions('  A  \n  B  \n  C  ')).toEqual(['A', 'B', 'C']);
  });

  it('filters out blank lines', () => {
    expect(parseOptions('A\n\n\nB')).toEqual(['A', 'B']);
  });

  it('handles single option', () => {
    expect(parseOptions('Only one')).toEqual(['Only one']);
  });

  it('returns empty array for empty input', () => {
    expect(parseOptions('')).toEqual([]);
  });

  it('returns empty array for whitespace-only input', () => {
    expect(parseOptions('   \n  \n  ')).toEqual([]);
  });

  it('supports custom delimiter', () => {
    expect(parseOptions('A,B,C', ',')).toEqual(['A', 'B', 'C']);
  });

  it('trims each option', () => {
    expect(parseOptions('  hello  \n  world  ')).toEqual(['hello', 'world']);
  });
});

describe('parseOptionsWithTargets', () => {
  it('parses plain option without target', () => {
    expect(parseOptionsWithTargets('Valorant')).toEqual([{ label: 'Valorant', target: null }]);
  });

  it('parses option with /N target suffix', () => {
    expect(parseOptionsWithTargets('Valorant /5')).toEqual([{ label: 'Valorant', target: 5 }]);
  });

  it('parses mixed options with and without targets', () => {
    expect(parseOptionsWithTargets('A /3\nB\nC /10')).toEqual([
      { label: 'A', target: 3 },
      { label: 'B', target: null },
      { label: 'C', target: 10 },
    ]);
  });

  it('ignores /0 target (returns null since < 1)', () => {
    expect(parseOptionsWithTargets('A /0')).toEqual([{ label: 'A', target: null }]);
  });

  it('handles target of 1', () => {
    expect(parseOptionsWithTargets('A /1')).toEqual([{ label: 'A', target: 1 }]);
  });

  it('does not parse /N in the middle of a label', () => {
    expect(parseOptionsWithTargets('A /5 thing')).toEqual([
      { label: 'A /5 thing', target: null },
    ]);
  });

  it('handles large target numbers', () => {
    expect(parseOptionsWithTargets('A /9999')).toEqual([{ label: 'A', target: 9999 }]);
  });

  it('filters blank lines', () => {
    const result = parseOptionsWithTargets('A /3\n\nB');
    expect(result).toHaveLength(2);
  });

  it('trims whitespace around labels', () => {
    expect(parseOptionsWithTargets('  Opt /5  ')).toEqual([{ label: 'Opt', target: 5 }]);
  });
});

describe('validatePollOptions', () => {
  it('returns null for valid single option', () => {
    expect(validatePollOptions([{ label: 'A', target: null }])).toBeNull();
  });

  it('returns null for valid multiple options with targets', () => {
    expect(
      validatePollOptions([
        { label: 'A', target: 3 },
        { label: 'B', target: null },
        { label: 'C', target: 10 },
      ]),
    ).toBeNull();
  });

  it('returns error for empty options array', () => {
    const result = validatePollOptions([]);
    expect(result).toContain('at least 1');
  });

  it('detects duplicate labels', () => {
    const result = validatePollOptions([
      { label: 'A', target: null },
      { label: 'A', target: null },
    ]);
    expect(result).toContain('Duplicate');
    expect(result).toContain('A');
  });

  it('detects multiple duplicate sets', () => {
    const result = validatePollOptions([
      { label: 'A', target: null },
      { label: 'A', target: null },
      { label: 'B', target: null },
      { label: 'B', target: null },
    ]);
    expect(result).toContain('A');
    expect(result).toContain('B');
  });

  it('allows different labels', () => {
    expect(
      validatePollOptions([
        { label: 'A', target: null },
        { label: 'B', target: null },
        { label: 'C', target: null },
      ]),
    ).toBeNull();
  });
});

describe('validateRankOptions', () => {
  it('returns null for single star option', () => {
    expect(validateRankOptions(['A'], RankMode.Star)).toBeNull();
  });

  it('returns error for single order option (needs 2)', () => {
    const result = validateRankOptions(['A'], RankMode.Order);
    expect(result).toContain('at least 2');
  });

  it('returns null for two order options', () => {
    expect(validateRankOptions(['A', 'B'], RankMode.Order)).toBeNull();
  });

  it('returns error for empty options (star mode)', () => {
    const result = validateRankOptions([], RankMode.Star);
    expect(result).toContain('at least 1');
  });

  it('returns error for empty options (order mode)', () => {
    const result = validateRankOptions([], RankMode.Order);
    expect(result).toContain('at least 2');
  });

  it('detects duplicate rank options', () => {
    const result = validateRankOptions(['A', 'A'], RankMode.Star);
    expect(result).toContain('Duplicate');
  });

  it('allows many options', () => {
    expect(
      validateRankOptions(['A', 'B', 'C', 'D', 'E'], RankMode.Order),
    ).toBeNull();
  });
});
