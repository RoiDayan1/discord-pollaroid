import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest';
import type { Knex as KnexType } from 'knex';
import { cleanAllTables } from '../helpers/db-setup.js';
import {
  createMockButtonInteraction,
  createMockModalSubmitInteraction,
  labelWrapped,
  roleSelectWrapped,
} from '../helpers/discord-mocks.js';
import { RankMode, Setting } from '../../src/util/constants.js';
import {
  rankEditOpenId,
  RANK_EDIT_MODAL_PREFIX,
  MODAL_RANK_TITLE,
  MODAL_RANK_OPTIONS,
  MODAL_RANK_MODE,
  MODAL_RANK_SETTINGS,
  MODAL_RANK_MENTIONS,
} from '../../src/util/ids.js';

let testDb: KnexType;

vi.mock('../../src/db/connection.js', async () => {
  const { setupTestDb } = await import('../helpers/db-setup.js');
  testDb = await setupTestDb();
  return { default: testDb, isPostgres: false, initDb: vi.fn() };
});

const { createRank, getRank, getRankOptions, setRankMessageId, voteRankStar, getRankVotes } =
  await import('../../src/db/ranks.js');
const { handleRankEditButton, handleRankEditModalSubmit } = await import(
  '../../src/interactions/rank-edit.js'
);

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

// ---------------------------------------------------------------------------
// handleRankEditButton
// ---------------------------------------------------------------------------

describe('handleRankEditButton', () => {
  beforeEach(async () => {
    await cleanAllTables(testDb);
    await createRank(baseRank, ['Option A', 'Option B', 'Option C']);
    await setRankMessageId('testrank', 'msg1');
  });

  it('returns early for invalid customId (no reply, no showModal)', async () => {
    const interaction = createMockButtonInteraction({
      customId: 'totally-invalid-id',
      user: { id: 'creator1' },
    });

    await handleRankEditButton(interaction as never);

    expect(interaction.reply).not.toHaveBeenCalled();
    expect(interaction.showModal).not.toHaveBeenCalled();
  });

  it('replies "closed" for closed rank', async () => {
    await testDb('ranks').where('id', 'testrank').update({ closed: 1 });

    const interaction = createMockButtonInteraction({
      customId: rankEditOpenId('testrank'),
      user: { id: 'creator1' },
    });

    await handleRankEditButton(interaction as never);

    expect(interaction.reply).toHaveBeenCalledWith(
      expect.objectContaining({ content: expect.stringContaining('closed') }),
    );
    expect(interaction.showModal).not.toHaveBeenCalled();
  });

  it('replies "closed" for nonexistent rank', async () => {
    const interaction = createMockButtonInteraction({
      customId: rankEditOpenId('noexist1'),
      user: { id: 'creator1' },
    });

    await handleRankEditButton(interaction as never);

    expect(interaction.reply).toHaveBeenCalledWith(
      expect.objectContaining({ content: expect.stringContaining('closed') }),
    );
    expect(interaction.showModal).not.toHaveBeenCalled();
  });

  it('rejects non-creator with "Only the ranking creator can edit."', async () => {
    const interaction = createMockButtonInteraction({
      customId: rankEditOpenId('testrank'),
      user: { id: 'other-user' },
    });

    await handleRankEditButton(interaction as never);

    expect(interaction.reply).toHaveBeenCalledWith(
      expect.objectContaining({
        content: expect.stringContaining('Only the ranking creator can edit'),
      }),
    );
    expect(interaction.showModal).not.toHaveBeenCalled();
  });

  it('creator: calls showModal with pre-filled modal (title, customId, options)', async () => {
    const interaction = createMockButtonInteraction({
      customId: rankEditOpenId('testrank'),
      user: { id: 'creator1' },
    });

    await handleRankEditButton(interaction as never);

    expect(interaction.showModal).toHaveBeenCalledTimes(1);
    const modalPayload = interaction.showModal.mock.calls[0][0];
    expect(modalPayload.title).toBe('Edit Ranking');
    expect(modalPayload.custom_id).toBe(`${RANK_EDIT_MODAL_PREFIX}testrank`);

    // Verify pre-filled values
    const components = modalPayload.components;

    // First component: title TextInput
    const titleComponent = components[0].component;
    expect(titleComponent.value).toBe('Test Rank');

    // Second component: options TextInput
    const optionsComponent = components[1].component;
    expect(optionsComponent.value).toBe('Option A\nOption B\nOption C');
  });
});

