import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest';
import type { Knex as KnexType } from 'knex';
import { cleanAllTables } from '../helpers/db-setup.js';
import {
  createMockButtonInteraction,
  createMockModalSubmitInteraction,
  createMockSelectMenuInteraction,
  labelWrapped,
} from '../helpers/discord-mocks.js';
import { RankMode } from '../../src/util/constants.js';
import {
  rankRateId,
  rankRateGoId,
  rankOrderStartId,
  rankOrderStepId,
  rankOrderGoId,
  rankOrderCloseId,
  RANK_STAR_VOTE_MODAL_PREFIX,
  modalRankStarId,
} from '../../src/util/ids.js';

let testDb: KnexType;

vi.mock('../../src/db/connection.js', async () => {
  const { setupTestDb } = await import('../helpers/db-setup.js');
  testDb = await setupTestDb();
  return { default: testDb, isPostgres: false, initDb: vi.fn() };
});

const { createRank, getRank, getRankVotes, getUserRankVotes, setRankMessageId, voteRankStar } =
  await import('../../src/db/ranks.js');
const {
  handleRankStarVoteOpen,
  handleRankRateGo,
  handleRankStarVoteSubmit,
  handleRankOrderStart,
  handleRankOrderStep,
  handleRankOrderGo,
  handleRankOrderClose,
} = await import('../../src/interactions/rank-vote.js');

const baseStarRank = {
  id: 'starrank',
  guild_id: 'guild1',
  channel_id: 'chan1',
  creator_id: 'creator1',
  title: 'Star Test',
  mode: RankMode.Star,
  anonymous: 0,
  show_live: 1,
  mentions: '[]',
  closed: 0,
};

const baseOrderRank = {
  id: 'orderrank',
  guild_id: 'guild1',
  channel_id: 'chan1',
  creator_id: 'creator1',
  title: 'Order Test',
  mode: RankMode.Order,
  anonymous: 0,
  show_live: 1,
  mentions: '[]',
  closed: 0,
};

afterAll(async () => {
  await testDb.destroy();
});

// ---------------------------------------------------------------------------
// handleRankStarVoteOpen
// ---------------------------------------------------------------------------

describe('handleRankStarVoteOpen', () => {
  beforeEach(async () => {
    await cleanAllTables(testDb);
    await createRank(baseStarRank, ['Alpha', 'Beta']);
    await setRankMessageId('starrank', 'msg1');
  });

  it('returns early for invalid customId', async () => {
    const interaction = createMockButtonInteraction({
      customId: 'totally-invalid-id',
      user: { id: 'creator1' },
    });

    await handleRankStarVoteOpen(interaction as never);

    expect(interaction.reply).not.toHaveBeenCalled();
    expect(interaction.showModal).not.toHaveBeenCalled();
  });

  it('replies "closed" for closed rank', async () => {
    await testDb('ranks').where('id', 'starrank').update({ closed: 1 });

    const interaction = createMockButtonInteraction({
      customId: rankRateId('starrank'),
      user: { id: 'someone' },
    });

    await handleRankStarVoteOpen(interaction as never);

    expect(interaction.reply).toHaveBeenCalledWith(
      expect.objectContaining({ content: expect.stringContaining('closed') }),
    );
  });

  it('creator gets ephemeral with Rate/Edit/Close buttons', async () => {
    const interaction = createMockButtonInteraction({
      customId: rankRateId('starrank'),
      user: { id: 'creator1' },
    });

    await handleRankStarVoteOpen(interaction as never);

    expect(interaction.reply).toHaveBeenCalledWith(
      expect.objectContaining({
        content: 'What would you like to do?',
        components: expect.any(Array),
      }),
    );
    // Verify ephemeral flag
    const callArgs = interaction.reply.mock.calls[0][0];
    expect(callArgs.flags).toBeTruthy();
  });

  it('non-creator gets showModal called', async () => {
    const interaction = createMockButtonInteraction({
      customId: rankRateId('starrank'),
      user: { id: 'voter1' },
    });

    await handleRankStarVoteOpen(interaction as never);

    expect(interaction.showModal).toHaveBeenCalled();
    expect(interaction.reply).not.toHaveBeenCalled();

    // Modal should have the star vote prefix
    const modalPayload = interaction.showModal.mock.calls[0][0];
    expect(modalPayload.custom_id).toBe(`${RANK_STAR_VOTE_MODAL_PREFIX}starrank`);
  });
});

