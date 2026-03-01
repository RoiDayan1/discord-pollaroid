import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from 'vitest';
import type { Knex as KnexType } from 'knex';
import { setupTestDb, cleanAllTables } from '../helpers/db-setup.js';
import { PollMode } from '../../src/util/constants.js';

let testDb: KnexType;

vi.mock('../../src/db/connection.js', async () => {
  const { setupTestDb } = await import('../helpers/db-setup.js');
  testDb = await setupTestDb();
  return { default: testDb, isPostgres: false, initDb: vi.fn() };
});

const {
  createPoll,
  getPoll,
  getPollOptions,
  getPollVotes,
  getUserPollVotes,
  setPollMessageId,
  votePollSingle,
  votePollMulti,
  clearPollVotes,
  updatePoll,
  getPollVoteCounts,
  closePoll,
  getOpenPollsByCreator,
} = await import('../../src/db/polls.js');

const basePoll = {
  id: 'testpoll',
  guild_id: 'guild1',
  channel_id: 'chan1',
  creator_id: 'creator1',
  title: 'Test Poll',
  mode: PollMode.Single,
  anonymous: 0,
  show_live: 1,
  mentions: '[]',
  closed: 0,
};

afterAll(async () => {
  await testDb.destroy();
});

describe('createPoll + getPoll', () => {
  beforeEach(async () => {
    await cleanAllTables(testDb);
  });

  it('creates a poll and retrieves it by ID', async () => {
    await createPoll(basePoll, [
      { label: 'A', target: null },
      { label: 'B', target: 5 },
    ]);
    const poll = await getPoll('testpoll');
    expect(poll).toBeDefined();
    expect(poll!.title).toBe('Test Poll');
    expect(poll!.mode).toBe(PollMode.Single);
    expect(poll!.message_id).toBeNull();
    expect(poll!.closed).toBe(0);
  });

  it('stores all fields correctly', async () => {
    await createPoll(
      { ...basePoll, anonymous: 1, show_live: 0, mentions: '["everyone"]' },
      [{ label: 'X', target: null }],
    );
    const poll = await getPoll('testpoll');
    expect(poll!.anonymous).toBe(1);
    expect(poll!.show_live).toBe(0);
    expect(poll!.mentions).toBe('["everyone"]');
    expect(poll!.guild_id).toBe('guild1');
    expect(poll!.channel_id).toBe('chan1');
    expect(poll!.creator_id).toBe('creator1');
  });

  it('returns undefined for nonexistent poll', async () => {
    expect(await getPoll('nonexistent')).toBeUndefined();
  });
});

describe('setPollMessageId', () => {
  beforeEach(async () => {
    await cleanAllTables(testDb);
    await createPoll(basePoll, [{ label: 'A', target: null }]);
  });

  it('updates the message_id', async () => {
    await setPollMessageId('testpoll', 'msg123');
    const poll = await getPoll('testpoll');
    expect(poll!.message_id).toBe('msg123');
  });
});

describe('getPollOptions', () => {
  beforeEach(async () => {
    await cleanAllTables(testDb);
  });

  it('returns options ordered by idx', async () => {
    await createPoll(basePoll, [
      { label: 'C', target: null },
      { label: 'A', target: 3 },
      { label: 'B', target: null },
    ]);
    const options = await getPollOptions('testpoll');
    expect(options).toHaveLength(3);
    expect(options[0].label).toBe('C');
    expect(options[0].idx).toBe(0);
    expect(options[1].label).toBe('A');
    expect(options[1].target).toBe(3);
    expect(options[2].label).toBe('B');
  });

  it('returns empty array for nonexistent poll', async () => {
    expect(await getPollOptions('missing')).toEqual([]);
  });

  it('stores option targets correctly', async () => {
    await createPoll(basePoll, [
      { label: 'With Target', target: 5 },
      { label: 'No Target', target: null },
    ]);
    const options = await getPollOptions('testpoll');
    expect(options[0].target).toBe(5);
    expect(options[1].target).toBeNull();
  });
});

describe('votePollSingle', () => {
  beforeEach(async () => {
    await cleanAllTables(testDb);
    await createPoll(basePoll, [
      { label: 'A', target: null },
      { label: 'B', target: null },
    ]);
  });

  it('records a vote for a single option', async () => {
    await votePollSingle('testpoll', 'A', 'voter1');
    const votes = await getPollVotes('testpoll');
    expect(votes).toHaveLength(1);
    expect(votes[0].option_label).toBe('A');
    expect(votes[0].user_id).toBe('voter1');
  });

  it('replaces previous vote in single mode', async () => {
    await votePollSingle('testpoll', 'A', 'voter1');
    await votePollSingle('testpoll', 'B', 'voter1');
    const votes = await getPollVotes('testpoll');
    expect(votes).toHaveLength(1);
    expect(votes[0].option_label).toBe('B');
  });

  it('allows different users to vote for different options', async () => {
    await votePollSingle('testpoll', 'A', 'voter1');
    await votePollSingle('testpoll', 'B', 'voter2');
    const votes = await getPollVotes('testpoll');
    expect(votes).toHaveLength(2);
  });
});

