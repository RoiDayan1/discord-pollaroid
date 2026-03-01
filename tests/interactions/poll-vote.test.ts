import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest';
import type { Knex as KnexType } from 'knex';
import { cleanAllTables } from '../helpers/db-setup.js';
import {
  createMockButtonInteraction,
  createMockModalSubmitInteraction,
  labelWrapped,
} from '../helpers/discord-mocks.js';
import { PollMode } from '../../src/util/constants.js';
import {
  pollVoteOpenId,
  pollVoteGoId,
  POLL_VOTE_MODAL_PREFIX,
  MODAL_POLL_VOTE_CHOICE,
} from '../../src/util/ids.js';

let testDb: KnexType;

vi.mock('../../src/db/connection.js', async () => {
  const { setupTestDb } = await import('../helpers/db-setup.js');
  testDb = await setupTestDb();
  return { default: testDb, isPostgres: false, initDb: vi.fn() };
});

const { createPoll, setPollMessageId, getPollVotes, votePollSingle, votePollMulti } =
  await import('../../src/db/polls.js');
const { handlePollVoteOpen, handlePollVoteGo, handlePollVoteModalSubmit } = await import(
  '../../src/interactions/poll-vote.js'
);

const POLL_ID = 'votepoll';
const CREATOR_ID = 'creator1';
const VOTER_ID = 'voter1';

const basePoll = {
  id: POLL_ID,
  guild_id: 'guild1',
  channel_id: 'chan1',
  creator_id: CREATOR_ID,
  title: 'Vote Test',
  mode: PollMode.Single,
  anonymous: 0,
  show_live: 1,
  mentions: '[]',
  closed: 0,
};

afterAll(async () => {
  await testDb.destroy();
});

// ---------------------------------------------------------------------------
// handlePollVoteOpen
// ---------------------------------------------------------------------------

