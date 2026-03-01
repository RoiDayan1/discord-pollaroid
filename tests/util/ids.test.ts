import { describe, it, expect } from 'vitest';
import {
  generateId,
  // Poll builders + parsers
  pollVoteOpenId,
  pollVoteGoId,
  pollCloseId,
  pollEditOpenId,
  parsePollVoteOpen,
  parsePollVoteGo,
  parsePollClose,
  parsePollEditOpen,
  // Rank builders + parsers
  rankRateId,
  rankRateGoId,
  rankCloseId,
  rankEditOpenId,
  rankOrderStartId,
  rankOrderStepId,
  rankOrderGoId,
  rankOrderCloseId,
  rankStarButtonId,
  parseRankRate,
  parseRankRateGo,
  parseRankClose,
  parseRankEditOpen,
  parseRankOrderStart,
  parseRankOrderStep,
  parseRankOrderGo,
  parseRankOrderClose,
  parseRankStar,
  // Regex patterns
  POLL_VOTE_OPEN_RE,
  POLL_VOTE_GO_RE,
  POLL_CLOSE_RE,
  POLL_EDIT_OPEN_RE,
  RANK_RATE_RE,
  RANK_RATE_GO_RE,
  RANK_CLOSE_RE,
  RANK_EDIT_OPEN_RE,
  RANK_ORDER_START_RE,
  RANK_ORDER_STEP_RE,
  RANK_ORDER_GO_RE,
  RANK_ORDER_CLOSE_RE,
  RANK_STAR_RE,
  // Modal IDs
  modalRankStarId,
  POLL_MODAL_ID,
  POLL_VOTE_MODAL_PREFIX,
  POLL_EDIT_MODAL_PREFIX,
  RANK_MODAL_ID,
  RANK_STAR_VOTE_MODAL_PREFIX,
  RANK_EDIT_MODAL_PREFIX,
} from '../../src/util/ids.js';

describe('generateId', () => {
  it('returns an 8-character string', () => {
    expect(generateId()).toHaveLength(8);
  });

  it('generates unique IDs', () => {
    const ids = new Set(Array.from({ length: 100 }, () => generateId()));
    expect(ids.size).toBe(100);
  });

  it('contains only URL-safe characters', () => {
    const id = generateId();
    expect(id).toMatch(/^[A-Za-z0-9_-]+$/);
  });
});

describe('modal constants', () => {
  it('POLL_MODAL_ID is correct', () => {
    expect(POLL_MODAL_ID).toBe('poll-create-modal');
  });

  it('RANK_MODAL_ID is correct', () => {
    expect(RANK_MODAL_ID).toBe('rank-create-modal');
  });

  it('modal prefixes end with colon', () => {
    expect(POLL_VOTE_MODAL_PREFIX).toMatch(/:$/);
    expect(POLL_EDIT_MODAL_PREFIX).toMatch(/:$/);
    expect(RANK_STAR_VOTE_MODAL_PREFIX).toMatch(/:$/);
    expect(RANK_EDIT_MODAL_PREFIX).toMatch(/:$/);
  });

  it('modalRankStarId returns correct format', () => {
    expect(modalRankStarId(0)).toBe('rank_star_0');
    expect(modalRankStarId(3)).toBe('rank_star_3');
  });
});

describe('poll customId roundtrips', () => {
  const id = 'abc12345';

  it('pollVoteOpenId <-> parsePollVoteOpen', () => {
    const customId = pollVoteOpenId(id);
    expect(customId).toBe('poll:abc12345:vote-open');
    expect(parsePollVoteOpen(customId)).toEqual({ pollId: id });
  });

  it('pollVoteGoId <-> parsePollVoteGo', () => {
    const customId = pollVoteGoId(id);
    expect(customId).toBe('poll:abc12345:vote-go');
    expect(parsePollVoteGo(customId)).toEqual({ pollId: id });
  });

  it('pollCloseId <-> parsePollClose', () => {
    const customId = pollCloseId(id);
    expect(customId).toBe('poll:abc12345:close');
    expect(parsePollClose(customId)).toEqual({ pollId: id });
  });

  it('pollEditOpenId <-> parsePollEditOpen', () => {
    const customId = pollEditOpenId(id);
    expect(customId).toBe('poll:abc12345:edit-open');
    expect(parsePollEditOpen(customId)).toEqual({ pollId: id });
  });
});