// ---------------------------------------------------------------------------
// handleRankEditModalSubmit
// ---------------------------------------------------------------------------

describe('handleRankEditModalSubmit', () => {
  beforeEach(async () => {
    await cleanAllTables(testDb);
    await createRank(baseRank, ['Option A', 'Option B', 'Option C']);
    await setRankMessageId('testrank', 'msg1');
  });

  function buildEditInteraction(overrides: Record<string, unknown> = {}) {
    const titleValue = (overrides.titleValue as string) ?? 'Test Rank';
    const optionsValue = (overrides.optionsValue as string) ?? 'Option A\nOption B\nOption C';
    const modeValues = (overrides.modeValues as string[]) ?? [RankMode.Star];
    const settingsValues = (overrides.settingsValues as string[]) ?? [Setting.ShowLive];
    const mentionValues = (overrides.mentionValues as string[]) ?? [];

    const fields = {
      getTextInputValue: vi.fn((id: string) => {
        if (id === MODAL_RANK_TITLE) return titleValue;
        if (id === MODAL_RANK_OPTIONS) return optionsValue;
        return '';
      }),
    };

    const components = [
      labelWrapped(MODAL_RANK_MODE, modeValues),
      labelWrapped(MODAL_RANK_SETTINGS, settingsValues),
      roleSelectWrapped(MODAL_RANK_MENTIONS, mentionValues),
    ];

    return createMockModalSubmitInteraction({
      customId: `${RANK_EDIT_MODAL_PREFIX}testrank`,
      user: { id: 'creator1' },
      fields,
      components,
      ...overrides,
    });
  }

  it('replies "closed" for closed rank', async () => {
    await testDb('ranks').where('id', 'testrank').update({ closed: 1 });

    const interaction = buildEditInteraction();

    await handleRankEditModalSubmit(interaction as never);

    expect(interaction.reply).toHaveBeenCalledWith(
      expect.objectContaining({ content: expect.stringContaining('closed') }),
    );
  });

  it('rejects non-creator', async () => {
    const interaction = buildEditInteraction({
      user: { id: 'other-user' },
    });

    await handleRankEditModalSubmit(interaction as never);

    expect(interaction.reply).toHaveBeenCalledWith(
      expect.objectContaining({
        content: expect.stringContaining('Only the ranking creator can edit'),
      }),
    );
  });

  it('replies with validation error for order mode with 1 option', async () => {
    const interaction = buildEditInteraction({
      optionsValue: 'Only One',
      modeValues: [RankMode.Order],
    });

    await handleRankEditModalSubmit(interaction as never);

    expect(interaction.reply).toHaveBeenCalledWith(
      expect.objectContaining({ content: expect.stringContaining('at least 2') }),
    );

    // DB should not be modified
    const rank = await getRank('testrank');
    expect(rank!.title).toBe('Test Rank');
  });

  it('replies with validation error for duplicate options', async () => {
    const interaction = buildEditInteraction({
      optionsValue: 'Same\nSame',
    });

    await handleRankEditModalSubmit(interaction as never);

    expect(interaction.reply).toHaveBeenCalledWith(
      expect.objectContaining({ content: expect.stringContaining('Duplicate') }),
    );
  });

  it('updates rank successfully, replies "Ranking updated!"', async () => {
    const interaction = buildEditInteraction({
      titleValue: 'Updated Title',
      settingsValues: [Setting.Anonymous, Setting.ShowLive],
    });

    await handleRankEditModalSubmit(interaction as never);

    expect(interaction.reply).toHaveBeenCalledWith(
      expect.objectContaining({ content: 'Ranking updated!' }),
    );

    const updated = await getRank('testrank');
    expect(updated!.title).toBe('Updated Title');
    expect(updated!.anonymous).toBe(1);
    expect(updated!.show_live).toBe(1);
  });

  it('changing options clears all votes and mentions it in reply', async () => {
    // Cast some votes first
    await voteRankStar('testrank', 0, 'voter1', 5);
    await voteRankStar('testrank', 1, 'voter1', 3);
    await voteRankStar('testrank', 2, 'voter2', 4);

    const votesBefore = await getRankVotes('testrank');
    expect(votesBefore).toHaveLength(3);

    const interaction = buildEditInteraction({
      optionsValue: 'X\nY\nZ',
    });

    await handleRankEditModalSubmit(interaction as never);

    expect(interaction.reply).toHaveBeenCalledWith(
      expect.objectContaining({
        content: expect.stringContaining('All votes were cleared'),
      }),
    );

    // All votes should be gone
    const votesAfter = await getRankVotes('testrank');
    expect(votesAfter).toHaveLength(0);

    // Options should be updated
    const options = await getRankOptions('testrank');
    expect(options.map((o) => o.label)).toEqual(['X', 'Y', 'Z']);
  });

  it('changing mode clears all votes', async () => {
    // Cast some votes in star mode
    await voteRankStar('testrank', 0, 'voter1', 5);
    await voteRankStar('testrank', 1, 'voter1', 3);

    const votesBefore = await getRankVotes('testrank');
    expect(votesBefore).toHaveLength(2);

    const interaction = buildEditInteraction({
      modeValues: [RankMode.Order],
    });

    await handleRankEditModalSubmit(interaction as never);

    expect(interaction.reply).toHaveBeenCalledWith(
      expect.objectContaining({
        content: expect.stringContaining('All votes were cleared'),
      }),
    );

    const votesAfter = await getRankVotes('testrank');
    expect(votesAfter).toHaveLength(0);

    // Mode should be updated
    const updated = await getRank('testrank');
    expect(updated!.mode).toBe(RankMode.Order);
  });

  it('no changes: still replies "Ranking updated!" without votes cleared', async () => {
    // Cast some votes
    await voteRankStar('testrank', 0, 'voter1', 5);

    const interaction = buildEditInteraction();

    await handleRankEditModalSubmit(interaction as never);

    // Should reply with just "Ranking updated!" without the votes cleared message
    expect(interaction.reply).toHaveBeenCalledWith(
      expect.objectContaining({ content: 'Ranking updated!' }),
    );

    // Votes should be preserved
    const votes = await getRankVotes('testrank');
    expect(votes).toHaveLength(1);
    expect(votes[0].value).toBe(5);
  });

  it('refreshes channel message via client.rest.patch', async () => {
    const interaction = buildEditInteraction({
      titleValue: 'Refreshed Title',
    });

    await handleRankEditModalSubmit(interaction as never);

    expect(interaction.client.rest.patch).toHaveBeenCalled();
  });

  it('updates with mentions (@everyone + roles)', async () => {
    const interaction = buildEditInteraction({
      settingsValues: [Setting.ShowLive, Setting.MentionEveryone],
      mentionValues: ['role123', 'role456'],
    });

    await handleRankEditModalSubmit(interaction as never);

    expect(interaction.reply).toHaveBeenCalledWith(
      expect.objectContaining({ content: 'Ranking updated!' }),
    );

    const updated = await getRank('testrank');
    const mentions = JSON.parse(updated!.mentions);
    expect(mentions).toContain('everyone');
    expect(mentions).toContain('role123');
    expect(mentions).toContain('role456');
  });
});