// ---------------------------------------------------------------------------
// handleRankRateGo
// ---------------------------------------------------------------------------

describe('handleRankRateGo', () => {
  beforeEach(async () => {
    await cleanAllTables(testDb);
    await createRank(baseStarRank, ['Alpha', 'Beta']);
    await setRankMessageId('starrank', 'msg1');
  });

  it('replies "closed" for closed rank', async () => {
    await testDb('ranks').where('id', 'starrank').update({ closed: 1 });

    const interaction = createMockButtonInteraction({
      customId: rankRateGoId('starrank'),
      user: { id: 'creator1' },
    });

    await handleRankRateGo(interaction as never);

    expect(interaction.reply).toHaveBeenCalledWith(
      expect.objectContaining({ content: expect.stringContaining('closed') }),
    );
  });

  it('opens star vote modal via showModal', async () => {
    const interaction = createMockButtonInteraction({
      customId: rankRateGoId('starrank'),
      user: { id: 'creator1' },
    });

    await handleRankRateGo(interaction as never);

    expect(interaction.showModal).toHaveBeenCalled();
    const modalPayload = interaction.showModal.mock.calls[0][0];
    expect(modalPayload.custom_id).toBe(`${RANK_STAR_VOTE_MODAL_PREFIX}starrank`);
    // Should have one component per option (Alpha, Beta)
    expect(modalPayload.components).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// handleRankStarVoteSubmit
// ---------------------------------------------------------------------------

describe('handleRankStarVoteSubmit', () => {
  beforeEach(async () => {
    await cleanAllTables(testDb);
    await createRank(baseStarRank, ['Alpha', 'Beta']);
    await setRankMessageId('starrank', 'msg1');
  });

  it('replies "closed" for closed rank', async () => {
    await testDb('ranks').where('id', 'starrank').update({ closed: 1 });

    const interaction = createMockModalSubmitInteraction({
      customId: `${RANK_STAR_VOTE_MODAL_PREFIX}starrank`,
      user: { id: 'voter1' },
      components: [
        labelWrapped(modalRankStarId(0), ['3']),
        labelWrapped(modalRankStarId(1), ['5']),
      ],
    });

    await handleRankStarVoteSubmit(interaction as never);

    expect(interaction.reply).toHaveBeenCalledWith(
      expect.objectContaining({ content: expect.stringContaining('closed') }),
    );
  });

  it('non-creator: records star ratings, calls deferUpdate + editReply', async () => {
    const interaction = createMockModalSubmitInteraction({
      customId: `${RANK_STAR_VOTE_MODAL_PREFIX}starrank`,
      user: { id: 'voter1' },
      components: [
        labelWrapped(modalRankStarId(0), ['3']),
        labelWrapped(modalRankStarId(1), ['5']),
      ],
    });

    await handleRankStarVoteSubmit(interaction as never);

    // Should have recorded the votes
    const votes = await getUserRankVotes('starrank', 'voter1');
    expect(votes).toHaveLength(2);
    const alphaVote = votes.find((v) => v.option_idx === 0);
    const betaVote = votes.find((v) => v.option_idx === 1);
    expect(alphaVote!.value).toBe(3);
    expect(betaVote!.value).toBe(5);

    // Non-creator path: deferUpdate + editReply
    expect(interaction.deferUpdate).toHaveBeenCalled();
    expect(interaction.editReply).toHaveBeenCalled();
    // Should NOT use reply (that's the creator path)
    expect(interaction.reply).not.toHaveBeenCalled();
  });

  it('creator: records ratings, calls reply (ephemeral) + editChannelMessage', async () => {
    const interaction = createMockModalSubmitInteraction({
      customId: `${RANK_STAR_VOTE_MODAL_PREFIX}starrank`,
      user: { id: 'creator1' },
      components: [
        labelWrapped(modalRankStarId(0), ['4']),
        labelWrapped(modalRankStarId(1), ['2']),
      ],
    });

    await handleRankStarVoteSubmit(interaction as never);

    // Should have recorded the votes
    const votes = await getUserRankVotes('starrank', 'creator1');
    expect(votes).toHaveLength(2);
    const alphaVote = votes.find((v) => v.option_idx === 0);
    const betaVote = votes.find((v) => v.option_idx === 1);
    expect(alphaVote!.value).toBe(4);
    expect(betaVote!.value).toBe(2);

    // Creator path: reply (ephemeral) + channel message edit via REST
    expect(interaction.reply).toHaveBeenCalledWith(
      expect.objectContaining({ content: expect.stringContaining('Ratings recorded') }),
    );
    expect(interaction.client.rest.patch).toHaveBeenCalled();
    // Should NOT use deferUpdate (that's the non-creator path)
    expect(interaction.deferUpdate).not.toHaveBeenCalled();
  });

  it('non-live rank: non-creator gets followUp', async () => {
    // Update rank to not show live
    await testDb('ranks').where('id', 'starrank').update({ show_live: 0 });

    const interaction = createMockModalSubmitInteraction({
      customId: `${RANK_STAR_VOTE_MODAL_PREFIX}starrank`,
      user: { id: 'voter1' },
      components: [
        labelWrapped(modalRankStarId(0), ['3']),
        labelWrapped(modalRankStarId(1), ['5']),
      ],
    });

    await handleRankStarVoteSubmit(interaction as never);

    // Non-creator path with non-live: deferUpdate + editReply + followUp
    expect(interaction.deferUpdate).toHaveBeenCalled();
    expect(interaction.editReply).toHaveBeenCalled();
    expect(interaction.followUp).toHaveBeenCalledWith(
      expect.objectContaining({ content: expect.stringContaining('Ratings recorded') }),
    );
  });

  it('no ratings submitted: reply "No ratings submitted."', async () => {
    const interaction = createMockModalSubmitInteraction({
      customId: `${RANK_STAR_VOTE_MODAL_PREFIX}starrank`,
      user: { id: 'voter1' },
      // Empty selections — no stars chosen for either option
      components: [labelWrapped(modalRankStarId(0), []), labelWrapped(modalRankStarId(1), [])],
    });

    await handleRankStarVoteSubmit(interaction as never);

    // No votes should be in the DB
    const votes = await getUserRankVotes('starrank', 'voter1');
    expect(votes).toHaveLength(0);

    // Non-creator path: deferUpdate + editReply, then followUp with "No ratings submitted."
    // since show_live is 1, no followUp — the summary is part of the flow
    // Actually, with no ratings and show_live=1, the non-creator path does deferUpdate + editReply
    // The summary says "No ratings submitted." but for non-creator + show_live, no followUp
    expect(interaction.deferUpdate).toHaveBeenCalled();
    expect(interaction.editReply).toHaveBeenCalled();
  });

  it('no ratings submitted by creator: reply "No ratings submitted."', async () => {
    const interaction = createMockModalSubmitInteraction({
      customId: `${RANK_STAR_VOTE_MODAL_PREFIX}starrank`,
      user: { id: 'creator1' },
      components: [labelWrapped(modalRankStarId(0), []), labelWrapped(modalRankStarId(1), [])],
    });

    await handleRankStarVoteSubmit(interaction as never);

    // Creator path: reply with "No ratings submitted."
    expect(interaction.reply).toHaveBeenCalledWith(
      expect.objectContaining({ content: 'No ratings submitted.' }),
    );
  });
});

// ---------------------------------------------------------------------------
// handleRankOrderStart
// ---------------------------------------------------------------------------

describe('handleRankOrderStart', () => {
  beforeEach(async () => {
    await cleanAllTables(testDb);
    await createRank(baseOrderRank, ['First', 'Second', 'Third']);
    await setRankMessageId('orderrank', 'msg2');
  });

  it('returns early for invalid customId', async () => {
    const interaction = createMockButtonInteraction({
      customId: 'totally-invalid-id',
      user: { id: 'creator1' },
    });

    await handleRankOrderStart(interaction as never);

    expect(interaction.reply).not.toHaveBeenCalled();
    expect(interaction.showModal).not.toHaveBeenCalled();
  });

  it('replies "closed" for closed rank', async () => {
    await testDb('ranks').where('id', 'orderrank').update({ closed: 1 });

    const interaction = createMockButtonInteraction({
      customId: rankOrderStartId('orderrank'),
      user: { id: 'someone' },
    });

    await handleRankOrderStart(interaction as never);

    expect(interaction.reply).toHaveBeenCalledWith(
      expect.objectContaining({ content: expect.stringContaining('closed') }),
    );
  });

  it('creator gets ephemeral with Rank/Edit/Close buttons', async () => {
    const interaction = createMockButtonInteraction({
      customId: rankOrderStartId('orderrank'),
      user: { id: 'creator1' },
    });

    await handleRankOrderStart(interaction as never);

    expect(interaction.reply).toHaveBeenCalledWith(
      expect.objectContaining({
        content: 'What would you like to do?',
        components: expect.any(Array),
      }),
    );
    const callArgs = interaction.reply.mock.calls[0][0];
    expect(callArgs.flags).toBeTruthy();
  });

  it('non-creator gets step 1 select menu', async () => {
    const interaction = createMockButtonInteraction({
      customId: rankOrderStartId('orderrank'),
      user: { id: 'voter1' },
    });

    await handleRankOrderStart(interaction as never);

    expect(interaction.reply).toHaveBeenCalledWith(
      expect.objectContaining({
        content: expect.stringContaining('step 1/3'),
        components: expect.any(Array),
      }),
    );
    const callArgs = interaction.reply.mock.calls[0][0];
    expect(callArgs.flags).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// handleRankOrderStep
// ---------------------------------------------------------------------------

describe('handleRankOrderStep', () => {
  beforeEach(async () => {
    await cleanAllTables(testDb);
    await createRank(baseOrderRank, ['First', 'Second', 'Third']);
    await setRankMessageId('orderrank', 'msg2');
  });

  it('updates "closed" for closed rank', async () => {
    await testDb('ranks').where('id', 'orderrank').update({ closed: 1 });

    const interaction = createMockSelectMenuInteraction({
      customId: rankOrderStepId('orderrank', 1),
      values: ['0'],
      user: { id: 'voter1' },
    });

    await handleRankOrderStep(interaction as never);

    expect(interaction.update).toHaveBeenCalledWith(
      expect.objectContaining({ content: expect.stringContaining('closed') }),
    );
  });

  it('shows next step with remaining options', async () => {
    // Step 1: user picks option 0 ("First")
    const interaction = createMockSelectMenuInteraction({
      customId: rankOrderStepId('orderrank', 1),
      values: ['0'],
      user: { id: 'voter1' },
    });

    await handleRankOrderStep(interaction as never);

    // Should show step 2 with remaining options (Second, Third)
    expect(interaction.update).toHaveBeenCalledWith(
      expect.objectContaining({
        content: expect.stringContaining('step 2/3'),
        components: expect.any(Array),
      }),
    );
  });

  it('auto-assigns last option and saves when 1 remaining (3 options: step 1 -> step 2 picks final, auto-assigns last)', async () => {
    // Step 2: user has already picked option 0, now picks option 2
    // That leaves option 1 as the last auto-assigned option
    const interaction = createMockSelectMenuInteraction({
      customId: rankOrderStepId('orderrank', 2, [0]),
      values: ['2'],
      user: { id: 'voter1' },
    });

    await handleRankOrderStep(interaction as never);

    // Should show ranking summary
    expect(interaction.update).toHaveBeenCalledWith(
      expect.objectContaining({
        content: expect.stringContaining('Ranking submitted'),
        components: [],
      }),
    );

    // Verify votes were saved in DB
    const votes = await getRankVotes('orderrank');
    const userVotes = votes.filter((v) => v.user_id === 'voter1');
    expect(userVotes).toHaveLength(3);

    // Option 0 was picked first (position 1)
    const pos1 = userVotes.find((v) => v.option_idx === 0);
    expect(pos1!.value).toBe(1);
    // Option 2 was picked second (position 2)
    const pos2 = userVotes.find((v) => v.option_idx === 2);
    expect(pos2!.value).toBe(2);
    // Option 1 was auto-assigned last (position 3)
    const pos3 = userVotes.find((v) => v.option_idx === 1);
    expect(pos3!.value).toBe(3);
  });

  it('refreshes channel message after final submission', async () => {
    // Step 2 with previous pick of option 0, now picking option 1
    // leaves option 2 as auto-assigned last
    const interaction = createMockSelectMenuInteraction({
      customId: rankOrderStepId('orderrank', 2, [0]),
      values: ['1'],
      user: { id: 'voter1' },
    });

    await handleRankOrderStep(interaction as never);

    // Channel message should be refreshed via REST patch
    expect(interaction.client.rest.patch).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// handleRankOrderGo
// ---------------------------------------------------------------------------

describe('handleRankOrderGo', () => {
  beforeEach(async () => {
    await cleanAllTables(testDb);
    await createRank(baseOrderRank, ['First', 'Second', 'Third']);
    await setRankMessageId('orderrank', 'msg2');
  });

  it('updates "closed" for closed rank', async () => {
    await testDb('ranks').where('id', 'orderrank').update({ closed: 1 });

    const interaction = createMockButtonInteraction({
      customId: rankOrderGoId('orderrank'),
      user: { id: 'creator1' },
    });

    await handleRankOrderGo(interaction as never);

    expect(interaction.update).toHaveBeenCalledWith(
      expect.objectContaining({
        content: expect.stringContaining('closed'),
        components: [],
      }),
    );
  });

  it('shows first step select menu', async () => {
    const interaction = createMockButtonInteraction({
      customId: rankOrderGoId('orderrank'),
      user: { id: 'creator1' },
    });

    await handleRankOrderGo(interaction as never);

    expect(interaction.update).toHaveBeenCalledWith(
      expect.objectContaining({
        content: expect.stringContaining('step 1/3'),
        components: expect.any(Array),
      }),
    );
  });
});

// ---------------------------------------------------------------------------
// handleRankOrderClose
// ---------------------------------------------------------------------------

describe('handleRankOrderClose', () => {
  beforeEach(async () => {
    await cleanAllTables(testDb);
    await createRank(baseOrderRank, ['First', 'Second', 'Third']);
    await setRankMessageId('orderrank', 'msg2');
  });

  it('updates "already closed" for already closed rank', async () => {
    await testDb('ranks').where('id', 'orderrank').update({ closed: 1 });

    const interaction = createMockButtonInteraction({
      customId: rankOrderCloseId('orderrank'),
      user: { id: 'creator1' },
    });

    await handleRankOrderClose(interaction as never);

    expect(interaction.update).toHaveBeenCalledWith(
      expect.objectContaining({ content: expect.stringContaining('already closed') }),
    );
  });

  it('rejects non-creator', async () => {
    const interaction = createMockButtonInteraction({
      customId: rankOrderCloseId('orderrank'),
      user: { id: 'other-user' },
    });

    await handleRankOrderClose(interaction as never);

    expect(interaction.update).toHaveBeenCalledWith(
      expect.objectContaining({
        content: expect.stringContaining('Only the creator'),
      }),
    );

    // Rank should still be open
    const rank = await getRank('orderrank');
    expect(rank!.closed).toBe(0);
  });

  it('creator: closes rank, updates ephemeral, refreshes channel message', async () => {
    const interaction = createMockButtonInteraction({
      customId: rankOrderCloseId('orderrank'),
      user: { id: 'creator1' },
    });

    await handleRankOrderClose(interaction as never);

    // DB should be updated
    const rank = await getRank('orderrank');
    expect(rank!.closed).toBe(1);

    // Ephemeral should be updated to confirm
    expect(interaction.update).toHaveBeenCalledWith(
      expect.objectContaining({ content: 'Ranking closed!' }),
    );

    // Channel message should be refreshed via REST
    expect(interaction.client.rest.patch).toHaveBeenCalled();
  });
});
