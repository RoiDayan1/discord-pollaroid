import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest';
import type { Knex as KnexType } from 'knex';
import { cleanAllTables } from '../helpers/db-setup.js';
import { RankMode } from '../../src/util/constants.js';

let testDb: KnexType;

vi.mock('../../src/db/connection.js', async () => {
  const { setupTestDb } = await import('../helpers/db-setup.js');
  testDb = await setupTestDb();
  return { default: testDb, isPostgres: false, initDb: vi.fn() };
});

const {
  createRank,
  getRank,
  getRankOptions,
  getRankVotes,
  getUserRankVotes,
  setRankMessageId,
  voteRankStar,
  voteRankOrder,
  updateRank,
  closeRank,
  getOpenRanksByCreator,
} = await import('../../src/db/ranks.js');

const baseRank = {
  id: 'testrank',
  guild_id: 'guild1',
  channel_id: 'chan1',
  creator_id: 'creator1',
  title: 'Test Rank',
  mode: RankMode.Star,
  anonymous: 0,
  show_live: 1,
  mentions: '[]',
  closed: 0,
};

afterAll(async () => {
  await testDb.destroy();
});

describe('createRank + getRank', () => {
  beforeEach(async () => {
    await cleanAllTables(testDb);
  });

  it('creates a rank and retrieves it by ID', async () => {
    await createRank(baseRank, ['TypeScript', 'Rust', 'Go']);
    const rank = await getRank('testrank');
    expect(rank).toBeDefined();
    expect(rank!.title).toBe('Test Rank');
    expect(rank!.mode).toBe(RankMode.Star);
    expect(rank!.message_id).toBeNull();
  });

  it('stores all fields correctly', async () => {
    await createRank(
      { ...baseRank, anonymous: 1, show_live: 0, mentions: '["role1"]' },
      ['A'],
    );
    const rank = await getRank('testrank');
    expect(rank!.anonymous).toBe(1);
    expect(rank!.show_live).toBe(0);
    expect(rank!.mentions).toBe('["role1"]');
  });

  it('returns undefined for nonexistent rank', async () => {
    expect(await getRank('nonexistent')).toBeUndefined();
  });
});

describe('setRankMessageId', () => {
  beforeEach(async () => {
    await cleanAllTables(testDb);
    await createRank(baseRank, ['A']);
  });

  it('updates the message_id', async () => {
    await setRankMessageId('testrank', 'msg456');
    const rank = await getRank('testrank');
    expect(rank!.message_id).toBe('msg456');
  });
});

describe('getRankOptions', () => {
  beforeEach(async () => {
    await cleanAllTables(testDb);
    await createRank(baseRank, ['C', 'A', 'B']);
  });

  it('returns options ordered by idx', async () => {
    const options = await getRankOptions('testrank');
    expect(options).toHaveLength(3);
    expect(options[0].label).toBe('C');
    expect(options[0].idx).toBe(0);
    expect(options[1].label).toBe('A');
    expect(options[2].label).toBe('B');
  });

  it('returns empty array for nonexistent rank', async () => {
    expect(await getRankOptions('missing')).toEqual([]);
  });
});

describe('voteRankStar', () => {
  beforeEach(async () => {
    await cleanAllTables(testDb);
    await createRank(baseRank, ['TypeScript', 'Rust']);
  });

  it('records a star rating for one option', async () => {
    await voteRankStar('testrank', 0, 'voter1', 4);
    const votes = await getRankVotes('testrank');
    expect(votes).toHaveLength(1);
    expect(votes[0].option_idx).toBe(0);
    expect(votes[0].value).toBe(4);
  });

  it('replaces previous rating for same user+option', async () => {
    await voteRankStar('testrank', 0, 'voter1', 3);
    await voteRankStar('testrank', 0, 'voter1', 5);
    const votes = await getUserRankVotes('testrank', 'voter1');
    expect(votes).toHaveLength(1);
    expect(votes[0].value).toBe(5);
  });

  it('allows different users to rate the same option', async () => {
    await voteRankStar('testrank', 0, 'voter1', 4);
    await voteRankStar('testrank', 0, 'voter2', 2);
    const votes = await getRankVotes('testrank');
    expect(votes).toHaveLength(2);
  });

  it('allows one user to rate multiple options', async () => {
    await voteRankStar('testrank', 0, 'voter1', 5);
    await voteRankStar('testrank', 1, 'voter1', 3);
    const votes = await getUserRankVotes('testrank', 'voter1');
    expect(votes).toHaveLength(2);
  });
});

