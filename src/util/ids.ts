import { nanoid } from 'nanoid';

export function generateId(): string {
  return nanoid(8);
}

// ---------------------------------------------------------------------------
// Custom ID segment constants
// ---------------------------------------------------------------------------

const POLL = 'poll';
const RANK = 'rank';
const ID_SEP = ':';

// Poll actions
const VOTE_OPEN = 'vote-open';
const VOTE_GO = 'vote-go';
const CLOSE = 'close';
const EDIT_OPEN = 'edit-open';

// Rank actions
const RATE = 'rate';
const RATE_GO = 'rate-go';
const STAR = 'star';
const ORDER_START = 'order-start';
const ORDER_STEP = 'order-step';
const ORDER_GO = 'order-go';
const ORDER_CLOSE = 'order-close';

// Modal identifiers (top-level custom_id on the modal itself)
export const POLL_MODAL_ID = 'poll-create-modal';
export const POLL_VOTE_MODAL_PREFIX = 'poll-vote:';
export const POLL_EDIT_MODAL_PREFIX = 'poll-edit:';
export const RANK_MODAL_ID = 'rank-create-modal';
export const RANK_STAR_VOTE_MODAL_PREFIX = 'rank-star-vote:';
export const RANK_EDIT_MODAL_PREFIX = 'rank-edit:';

// Modal component custom_ids (inside modals, not message components)
export const MODAL_POLL_TITLE = 'poll_title';
export const MODAL_POLL_OPTIONS = 'poll_options';
export const MODAL_POLL_MODE = 'poll_mode';
export const MODAL_POLL_SETTINGS = 'poll_settings';
export const MODAL_POLL_VOTE_CHOICE = 'poll_vote_choice';
export const MODAL_RANK_TITLE = 'rank_title';
export const MODAL_RANK_OPTIONS = 'rank_options';
export const MODAL_RANK_MODE = 'rank_mode';
export const MODAL_RANK_SETTINGS = 'rank_settings';
export const MODAL_POLL_MENTIONS = 'poll_mentions';
export const MODAL_RANK_MENTIONS = 'rank_mentions';

export function modalRankStarId(index: number): string {
  return `rank_star_${index}`;
}

// ---------------------------------------------------------------------------
// ID regex patterns (shared between builders, parsers, and router)
// ---------------------------------------------------------------------------

const ID_PATTERN = '[\\w-]+';
const NUM_PATTERN = '\\d+';

function simplePattern(type: string, action: string): RegExp {
  return new RegExp(`^${type}${ID_SEP}(${ID_PATTERN})${ID_SEP}${action}$`);
}

export const POLL_VOTE_OPEN_RE = simplePattern(POLL, VOTE_OPEN);
export const POLL_VOTE_GO_RE = simplePattern(POLL, VOTE_GO);
export const POLL_CLOSE_RE = simplePattern(POLL, CLOSE);
export const POLL_EDIT_OPEN_RE = simplePattern(POLL, EDIT_OPEN);
export const RANK_RATE_RE = simplePattern(RANK, RATE);
export const RANK_RATE_GO_RE = simplePattern(RANK, RATE_GO);
export const RANK_EDIT_OPEN_RE = simplePattern(RANK, EDIT_OPEN);
export const RANK_CLOSE_RE = simplePattern(RANK, CLOSE);
export const RANK_ORDER_START_RE = simplePattern(RANK, ORDER_START);
export const RANK_ORDER_GO_RE = simplePattern(RANK, ORDER_GO);
export const RANK_ORDER_CLOSE_RE = simplePattern(RANK, ORDER_CLOSE);
export const RANK_STAR_RE = new RegExp(
  `^${RANK}${ID_SEP}(${ID_PATTERN})${ID_SEP}${STAR}${ID_SEP}(${NUM_PATTERN})${ID_SEP}(${NUM_PATTERN})$`,
);
export const RANK_ORDER_STEP_RE = new RegExp(
  `^${RANK}${ID_SEP}(${ID_PATTERN})${ID_SEP}${ORDER_STEP}${ID_SEP}(${NUM_PATTERN})(?:${ID_SEP}(${NUM_PATTERN}(?:,${NUM_PATTERN})*))?$`,
);

// ---------------------------------------------------------------------------
// Poll customId builders
// ---------------------------------------------------------------------------

export function pollVoteOpenId(pollId: string): string {
  return `${POLL}${ID_SEP}${pollId}${ID_SEP}${VOTE_OPEN}`;
}

export function pollVoteGoId(pollId: string): string {
  return `${POLL}${ID_SEP}${pollId}${ID_SEP}${VOTE_GO}`;
}

export function pollCloseId(pollId: string): string {
  return `${POLL}${ID_SEP}${pollId}${ID_SEP}${CLOSE}`;
}

export function pollEditOpenId(pollId: string): string {
  return `${POLL}${ID_SEP}${pollId}${ID_SEP}${EDIT_OPEN}`;
}

