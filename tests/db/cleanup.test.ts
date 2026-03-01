import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest';
import type { Knex as KnexType } from 'knex';
import { cleanAllTables } from '../helpers/db-setup.js';
import { PollMode, RankMode } from '../../src/util/constants.js';

let testDb: KnexType;

vi.mock('../../src/db/connection.js', async () => {
  const { setupTestDb } = await import('../helpers/db-setup.js');
  testDb = await setupTestDb();
  return { default: testDb, isPostgres: false, initDb: vi.fn() };
});

const { runCleanup } = await import('../../src/db/cleanup.js');
const { createPoll, setPollMessageId, votePollSingle } = await import('../../src/db/polls.js');
const { createRank, setRankMessageId, voteRankStar } = await import('../../src/db/ranks.js');

function daysAgo(days: number): string {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().replace('T', ' ').slice(0, 19);
}

function hoursAgo(hours: number): string {
  return new Date(Date.now() - hours * 60 * 60 * 1000).toISOString().replace('T', ' ').slice(0, 19);
}

async function insertPoll(id: string, overrides: Record<string, unknown> = {}) {
  await createPoll(
    {
      id,
      guild_id: 'g1',
      channel_id: 'c1',
      creator_id: 'u1',
      title: `Poll ${id}`,
      mode: PollMode.Single,
      anonymous: 0,
      show_live: 1,
      mentions: '[]',
      closed: 0,
      ...overrides,
    },
    [{ label: 'A', target: null }],
  );
}

async function insertRank(id: string, overrides: Record<string, unknown> = {}) {
  await createRank(
    {
      id,
      guild_id: 'g1',
      channel_id: 'c1',
      creator_id: 'u1',
      title: `Rank ${id}`,
      mode: RankMode.Star,
      anonymous: 0,
      show_live: 1,
      mentions: '[]',
      closed: 0,
      ...overrides,
    },
    ['A'],
  );
}

afterAll(async () => {
  await testDb.destroy();
});

describe('runCleanup', () => {
  beforeEach(async () => {
    await cleanAllTables(testDb);
  });

  it('deletes closed polls older than 7 days', async () => {
    await insertPoll('old-closed', { closed: 1 });
    await setPollMessageId('old-closed', 'msg1');
    await testDb('polls')
      .where('id', 'old-closed')
      .update({ created_at: daysAgo(10) });

    await runCleanup();

    expect(await testDb('polls').where('id', 'old-closed').first()).toBeUndefined();
    expect(await testDb('poll_options').where('poll_id', 'old-closed')).toEqual([]);
  });

  it('keeps closed polls younger than 7 days', async () => {
    await insertPoll('new-closed', { closed: 1 });
    await setPollMessageId('new-closed', 'msg2');
    await testDb('polls')
      .where('id', 'new-closed')
      .update({ created_at: daysAgo(3) });

    await runCleanup();

    expect(await testDb('polls').where('id', 'new-closed').first()).toBeDefined();
  });

  it('deletes orphaned polls (no message_id) older than 1 hour', async () => {
    await insertPoll('orphan');
    // Don't set message_id — it's null by default
    await testDb('polls').where('id', 'orphan').update({ created_at: hoursAgo(2) });

    await runCleanup();

    expect(await testDb('polls').where('id', 'orphan').first()).toBeUndefined();
  });

  it('keeps orphaned polls younger than 1 hour', async () => {
    await insertPoll('fresh-orphan');
    // created_at is now by default — less than 1 hour

    await runCleanup();

    expect(await testDb('polls').where('id', 'fresh-orphan').first()).toBeDefined();
  });

  it('deletes stale open polls older than 90 days', async () => {
    await insertPoll('stale');
    await setPollMessageId('stale', 'msg3');
    await testDb('polls').where('id', 'stale').update({ created_at: daysAgo(100) });

    await runCleanup();

    expect(await testDb('polls').where('id', 'stale').first()).toBeUndefined();
  });

  it('keeps open polls younger than 90 days', async () => {
    await insertPoll('fresh');
    await setPollMessageId('fresh', 'msg4');
    await testDb('polls').where('id', 'fresh').update({ created_at: daysAgo(30) });

    await runCleanup();

    expect(await testDb('polls').where('id', 'fresh').first()).toBeDefined();
  });

  it('deletes closed ranks older than 7 days', async () => {
    await insertRank('old-rank', { closed: 1 });
    await setRankMessageId('old-rank', 'msg5');
    await testDb('ranks').where('id', 'old-rank').update({ created_at: daysAgo(10) });

    await runCleanup();

    expect(await testDb('ranks').where('id', 'old-rank').first()).toBeUndefined();
  });

  it('deletes orphaned ranks older than 1 hour', async () => {
    await insertRank('orphan-rank');
    await testDb('ranks').where('id', 'orphan-rank').update({ created_at: hoursAgo(2) });

    await runCleanup();

    expect(await testDb('ranks').where('id', 'orphan-rank').first()).toBeUndefined();
  });

  it('deletes stale open ranks older than 90 days', async () => {
    await insertRank('stale-rank');
    await setRankMessageId('stale-rank', 'msg6');
    await testDb('ranks').where('id', 'stale-rank').update({ created_at: daysAgo(100) });

    await runCleanup();

    expect(await testDb('ranks').where('id', 'stale-rank').first()).toBeUndefined();
  });

  it('deletes votes and options along with parent rows (FK safety)', async () => {
    await insertPoll('with-votes', { closed: 1 });
    await setPollMessageId('with-votes', 'msg7');
    await votePollSingle('with-votes', 'A', 'voter1');
    await testDb('polls').where('id', 'with-votes').update({ created_at: daysAgo(10) });

    await runCleanup();

    expect(await testDb('poll_votes').where('poll_id', 'with-votes')).toEqual([]);
    expect(await testDb('poll_options').where('poll_id', 'with-votes')).toEqual([]);
    expect(await testDb('polls').where('id', 'with-votes').first()).toBeUndefined();
  });

  it('does nothing when no stale data exists', async () => {
    await insertPoll('recent');
    await setPollMessageId('recent', 'msg8');

    // Should not throw
    await runCleanup();

    expect(await testDb('polls').where('id', 'recent').first()).toBeDefined();
  });
});
