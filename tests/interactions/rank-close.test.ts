import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest';
import type { Knex as KnexType } from 'knex';
import { cleanAllTables } from '../helpers/db-setup.js';
import { createMockButtonInteraction } from '../helpers/discord-mocks.js';
import { RankMode } from '../../src/util/constants.js';
import { rankCloseId } from '../../src/util/ids.js';

let testDb: KnexType;

vi.mock('../../src/db/connection.js', async () => {
  const { setupTestDb } = await import('../helpers/db-setup.js');
  testDb = await setupTestDb();
  return { default: testDb, isPostgres: false, initDb: vi.fn() };
});

const { createRank, getRank, setRankMessageId, voteRankStar, getRankVotes } = await import(
  '../../src/db/ranks.js'
);
const { handleRankClose } = await import('../../src/interactions/rank-close.js');

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

describe('handleRankClose', () => {
  beforeEach(async () => {
    await cleanAllTables(testDb);
    await createRank(baseRank, ['Option A', 'Option B', 'Option C']);
    await setRankMessageId('testrank', 'msg1');
  });

  it('returns early for invalid customId (no reply/update called)', async () => {
    const interaction = createMockButtonInteraction({
      customId: 'invalid:garbage:stuff',
      user: { id: 'creator1' },
    });

    await handleRankClose(interaction as never);

    expect(interaction.reply).not.toHaveBeenCalled();
    expect(interaction.update).not.toHaveBeenCalled();
  });

  it('returns early for nonexistent rank', async () => {
    const interaction = createMockButtonInteraction({
      customId: rankCloseId('noexist1'),
      user: { id: 'creator1' },
    });

    await handleRankClose(interaction as never);

    expect(interaction.reply).not.toHaveBeenCalled();
    expect(interaction.update).not.toHaveBeenCalled();
  });

  it('replies "already closed" for closed rank', async () => {
    await testDb('ranks').where('id', 'testrank').update({ closed: 1 });

    const interaction = createMockButtonInteraction({
      customId: rankCloseId('testrank'),
      user: { id: 'creator1' },
    });

    await handleRankClose(interaction as never);

    expect(interaction.reply).toHaveBeenCalledWith(
      expect.objectContaining({ content: expect.stringContaining('already closed') }),
    );
    expect(interaction.update).not.toHaveBeenCalled();
  });

  it('rejects non-creator', async () => {
    const interaction = createMockButtonInteraction({
      customId: rankCloseId('testrank'),
      user: { id: 'other-user' },
    });

    await handleRankClose(interaction as never);

    expect(interaction.reply).toHaveBeenCalledWith(
      expect.objectContaining({ content: expect.stringContaining('Only the creator') }),
    );

    // Rank should remain open
    const rank = await getRank('testrank');
    expect(rank!.closed).toBe(0);
    expect(interaction.update).not.toHaveBeenCalled();
  });

  it('creator: closes rank in DB, updates ephemeral, refreshes channel message', async () => {
    const interaction = createMockButtonInteraction({
      customId: rankCloseId('testrank'),
      user: { id: 'creator1' },
    });

    await handleRankClose(interaction as never);

    // DB should be updated
    const rank = await getRank('testrank');
    expect(rank!.closed).toBe(1);

    // Ephemeral should be updated to confirm
    expect(interaction.update).toHaveBeenCalledWith(
      expect.objectContaining({ content: 'Ranking closed!', components: [] }),
    );

    // Channel message should be refreshed via REST patch
    expect(interaction.client.rest.patch).toHaveBeenCalled();
  });

  it('preserves votes after closing (votes still in DB)', async () => {
    // Cast some votes before closing
    await voteRankStar('testrank', 0, 'voter1', 5);
    await voteRankStar('testrank', 1, 'voter1', 3);
    await voteRankStar('testrank', 2, 'voter2', 4);

    const votesBefore = await getRankVotes('testrank');
    expect(votesBefore).toHaveLength(3);

    const interaction = createMockButtonInteraction({
      customId: rankCloseId('testrank'),
      user: { id: 'creator1' },
    });

    await handleRankClose(interaction as never);

    // Rank should be closed
    const rank = await getRank('testrank');
    expect(rank!.closed).toBe(1);

    // Votes should still be in DB
    const votesAfter = await getRankVotes('testrank');
    expect(votesAfter).toHaveLength(3);

    // Verify the actual vote data is intact
    const voter1Votes = votesAfter.filter((v) => v.user_id === 'voter1');
    expect(voter1Votes).toHaveLength(2);
    const voter2Votes = votesAfter.filter((v) => v.user_id === 'voter2');
    expect(voter2Votes).toHaveLength(1);
    expect(voter2Votes[0].value).toBe(4);
  });
});