describe('votePollMulti', () => {
  beforeEach(async () => {
    await cleanAllTables(testDb);
    await createPoll({ ...basePoll, mode: PollMode.Multi }, [
      { label: 'A', target: null },
      { label: 'B', target: null },
      { label: 'C', target: null },
    ]);
  });

  it('records multiple votes for one user', async () => {
    await votePollMulti('testpoll', ['A', 'B'], 'voter1');
    const votes = await getUserPollVotes('testpoll', 'voter1');
    expect(votes).toHaveLength(2);
    const labels = votes.map((v) => v.option_label).sort();
    expect(labels).toEqual(['A', 'B']);
  });

  it('replaces all previous votes on re-vote', async () => {
    await votePollMulti('testpoll', ['A', 'B'], 'voter1');
    await votePollMulti('testpoll', ['C'], 'voter1');
    const votes = await getUserPollVotes('testpoll', 'voter1');
    expect(votes).toHaveLength(1);
    expect(votes[0].option_label).toBe('C');
  });

  it('allows voting for a single option in multi mode', async () => {
    await votePollMulti('testpoll', ['B'], 'voter1');
    const votes = await getUserPollVotes('testpoll', 'voter1');
    expect(votes).toHaveLength(1);
  });
});

describe('getUserPollVotes', () => {
  beforeEach(async () => {
    await cleanAllTables(testDb);
    await createPoll(basePoll, [{ label: 'A', target: null }]);
  });

  it('returns votes for a specific user', async () => {
    await votePollSingle('testpoll', 'A', 'voter1');
    await votePollSingle('testpoll', 'A', 'voter2');
    const votes = await getUserPollVotes('testpoll', 'voter1');
    expect(votes).toHaveLength(1);
    expect(votes[0].user_id).toBe('voter1');
  });

  it('returns empty array when user has no votes', async () => {
    expect(await getUserPollVotes('testpoll', 'nobody')).toEqual([]);
  });
});

describe('clearPollVotes', () => {
  beforeEach(async () => {
    await cleanAllTables(testDb);
    await createPoll({ ...basePoll, mode: PollMode.Multi }, [
      { label: 'A', target: null },
      { label: 'B', target: null },
    ]);
  });

  it('removes all votes for a specific user', async () => {
    await votePollMulti('testpoll', ['A', 'B'], 'voter1');
    await clearPollVotes('testpoll', 'voter1');
    expect(await getUserPollVotes('testpoll', 'voter1')).toEqual([]);
  });

  it('does not affect other users votes', async () => {
    await votePollSingle('testpoll', 'A', 'voter1');
    await votePollSingle('testpoll', 'A', 'voter2');
    await clearPollVotes('testpoll', 'voter1');
    const allVotes = await getPollVotes('testpoll');
    expect(allVotes).toHaveLength(1);
    expect(allVotes[0].user_id).toBe('voter2');
  });
});

describe('getPollVoteCounts', () => {
  beforeEach(async () => {
    await cleanAllTables(testDb);
    await createPoll({ ...basePoll, mode: PollMode.Multi }, [
      { label: 'A', target: null },
      { label: 'B', target: null },
    ]);
  });

  it('returns map of label to count', async () => {
    await votePollMulti('testpoll', ['A', 'B'], 'voter1');
    await votePollSingle('testpoll', 'A', 'voter2');
    const counts = await getPollVoteCounts('testpoll');
    expect(counts.get('A')).toBe(2);
    expect(counts.get('B')).toBe(1);
  });

  it('returns empty map for poll with no votes', async () => {
    const counts = await getPollVoteCounts('testpoll');
    expect(counts.size).toBe(0);
  });
});