describe('rank customId roundtrips', () => {
  const id = 'xyz98765';

  it('rankRateId <-> parseRankRate', () => {
    const customId = rankRateId(id);
    expect(customId).toBe('rank:xyz98765:rate');
    expect(parseRankRate(customId)).toEqual({ rankId: id });
  });

  it('rankRateGoId <-> parseRankRateGo', () => {
    const customId = rankRateGoId(id);
    expect(parseRankRateGo(customId)).toEqual({ rankId: id });
  });

  it('rankCloseId <-> parseRankClose', () => {
    const customId = rankCloseId(id);
    expect(parseRankClose(customId)).toEqual({ rankId: id });
  });

  it('rankEditOpenId <-> parseRankEditOpen', () => {
    const customId = rankEditOpenId(id);
    expect(parseRankEditOpen(customId)).toEqual({ rankId: id });
  });

  it('rankOrderStartId <-> parseRankOrderStart', () => {
    const customId = rankOrderStartId(id);
    expect(parseRankOrderStart(customId)).toEqual({ rankId: id });
  });

  it('rankOrderGoId <-> parseRankOrderGo', () => {
    const customId = rankOrderGoId(id);
    expect(parseRankOrderGo(customId)).toEqual({ rankId: id });
  });

  it('rankOrderCloseId <-> parseRankOrderClose', () => {
    const customId = rankOrderCloseId(id);
    expect(parseRankOrderClose(customId)).toEqual({ rankId: id });
  });
});

describe('rankStarButtonId <-> parseRankStar', () => {
  it('roundtrips with optionIdx and stars', () => {
    const customId = rankStarButtonId('id1', 2, 4);
    expect(customId).toBe('rank:id1:star:2:4');
    expect(parseRankStar(customId)).toEqual({ rankId: 'id1', optionIdx: 2, stars: 4 });
  });

  it('handles optionIdx 0', () => {
    const customId = rankStarButtonId('id1', 0, 5);
    expect(parseRankStar(customId)).toEqual({ rankId: 'id1', optionIdx: 0, stars: 5 });
  });

  it('handles star value 1', () => {
    expect(parseRankStar(rankStarButtonId('x', 3, 1))).toEqual({
      rankId: 'x',
      optionIdx: 3,
      stars: 1,
    });
  });
});

describe('rankOrderStepId <-> parseRankOrderStep', () => {
  it('roundtrips without picks', () => {
    const customId = rankOrderStepId('id1', 1);
    expect(customId).toBe('rank:id1:order-step:1');
    expect(parseRankOrderStep(customId)).toEqual({ rankId: 'id1', position: 1, picks: [] });
  });

  it('roundtrips with picks', () => {
    const customId = rankOrderStepId('id1', 3, [0, 2, 1]);
    expect(customId).toBe('rank:id1:order-step:3:0,2,1');
    expect(parseRankOrderStep(customId)).toEqual({
      rankId: 'id1',
      position: 3,
      picks: [0, 2, 1],
    });
  });

  it('roundtrips with single pick', () => {
    const customId = rankOrderStepId('id1', 2, [4]);
    expect(customId).toBe('rank:id1:order-step:2:4');
    expect(parseRankOrderStep(customId)).toEqual({ rankId: 'id1', position: 2, picks: [4] });
  });

  it('omits picks segment for empty array', () => {
    const customId = rankOrderStepId('id1', 1, []);
    expect(customId).toBe('rank:id1:order-step:1');
    expect(parseRankOrderStep(customId)).toEqual({ rankId: 'id1', position: 1, picks: [] });
  });
});

