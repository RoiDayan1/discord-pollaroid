export enum PollMode {
  Single = 'single',
  Multi = 'multi',
}

export enum RankMode {
  Star = 'star',
  Order = 'order',
}

export enum Setting {
  Anonymous = 'anonymous',
  ShowLive = 'show_live',
  MentionEveryone = 'mention_everyone',
}

export const EVERYONE_SENTINEL = 'everyone';

export const COLORS = {
  POLL: 0x5865f2, // Discord blurple
  RANK: 0xfee75c, // Yellow
  CLOSED: 0x99aab5, // Grey
} as const;

export const EMPTY_SPACE = '\u2800';

export const BAR_FILLED = '▰';
export const BAR_EMPTY = '▱';
export const BAR_LENGTH = 15;

export const STAR_EMOJI = '⭐';
export const HALF_STAR_EMOJI = '⭒';

/** Converts a star rating (e.g. 3.5) to a display string like ⭐⭐⭐⭒ */
export function starsDisplay(rating: number): string {
  const rounded = Math.round(rating * 2) / 2; // round to nearest 0.5
  const full = Math.floor(rounded);
  const hasHalf = rounded % 1 !== 0;
  return STAR_EMOJI.repeat(full) + (hasHalf ? HALF_STAR_EMOJI : '');
}