// ---------------------------------------------------------------------------
// Poll customId parsers
// ---------------------------------------------------------------------------

export function parsePollVoteOpen(customId: string): { pollId: string } | null {
  const match = customId.match(POLL_VOTE_OPEN_RE);
  if (!match) return null;
  return { pollId: match[1] };
}

export function parsePollVoteGo(customId: string): { pollId: string } | null {
  const match = customId.match(POLL_VOTE_GO_RE);
  if (!match) return null;
  return { pollId: match[1] };
}

export function parsePollEditOpen(customId: string): { pollId: string } | null {
  const match = customId.match(POLL_EDIT_OPEN_RE);
  if (!match) return null;
  return { pollId: match[1] };
}

export function parsePollClose(customId: string): { pollId: string } | null {
  const match = customId.match(POLL_CLOSE_RE);
  if (!match) return null;
  return { pollId: match[1] };
}

// ---------------------------------------------------------------------------
// Rank customId builders
// ---------------------------------------------------------------------------

export function rankStarButtonId(rankId: string, optionIdx: number, stars: number): string {
  return `${RANK}${ID_SEP}${rankId}${ID_SEP}${STAR}${ID_SEP}${optionIdx}${ID_SEP}${stars}`;
}

export function rankRateId(rankId: string): string {
  return `${RANK}${ID_SEP}${rankId}${ID_SEP}${RATE}`;
}

export function rankRateGoId(rankId: string): string {
  return `${RANK}${ID_SEP}${rankId}${ID_SEP}${RATE_GO}`;
}

export function rankEditOpenId(rankId: string): string {
  return `${RANK}${ID_SEP}${rankId}${ID_SEP}${EDIT_OPEN}`;
}

export function rankCloseId(rankId: string): string {
  return `${RANK}${ID_SEP}${rankId}${ID_SEP}${CLOSE}`;
}

export function rankOrderStartId(rankId: string): string {
  return `${RANK}${ID_SEP}${rankId}${ID_SEP}${ORDER_START}`;
}

export function rankOrderStepId(rankId: string, position: number, picks?: number[]): string {
  const base = `${RANK}${ID_SEP}${rankId}${ID_SEP}${ORDER_STEP}${ID_SEP}${position}`;
  if (picks && picks.length > 0) return `${base}${ID_SEP}${picks.join(',')}`;
  return base;
}

export function rankOrderGoId(rankId: string): string {
  return `${RANK}${ID_SEP}${rankId}${ID_SEP}${ORDER_GO}`;
}

export function rankOrderCloseId(rankId: string): string {
  return `${RANK}${ID_SEP}${rankId}${ID_SEP}${ORDER_CLOSE}`;
}

// ---------------------------------------------------------------------------
// Rank customId parsers
// ---------------------------------------------------------------------------

export function parseRankRate(customId: string): { rankId: string } | null {
  const match = customId.match(RANK_RATE_RE);
  if (!match) return null;
  return { rankId: match[1] };
}

export function parseRankStar(
  customId: string,
): { rankId: string; optionIdx: number; stars: number } | null {
  const match = customId.match(RANK_STAR_RE);
  if (!match) return null;
  return { rankId: match[1], optionIdx: parseInt(match[2], 10), stars: parseInt(match[3], 10) };
}

export function parseRankRateGo(customId: string): { rankId: string } | null {
  const match = customId.match(RANK_RATE_GO_RE);
  if (!match) return null;
  return { rankId: match[1] };
}

export function parseRankEditOpen(customId: string): { rankId: string } | null {
  const match = customId.match(RANK_EDIT_OPEN_RE);
  if (!match) return null;
  return { rankId: match[1] };
}

export function parseRankClose(customId: string): { rankId: string } | null {
  const match = customId.match(RANK_CLOSE_RE);
  if (!match) return null;
  return { rankId: match[1] };
}

export function parseRankOrderStart(customId: string): { rankId: string } | null {
  const match = customId.match(RANK_ORDER_START_RE);
  if (!match) return null;
  return { rankId: match[1] };
}

export function parseRankOrderStep(
  customId: string,
): { rankId: string; position: number; picks: number[] } | null {
  const match = customId.match(RANK_ORDER_STEP_RE);
  if (!match) return null;
  const picks = match[3] ? match[3].split(',').map(Number) : [];
  return { rankId: match[1], position: parseInt(match[2], 10), picks };
}

export function parseRankOrderGo(customId: string): { rankId: string } | null {
  const match = customId.match(RANK_ORDER_GO_RE);
  if (!match) return null;
  return { rankId: match[1] };
}

export function parseRankOrderClose(customId: string): { rankId: string } | null {
  const match = customId.match(RANK_ORDER_CLOSE_RE);
  if (!match) return null;
  return { rankId: match[1] };
}