describe('parsers return null for non-matching inputs', () => {
  it('parsePollVoteOpen returns null for wrong type', () => {
    expect(parsePollVoteOpen('rank:abc:vote-open')).toBeNull();
  });

  it('parsePollVoteOpen returns null for empty string', () => {
    expect(parsePollVoteOpen('')).toBeNull();
  });

  it('parsePollClose returns null for wrong action', () => {
    expect(parsePollClose('poll:abc:vote-open')).toBeNull();
  });

  it('parseRankStar returns null for non-matching', () => {
    expect(parseRankStar('rank:abc:rate')).toBeNull();
  });

  it('parseRankOrderStep returns null for wrong format', () => {
    expect(parseRankOrderStep('poll:abc:order-step:1')).toBeNull();
  });

  it('parseRankRate returns null for poll customId', () => {
    expect(parseRankRate('poll:abc:rate')).toBeNull();
  });
});

describe('regex patterns', () => {
  it('POLL_VOTE_OPEN_RE matches valid customId', () => {
    expect(POLL_VOTE_OPEN_RE.test('poll:abc12345:vote-open')).toBe(true);
  });

  it('POLL_VOTE_OPEN_RE rejects wrong type', () => {
    expect(POLL_VOTE_OPEN_RE.test('rank:abc12345:vote-open')).toBe(false);
  });

  it('POLL_VOTE_GO_RE matches', () => {
    expect(POLL_VOTE_GO_RE.test('poll:x:vote-go')).toBe(true);
  });

  it('POLL_CLOSE_RE matches', () => {
    expect(POLL_CLOSE_RE.test('poll:x:close')).toBe(true);
  });

  it('POLL_EDIT_OPEN_RE matches', () => {
    expect(POLL_EDIT_OPEN_RE.test('poll:x:edit-open')).toBe(true);
  });

  it('RANK_RATE_RE matches', () => {
    expect(RANK_RATE_RE.test('rank:x:rate')).toBe(true);
  });

  it('RANK_RATE_GO_RE matches', () => {
    expect(RANK_RATE_GO_RE.test('rank:x:rate-go')).toBe(true);
  });

  it('RANK_CLOSE_RE matches', () => {
    expect(RANK_CLOSE_RE.test('rank:x:close')).toBe(true);
  });

  it('RANK_EDIT_OPEN_RE matches', () => {
    expect(RANK_EDIT_OPEN_RE.test('rank:x:edit-open')).toBe(true);
  });

  it('RANK_ORDER_START_RE matches', () => {
    expect(RANK_ORDER_START_RE.test('rank:x:order-start')).toBe(true);
  });

  it('RANK_ORDER_GO_RE matches', () => {
    expect(RANK_ORDER_GO_RE.test('rank:x:order-go')).toBe(true);
  });

  it('RANK_ORDER_CLOSE_RE matches', () => {
    expect(RANK_ORDER_CLOSE_RE.test('rank:x:order-close')).toBe(true);
  });

  it('RANK_STAR_RE matches star button', () => {
    expect(RANK_STAR_RE.test('rank:abc:star:0:3')).toBe(true);
  });

  it('RANK_STAR_RE rejects missing fields', () => {
    expect(RANK_STAR_RE.test('rank:abc:star:0')).toBe(false);
  });

  it('RANK_ORDER_STEP_RE matches with picks', () => {
    expect(RANK_ORDER_STEP_RE.test('rank:abc:order-step:2:0,1')).toBe(true);
  });

  it('RANK_ORDER_STEP_RE matches without picks', () => {
    expect(RANK_ORDER_STEP_RE.test('rank:abc:order-step:1')).toBe(true);
  });

  it('patterns reject extra text', () => {
    expect(POLL_CLOSE_RE.test('poll:abc:close:extra')).toBe(false);
  });
});