describe('handlePollVoteOpen', () => {
  beforeEach(async () => {
    await cleanAllTables(testDb);
    await createPoll(basePoll, [
      { label: 'Option A', target: null },
      { label: 'Option B', target: null },
    ]);
    await setPollMessageId(POLL_ID, 'msg1');
  });

  it('returns early for invalid customId', async () => {
    const interaction = createMockButtonInteraction({
      customId: 'invalid:garbage:stuff',
      user: { id: VOTER_ID },
    });

    await handlePollVoteOpen(interaction as never);

    expect(interaction.reply).not.toHaveBeenCalled();
    expect(interaction.showModal).not.toHaveBeenCalled();
  });

  it('replies "closed" for a closed poll', async () => {
    await testDb('polls').where('id', POLL_ID).update({ closed: 1 });

    const interaction = createMockButtonInteraction({
      customId: pollVoteOpenId(POLL_ID),
      user: { id: VOTER_ID },
    });

    await handlePollVoteOpen(interaction as never);

    expect(interaction.reply).toHaveBeenCalledWith(
      expect.objectContaining({ content: expect.stringContaining('closed') }),
    );
  });

  it('replies "closed" for a nonexistent poll', async () => {
    const interaction = createMockButtonInteraction({
      customId: pollVoteOpenId('noexist1'),
      user: { id: VOTER_ID },
    });

    await handlePollVoteOpen(interaction as never);

    expect(interaction.reply).toHaveBeenCalledWith(
      expect.objectContaining({ content: expect.stringContaining('closed') }),
    );
  });

  it('creator gets ephemeral with Vote/Edit/Close buttons', async () => {
    const interaction = createMockButtonInteraction({
      customId: pollVoteOpenId(POLL_ID),
      user: { id: CREATOR_ID },
    });

    await handlePollVoteOpen(interaction as never);

    expect(interaction.reply).toHaveBeenCalledWith(
      expect.objectContaining({
        content: 'What would you like to do?',
        components: expect.arrayContaining([expect.anything()]),
      }),
    );

    // Verify it was called with the ephemeral flag
    const callArgs = interaction.reply.mock.calls[0][0] as Record<string, unknown>;
    expect(callArgs.flags).toBeDefined();
  });

  it('non-creator gets showModal called (vote modal)', async () => {
    const interaction = createMockButtonInteraction({
      customId: pollVoteOpenId(POLL_ID),
      user: { id: VOTER_ID },
    });

    await handlePollVoteOpen(interaction as never);

    expect(interaction.showModal).toHaveBeenCalled();
    expect(interaction.reply).not.toHaveBeenCalled();

    // Verify modal custom_id contains the poll vote prefix
    const modalPayload = interaction.showModal.mock.calls[0][0] as Record<string, unknown>;
    expect(modalPayload.custom_id).toBe(`${POLL_VOTE_MODAL_PREFIX}${POLL_ID}`);
  });

  it('non-creator with all targets filled gets "no slots available" message', async () => {
    // Create a poll with targets that are already filled
    await cleanAllTables(testDb);
    await createPoll(
      { ...basePoll, id: 'tgtpoll' },
      [
        { label: 'Full A', target: 1 },
        { label: 'Full B', target: 1 },
      ],
    );
    await setPollMessageId('tgtpoll', 'msg2');

    // Fill both options with votes from other users
    await votePollSingle('tgtpoll', 'Full A', 'other1');
    await votePollSingle('tgtpoll', 'Full B', 'other2');

    const interaction = createMockButtonInteraction({
      customId: pollVoteOpenId('tgtpoll'),
      user: { id: VOTER_ID },
    });

    await handlePollVoteOpen(interaction as never);

    expect(interaction.reply).toHaveBeenCalledWith(
      expect.objectContaining({
        content: expect.stringContaining('No slots available'),
      }),
    );
    expect(interaction.showModal).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// handlePollVoteGo
// ---------------------------------------------------------------------------

describe('handlePollVoteGo', () => {
  beforeEach(async () => {
    await cleanAllTables(testDb);
    await createPoll(basePoll, [
      { label: 'Option A', target: null },
      { label: 'Option B', target: null },
    ]);
    await setPollMessageId(POLL_ID, 'msg1');
  });

  it('returns early for invalid customId', async () => {
    const interaction = createMockButtonInteraction({
      customId: 'invalid:bad:format',
      user: { id: CREATOR_ID },
    });

    await handlePollVoteGo(interaction as never);

    expect(interaction.reply).not.toHaveBeenCalled();
    expect(interaction.showModal).not.toHaveBeenCalled();
  });

  it('replies "closed" for a closed poll', async () => {
    await testDb('polls').where('id', POLL_ID).update({ closed: 1 });

    const interaction = createMockButtonInteraction({
      customId: pollVoteGoId(POLL_ID),
      user: { id: CREATOR_ID },
    });

    await handlePollVoteGo(interaction as never);

    expect(interaction.reply).toHaveBeenCalledWith(
      expect.objectContaining({ content: expect.stringContaining('closed') }),
    );
  });

  it('opens vote modal (showModal called)', async () => {
    const interaction = createMockButtonInteraction({
      customId: pollVoteGoId(POLL_ID),
      user: { id: CREATOR_ID },
    });

    await handlePollVoteGo(interaction as never);

    expect(interaction.showModal).toHaveBeenCalled();

    const modalPayload = interaction.showModal.mock.calls[0][0] as Record<string, unknown>;
    expect(modalPayload.custom_id).toBe(`${POLL_VOTE_MODAL_PREFIX}${POLL_ID}`);
    expect(modalPayload.title).toBe('Vote');
  });
});

// ---------------------------------------------------------------------------
// handlePollVoteModalSubmit
// ---------------------------------------------------------------------------

describe('handlePollVoteModalSubmit', () => {
  beforeEach(async () => {
    await cleanAllTables(testDb);
    await createPoll(basePoll, [
      { label: 'Option A', target: null },
      { label: 'Option B', target: null },
    ]);
    await setPollMessageId(POLL_ID, 'msg1');
  });

  it('replies "closed" for a closed poll', async () => {
    await testDb('polls').where('id', POLL_ID).update({ closed: 1 });

    const interaction = createMockModalSubmitInteraction({
      customId: `${POLL_VOTE_MODAL_PREFIX}${POLL_ID}`,
      user: { id: VOTER_ID },
      components: [labelWrapped(MODAL_POLL_VOTE_CHOICE, ['Option A'])],
    });

    await handlePollVoteModalSubmit(interaction as never);

    expect(interaction.reply).toHaveBeenCalledWith(
      expect.objectContaining({ content: expect.stringContaining('closed') }),
    );
  });

  it('non-creator single vote: records vote, calls deferUpdate + editReply', async () => {
    const interaction = createMockModalSubmitInteraction({
      customId: `${POLL_VOTE_MODAL_PREFIX}${POLL_ID}`,
      user: { id: VOTER_ID },
      components: [labelWrapped(MODAL_POLL_VOTE_CHOICE, ['Option A'])],
    });

    await handlePollVoteModalSubmit(interaction as never);

    // Vote should be recorded in DB
    const votes = await getPollVotes(POLL_ID);
    expect(votes).toHaveLength(1);
    expect(votes[0].option_label).toBe('Option A');
    expect(votes[0].user_id).toBe(VOTER_ID);

    // Non-creator path: deferUpdate + editReply
    expect(interaction.deferUpdate).toHaveBeenCalled();
    expect(interaction.editReply).toHaveBeenCalled();

    // Should NOT use reply (that's the creator path)
    expect(interaction.reply).not.toHaveBeenCalled();
  });

  it('non-creator multi vote: records multiple votes in DB', async () => {
    await cleanAllTables(testDb);
    await createPoll(
      { ...basePoll, mode: PollMode.Multi },
      [
        { label: 'Option A', target: null },
        { label: 'Option B', target: null },
        { label: 'Option C', target: null },
      ],
    );
    await setPollMessageId(POLL_ID, 'msg1');

    const interaction = createMockModalSubmitInteraction({
      customId: `${POLL_VOTE_MODAL_PREFIX}${POLL_ID}`,
      user: { id: VOTER_ID },
      components: [labelWrapped(MODAL_POLL_VOTE_CHOICE, ['Option A', 'Option C'])],
    });

    await handlePollVoteModalSubmit(interaction as never);

    const votes = await getPollVotes(POLL_ID);
    expect(votes).toHaveLength(2);
    const labels = votes.map((v) => v.option_label).sort();
    expect(labels).toEqual(['Option A', 'Option C']);

    expect(interaction.deferUpdate).toHaveBeenCalled();
    expect(interaction.editReply).toHaveBeenCalled();
  });

  it('creator single vote: records vote, calls reply (ephemeral) + editChannelMessage', async () => {
    const interaction = createMockModalSubmitInteraction({
      customId: `${POLL_VOTE_MODAL_PREFIX}${POLL_ID}`,
      user: { id: CREATOR_ID },
      components: [labelWrapped(MODAL_POLL_VOTE_CHOICE, ['Option B'])],
    });

    await handlePollVoteModalSubmit(interaction as never);

    // Vote should be recorded in DB
    const votes = await getPollVotes(POLL_ID);
    expect(votes).toHaveLength(1);
    expect(votes[0].option_label).toBe('Option B');
    expect(votes[0].user_id).toBe(CREATOR_ID);

    // Creator path: reply with ephemeral confirmation
    expect(interaction.reply).toHaveBeenCalledWith(
      expect.objectContaining({
        content: expect.stringContaining('Option B'),
      }),
    );

    // Creator path: channel message refreshed via REST patch
    expect(interaction.client.rest.patch).toHaveBeenCalled();

    // Should NOT use deferUpdate (that's the non-creator path)
    expect(interaction.deferUpdate).not.toHaveBeenCalled();
  });

  it('empty vote (deselect all) clears existing votes', async () => {
    // Pre-record a vote
    await votePollSingle(POLL_ID, 'Option A', VOTER_ID);
    const votesBefore = await getPollVotes(POLL_ID);
    expect(votesBefore).toHaveLength(1);

    const interaction = createMockModalSubmitInteraction({
      customId: `${POLL_VOTE_MODAL_PREFIX}${POLL_ID}`,
      user: { id: VOTER_ID },
      components: [labelWrapped(MODAL_POLL_VOTE_CHOICE, [])],
    });

    await handlePollVoteModalSubmit(interaction as never);

    // Votes should be cleared
    const votesAfter = await getPollVotes(POLL_ID);
    expect(votesAfter).toHaveLength(0);

    expect(interaction.deferUpdate).toHaveBeenCalled();
    expect(interaction.editReply).toHaveBeenCalled();
  });

  it('replaces previous single vote', async () => {
    // Pre-record a vote for Option A
    await votePollSingle(POLL_ID, 'Option A', VOTER_ID);

    const interaction = createMockModalSubmitInteraction({
      customId: `${POLL_VOTE_MODAL_PREFIX}${POLL_ID}`,
      user: { id: VOTER_ID },
      components: [labelWrapped(MODAL_POLL_VOTE_CHOICE, ['Option B'])],
    });

    await handlePollVoteModalSubmit(interaction as never);

    const votes = await getPollVotes(POLL_ID);
    expect(votes).toHaveLength(1);
    expect(votes[0].option_label).toBe('Option B');
    expect(votes[0].user_id).toBe(VOTER_ID);
  });

  it('server-side target enforcement: rejects vote for filled option', async () => {
    await cleanAllTables(testDb);
    await createPoll(basePoll, [
      { label: 'Limited', target: 1 },
      { label: 'Open', target: null },
    ]);
    await setPollMessageId(POLL_ID, 'msg1');

    // Fill the target with another user's vote
    await votePollSingle(POLL_ID, 'Limited', 'other-user');

    const interaction = createMockModalSubmitInteraction({
      customId: `${POLL_VOTE_MODAL_PREFIX}${POLL_ID}`,
      user: { id: VOTER_ID },
      components: [labelWrapped(MODAL_POLL_VOTE_CHOICE, ['Limited'])],
    });

    await handlePollVoteModalSubmit(interaction as never);

    // Should be rejected with an ephemeral error
    expect(interaction.reply).toHaveBeenCalledWith(
      expect.objectContaining({
        content: expect.stringContaining('full'),
      }),
    );

    // The voter should NOT have a vote recorded
    const votes = await getPollVotes(POLL_ID);
    expect(votes).toHaveLength(1);
    expect(votes[0].user_id).toBe('other-user');

    // Should not proceed to deferUpdate
    expect(interaction.deferUpdate).not.toHaveBeenCalled();
  });

  it('server-side target enforcement: allows re-vote by existing voter even when target is full', async () => {
    await cleanAllTables(testDb);
    await createPoll(basePoll, [
      { label: 'Limited', target: 1 },
      { label: 'Open', target: null },
    ]);
    await setPollMessageId(POLL_ID, 'msg1');

    // The voter already voted for this option (so they are the one filling the target)
    await votePollSingle(POLL_ID, 'Limited', VOTER_ID);

    const interaction = createMockModalSubmitInteraction({
      customId: `${POLL_VOTE_MODAL_PREFIX}${POLL_ID}`,
      user: { id: VOTER_ID },
      components: [labelWrapped(MODAL_POLL_VOTE_CHOICE, ['Limited'])],
    });

    await handlePollVoteModalSubmit(interaction as never);

    // Should NOT be rejected — the voter already holds this slot
    expect(interaction.reply).not.toHaveBeenCalledWith(
      expect.objectContaining({ content: expect.stringContaining('full') }),
    );

    // Vote should still be in DB
    const votes = await getPollVotes(POLL_ID);
    expect(votes).toHaveLength(1);
    expect(votes[0].option_label).toBe('Limited');
    expect(votes[0].user_id).toBe(VOTER_ID);

    // Non-creator path should proceed normally
    expect(interaction.deferUpdate).toHaveBeenCalled();
    expect(interaction.editReply).toHaveBeenCalled();
  });

  it('non-live poll: non-creator gets followUp with ephemeral confirmation', async () => {
    await cleanAllTables(testDb);
    await createPoll(
      { ...basePoll, show_live: 0 },
      [
        { label: 'Option A', target: null },
        { label: 'Option B', target: null },
      ],
    );
    await setPollMessageId(POLL_ID, 'msg1');

    const interaction = createMockModalSubmitInteraction({
      customId: `${POLL_VOTE_MODAL_PREFIX}${POLL_ID}`,
      user: { id: VOTER_ID },
      components: [labelWrapped(MODAL_POLL_VOTE_CHOICE, ['Option A'])],
    });

    await handlePollVoteModalSubmit(interaction as never);

    // Non-creator path
    expect(interaction.deferUpdate).toHaveBeenCalled();
    expect(interaction.editReply).toHaveBeenCalled();

    // Non-live: should get followUp with ephemeral confirmation
    expect(interaction.followUp).toHaveBeenCalledWith(
      expect.objectContaining({
        content: expect.stringContaining('Option A'),
      }),
    );
  });

  it('live poll: non-creator does NOT get followUp', async () => {
    // basePoll has show_live: 1 (already set up in beforeEach)
    const interaction = createMockModalSubmitInteraction({
      customId: `${POLL_VOTE_MODAL_PREFIX}${POLL_ID}`,
      user: { id: VOTER_ID },
      components: [labelWrapped(MODAL_POLL_VOTE_CHOICE, ['Option A'])],
    });

    await handlePollVoteModalSubmit(interaction as never);

    expect(interaction.deferUpdate).toHaveBeenCalled();
    expect(interaction.editReply).toHaveBeenCalled();

    // Live poll: no followUp
    expect(interaction.followUp).not.toHaveBeenCalled();
  });

  it('replies "closed" for a nonexistent poll via modal submit', async () => {
    const interaction = createMockModalSubmitInteraction({
      customId: `${POLL_VOTE_MODAL_PREFIX}noexist1`,
      user: { id: VOTER_ID },
      components: [labelWrapped(MODAL_POLL_VOTE_CHOICE, ['Option A'])],
    });

    await handlePollVoteModalSubmit(interaction as never);

    expect(interaction.reply).toHaveBeenCalledWith(
      expect.objectContaining({ content: expect.stringContaining('closed') }),
    );
  });
});