describe('voteRankOrder', () => {
  beforeEach(async () => {
    await cleanAllTables(testDb);
    await createRank({ ...baseRank, mode: RankMode.Order }, ['A', 'B', 'C']);
  });

  it('records a full ordering for one user', async () => {
    await voteRankOrder('testrank', 'voter1', [
      { optionIdx: 2, position: 1 },
      { optionIdx: 0, position: 2 },
      { optionIdx: 1, position: 3 },
    ]);
    const votes = await getUserRankVotes('testrank', 'voter1');
    expect(votes).toHaveLength(3);
  });

  it('replaces previous ordering on re-vote', async () => {
    await voteRankOrder('testrank', 'voter1', [
      { optionIdx: 0, position: 1 },
      { optionIdx: 1, position: 2 },
      { optionIdx: 2, position: 3 },
    ]);
    await voteRankOrder('testrank', 'voter1', [
      { optionIdx: 2, position: 1 },
      { optionIdx: 1, position: 2 },
      { optionIdx: 0, position: 3 },
    ]);
    const votes = await getUserRankVotes('testrank', 'voter1');
    expect(votes).toHaveLength(3);
    const firstPlace = votes.find((v) => v.value === 1);
    expect(firstPlace!.option_idx).toBe(2);
  });

  it('stores correct position values', async () => {
    await voteRankOrder('testrank', 'voter1', [
      { optionIdx: 1, position: 1 },
      { optionIdx: 0, position: 2 },
      { optionIdx: 2, position: 3 },
    ]);
    const votes = await getUserRankVotes('testrank', 'voter1');
    const byIdx = votes.sort((a, b) => a.option_idx - b.option_idx);
    expect(byIdx[0].value).toBe(2); // idx 0 → position 2
    expect(byIdx[1].value).toBe(1); // idx 1 → position 1
    expect(byIdx[2].value).toBe(3); // idx 2 → position 3
  });
});

describe('getUserRankVotes', () => {
  beforeEach(async () => {
    await cleanAllTables(testDb);
    await createRank(baseRank, ['A']);
  });

  it('returns all votes for a specific user', async () => {
    await voteRankStar('testrank', 0, 'voter1', 4);
    const votes = await getUserRankVotes('testrank', 'voter1');
    expect(votes).toHaveLength(1);
  });

  it('returns empty array when user has no votes', async () => {
    expect(await getUserRankVotes('testrank', 'nobody')).toEqual([]);
  });
});

describe('updateRank', () => {
  beforeEach(async () => {
    await cleanAllTables(testDb);
    await createRank(baseRank, ['A', 'B']);
  });

  it('updates title, mode, settings, mentions', async () => {
    await updateRank('testrank', {
      title: 'Updated Rank',
      mode: RankMode.Order,
      anonymous: 1,
      show_live: 0,
      mentions: '["role1"]',
      options: ['A', 'B'],
    });
    const rank = await getRank('testrank');
    expect(rank!.title).toBe('Updated Rank');
    expect(rank!.mode).toBe(RankMode.Order);
    expect(rank!.anonymous).toBe(1);
  });

  it('clears all votes when options change', async () => {
    await voteRankStar('testrank', 0, 'voter1', 5);
    const result = await updateRank('testrank', {
      title: 'Test Rank',
      mode: RankMode.Star,
      anonymous: 0,
      show_live: 1,
      mentions: '[]',
      options: ['A', 'C'], // B removed, C added
    });
    expect(result).toBe(true);
    expect(await getRankVotes('testrank')).toEqual([]);
  });

  it('clears all votes when mode changes', async () => {
    await voteRankStar('testrank', 0, 'voter1', 3);
    const result = await updateRank('testrank', {
      title: 'Test Rank',
      mode: RankMode.Order,
      anonymous: 0,
      show_live: 1,
      mentions: '[]',
      options: ['A', 'B'],
    });
    expect(result).toBe(true);
    expect(await getRankVotes('testrank')).toEqual([]);
  });

  it('returns false when nothing changes (options same, mode same)', async () => {
    const result = await updateRank('testrank', {
      title: 'New Title',
      mode: RankMode.Star,
      anonymous: 0,
      show_live: 1,
      mentions: '[]',
      options: ['A', 'B'],
    });
    expect(result).toBe(false);
  });

  it('replaces options when labels change', async () => {
    await updateRank('testrank', {
      title: 'Test Rank',
      mode: RankMode.Star,
      anonymous: 0,
      show_live: 1,
      mentions: '[]',
      options: ['X', 'Y', 'Z'],
    });
    const opts = await getRankOptions('testrank');
    expect(opts).toHaveLength(3);
    expect(opts.map((o) => o.label)).toEqual(['X', 'Y', 'Z']);
  });

  it('detects option count change as options changed', async () => {
    await voteRankStar('testrank', 0, 'voter1', 4);
    const result = await updateRank('testrank', {
      title: 'Test',
      mode: RankMode.Star,
      anonymous: 0,
      show_live: 1,
      mentions: '[]',
      options: ['A', 'B', 'C'],
    });
    expect(result).toBe(true);
  });
});

describe('closeRank', () => {
  beforeEach(async () => {
    await cleanAllTables(testDb);
    await createRank(baseRank, ['A']);
  });

  it('sets closed to 1', async () => {
    await closeRank('testrank');
    const rank = await getRank('testrank');
    expect(rank!.closed).toBe(1);
  });
});

describe('getOpenRanksByCreator', () => {
  beforeEach(async () => {
    await cleanAllTables(testDb);
    await createRank(baseRank, ['A']);
    await createRank({ ...baseRank, id: 'closed1', closed: 1 }, ['A']);
    await createRank({ ...baseRank, id: 'other-chan', channel_id: 'chan2' }, ['A']);
  });

  it('returns only open ranks by the given creator in the given channel', async () => {
    const ranks = await getOpenRanksByCreator('creator1', 'chan1');
    expect(ranks).toHaveLength(1);
    expect(ranks[0].id).toBe('testrank');
  });
});