describe('updatePoll', () => {
  beforeEach(async () => {
    await cleanAllTables(testDb);
    await createPoll(basePoll, [
      { label: 'A', target: null },
      { label: 'B', target: null },
    ]);
  });

  it('updates title, mode, settings, mentions', async () => {
    await updatePoll('testpoll', {
      title: 'Updated',
      mode: PollMode.Multi,
      anonymous: 1,
      show_live: 0,
      mentions: '["role1"]',
      options: [
        { label: 'A', target: null },
        { label: 'B', target: null },
      ],
    });
    const poll = await getPoll('testpoll');
    expect(poll!.title).toBe('Updated');
    expect(poll!.mode).toBe(PollMode.Multi);
    expect(poll!.anonymous).toBe(1);
    expect(poll!.show_live).toBe(0);
    expect(poll!.mentions).toBe('["role1"]');
  });

  it('returns false when labels unchanged (no votes cleared)', async () => {
    const result = await updatePoll('testpoll', {
      title: 'New Title',
      mode: PollMode.Single,
      anonymous: 0,
      show_live: 1,
      mentions: '[]',
      options: [
        { label: 'A', target: null },
        { label: 'B', target: null },
      ],
    });
    expect(result).toBe(false);
  });

  it('clears votes for removed options and returns true', async () => {
    await votePollSingle('testpoll', 'A', 'voter1');
    await votePollSingle('testpoll', 'B', 'voter2');
    const result = await updatePoll('testpoll', {
      title: 'Test Poll',
      mode: PollMode.Single,
      anonymous: 0,
      show_live: 1,
      mentions: '[]',
      options: [{ label: 'A', target: null }], // B removed
    });
    expect(result).toBe(true);
    const votes = await getPollVotes('testpoll');
    expect(votes).toHaveLength(1);
    expect(votes[0].option_label).toBe('A');
  });

  it('clears all votes when switching multi to single', async () => {
    await createPoll(
      { ...basePoll, id: 'multi1', mode: PollMode.Multi },
      [
        { label: 'X', target: null },
        { label: 'Y', target: null },
      ],
    );
    await votePollMulti('multi1', ['X', 'Y'], 'voter1');

    const result = await updatePoll('multi1', {
      title: 'Test',
      mode: PollMode.Single,
      anonymous: 0,
      show_live: 1,
      mentions: '[]',
      options: [
        { label: 'X', target: null },
        { label: 'Y', target: null },
      ],
    });
    expect(result).toBe(true);
    expect(await getPollVotes('multi1')).toEqual([]);
  });

  it('does not clear votes when switching single to multi', async () => {
    await votePollSingle('testpoll', 'A', 'voter1');
    const result = await updatePoll('testpoll', {
      title: 'Test Poll',
      mode: PollMode.Multi,
      anonymous: 0,
      show_live: 1,
      mentions: '[]',
      options: [
        { label: 'A', target: null },
        { label: 'B', target: null },
      ],
    });
    expect(result).toBe(false);
    expect(await getPollVotes('testpoll')).toHaveLength(1);
  });

  it('updates targets in-place without clearing votes when labels unchanged', async () => {
    await votePollSingle('testpoll', 'A', 'voter1');
    const result = await updatePoll('testpoll', {
      title: 'Test Poll',
      mode: PollMode.Single,
      anonymous: 0,
      show_live: 1,
      mentions: '[]',
      options: [
        { label: 'A', target: 5 },
        { label: 'B', target: 10 },
      ],
    });
    expect(result).toBe(false);
    expect(await getPollVotes('testpoll')).toHaveLength(1);
    const opts = await getPollOptions('testpoll');
    expect(opts[0].target).toBe(5);
    expect(opts[1].target).toBe(10);
  });

  it('replaces options entirely when labels change', async () => {
    await updatePoll('testpoll', {
      title: 'Test Poll',
      mode: PollMode.Single,
      anonymous: 0,
      show_live: 1,
      mentions: '[]',
      options: [
        { label: 'X', target: null },
        { label: 'Y', target: 3 },
      ],
    });
    const opts = await getPollOptions('testpoll');
    expect(opts).toHaveLength(2);
    expect(opts[0].label).toBe('X');
    expect(opts[1].label).toBe('Y');
    expect(opts[1].target).toBe(3);
  });
});

describe('closePoll', () => {
  beforeEach(async () => {
    await cleanAllTables(testDb);
    await createPoll(basePoll, [{ label: 'A', target: null }]);
  });

  it('sets closed to 1', async () => {
    await closePoll('testpoll');
    const poll = await getPoll('testpoll');
    expect(poll!.closed).toBe(1);
  });
});

describe('getOpenPollsByCreator', () => {
  beforeEach(async () => {
    await cleanAllTables(testDb);
    await createPoll(basePoll, [{ label: 'A', target: null }]);
    await createPoll(
      { ...basePoll, id: 'closed1', closed: 1 },
      [{ label: 'A', target: null }],
    );
    await createPoll(
      { ...basePoll, id: 'other-chan', channel_id: 'chan2' },
      [{ label: 'A', target: null }],
    );
    await createPoll(
      { ...basePoll, id: 'other-creator', creator_id: 'someone-else' },
      [{ label: 'A', target: null }],
    );
  });

  it('returns only open polls by the given creator in the given channel', async () => {
    const polls = await getOpenPollsByCreator('creator1', 'chan1');
    expect(polls).toHaveLength(1);
    expect(polls[0].id).toBe('testpoll');
  });

  it('does not return closed polls', async () => {
    const polls = await getOpenPollsByCreator('creator1', 'chan1');
    const ids = polls.map((p) => p.id);
    expect(ids).not.toContain('closed1');
  });

  it('does not return polls in other channels', async () => {
    const polls = await getOpenPollsByCreator('creator1', 'chan1');
    const ids = polls.map((p) => p.id);
    expect(ids).not.toContain('other-chan');
  });
});
