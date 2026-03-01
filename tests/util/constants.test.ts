import { describe, it, expect } from 'vitest';
import {
  targetIcon,
  starsDisplay,
  TARGET_EMPTY,
  TARGET_PARTIAL,
  TARGET_FILLED,
  STAR_EMOJI,
  HALF_STAR_EMOJI,
  PollMode,
  RankMode,
  Setting,
  EVERYONE_SENTINEL,
  COLORS,
} from '../../src/util/constants.js';

describe('targetIcon', () => {
  it('returns empty string when target is null', () => {
    expect(targetIcon(null, 5)).toBe('');
    expect(targetIcon(null, 0)).toBe('');
  });

  it('returns empty circle when count is 0', () => {
    expect(targetIcon(5, 0)).toBe(TARGET_EMPTY);
  });

  it('returns partial circle when count > 0 but < target', () => {
    expect(targetIcon(5, 1)).toBe(TARGET_PARTIAL);
    expect(targetIcon(5, 4)).toBe(TARGET_PARTIAL);
    expect(targetIcon(10, 3)).toBe(TARGET_PARTIAL);
  });

  it('returns filled circle when count equals target', () => {
    expect(targetIcon(5, 5)).toBe(TARGET_FILLED);
    expect(targetIcon(1, 1)).toBe(TARGET_FILLED);
  });

  it('returns filled circle when count exceeds target', () => {
    expect(targetIcon(5, 7)).toBe(TARGET_FILLED);
    expect(targetIcon(1, 100)).toBe(TARGET_FILLED);
  });
});

describe('starsDisplay', () => {
  it('returns empty string for 0 rating', () => {
    expect(starsDisplay(0)).toBe('');
  });

  it('returns one star for rating 1', () => {
    expect(starsDisplay(1)).toBe(STAR_EMOJI);
  });

  it('returns half star for rating 0.5', () => {
    expect(starsDisplay(0.5)).toBe(HALF_STAR_EMOJI);
  });

  it('returns 3 full stars and half for 3.5', () => {
    expect(starsDisplay(3.5)).toBe(`${STAR_EMOJI}${STAR_EMOJI}${STAR_EMOJI}${HALF_STAR_EMOJI}`);
  });

  it('returns 5 full stars for rating 5', () => {
    expect(starsDisplay(5)).toBe(STAR_EMOJI.repeat(5));
  });

  it('rounds 3.3 to 3.5 (nearest 0.5)', () => {
    expect(starsDisplay(3.3)).toBe(`${STAR_EMOJI}${STAR_EMOJI}${STAR_EMOJI}${HALF_STAR_EMOJI}`);
  });

  it('rounds 3.2 to 3.0 (nearest 0.5)', () => {
    expect(starsDisplay(3.2)).toBe(STAR_EMOJI.repeat(3));
  });

  it('rounds 4.75 to 5.0', () => {
    expect(starsDisplay(4.75)).toBe(STAR_EMOJI.repeat(5));
  });

  it('rounds 2.25 to 2.5', () => {
    expect(starsDisplay(2.25)).toBe(`${STAR_EMOJI}${STAR_EMOJI}${HALF_STAR_EMOJI}`);
  });
});

describe('enums and constants', () => {
  it('PollMode has correct values', () => {
    expect(PollMode.Single).toBe('single');
    expect(PollMode.Multi).toBe('multi');
  });

  it('RankMode has correct values', () => {
    expect(RankMode.Star).toBe('star');
    expect(RankMode.Order).toBe('order');
  });

  it('Setting has correct values', () => {
    expect(Setting.Anonymous).toBe('anonymous');
    expect(Setting.ShowLive).toBe('show_live');
    expect(Setting.MentionEveryone).toBe('mention_everyone');
  });

  it('EVERYONE_SENTINEL is "everyone"', () => {
    expect(EVERYONE_SENTINEL).toBe('everyone');
  });

  it('COLORS has correct hex values', () => {
    expect(COLORS.POLL).toBe(0x5865f2);
    expect(COLORS.RANK).toBe(0xfee75c);
    expect(COLORS.CLOSED).toBe(0x99aab5);
  });
});
