import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from 'vitest';
import type { Knex as KnexType } from 'knex';
import { setupTestDb, cleanAllTables } from '../helpers/db-setup.js';
import { createMockButtonInteraction } from '../helpers/discord-mocks.js';
import { PollMode } from '../../src/util/constants.js';
import { pollCloseId } from '../../src/util/ids.js';

let testDb: KnexType;

vi.mock('../../src/db/connection.js', async () => {
  const { setupTestDb } = await import('../helpers/db-setup.js');
  testDb = await setupTestDb();
  return { default: testDb, isPostgres: false, initDb: vi.fn() };
});

const { createPoll, getPoll, setPollMessageId } = await import('../../src/db/polls.js');
const { handlePollClose } = await import('../../src/interactions/poll-close.js');

const basePoll = {
  id: 'closepoll',
  guild_id: 'guild1',
  channel_id: 'chan1',
  creator_id: 'creator1',
  title: 'Close Test',
  mode: PollMode.Single,
  anonymous: 0,
  show_live: 1,
  mentions: '[]',
  closed: 0,
};

describe('handlePollClose', () => {
  beforeEach(async () => {
    await cleanAllTables(testDb);
    await createPoll(basePoll, [{ label: 'A', target: null }]);
    await setPollMessageId('closepoll', 'msg1');
  });

  afterAll(async () => {
    await testDb.destroy();
  });

  it('closes the poll when called by the creator', async () => {
    const interaction = createMockButtonInteraction({
      customId: pollCloseId('closepoll'),
      user: { id: 'creator1' },
    });

    await handlePollClose(interaction as never);

    // DB should be updated
    const poll = await getPoll('closepoll');
    expect(poll!.closed).toBe(1);

    // Ephemeral should be updated to confirm
    expect(interaction.update).toHaveBeenCalledWith(
      expect.objectContaining({ content: 'Poll closed!' }),
    );

    // Channel message should be refreshed via REST
    expect(interaction.client.rest.patch).toHaveBeenCalled();
  });

  it('rejects non-creator', async () => {
    const interaction = createMockButtonInteraction({
      customId: pollCloseId('closepoll'),
      user: { id: 'other-user' },
    });

    await handlePollClose(interaction as never);

    expect(interaction.reply).toHaveBeenCalledWith(
      expect.objectContaining({ content: expect.stringContaining('Only the poll creator') }),
    );

    // Poll should remain open
    const poll = await getPoll('closepoll');
    expect(poll!.closed).toBe(0);
  });

  it('replies with already closed message', async () => {
    // Close the poll first
    await testDb('polls').where('id', 'closepoll').update({ closed: 1 });

    const interaction = createMockButtonInteraction({
      customId: pollCloseId('closepoll'),
      user: { id: 'creator1' },
    });

    await handlePollClose(interaction as never);

    expect(interaction.reply).toHaveBeenCalledWith(
      expect.objectContaining({ content: expect.stringContaining('already closed') }),
    );
  });
});
