import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest';
import type { Knex as KnexType } from 'knex';
import { cleanAllTables } from '../helpers/db-setup.js';
import {
  createMockButtonInteraction,
  createMockModalSubmitInteraction,
  labelWrapped,
  roleSelectWrapped,
} from '../helpers/discord-mocks.js';
import { PollMode, Setting } from '../../src/util/constants.js';
import {
  pollEditOpenId,
  POLL_EDIT_MODAL_PREFIX,
  MODAL_POLL_TITLE,
  MODAL_POLL_OPTIONS,
  MODAL_POLL_MODE,
  MODAL_POLL_SETTINGS,
  MODAL_POLL_MENTIONS,
} from '../../src/util/ids.js';

let testDb: KnexType;

vi.mock('../../src/db/connection.js', async () => {
  const { setupTestDb } = await import('../helpers/db-setup.js');
  testDb = await setupTestDb();
  return { default: testDb, isPostgres: false, initDb: vi.fn() };
});

const { createPoll, getPoll, getPollOptions, getPollVotes, setPollMessageId, votePollSingle } =
  await import('../../src/db/polls.js');
const { handlePollEditButton, handlePollEditModalSubmit } = await import(
  '../../src/interactions/poll-edit.js'
);

afterAll(async () => {
  await testDb.destroy();
});

const basePoll = {
  id: 'editpoll',
  guild_id: 'guild1',
  channel_id: 'chan1',
  creator_id: 'creator1',
  title: 'Edit Test',
  mode: PollMode.Single,
  anonymous: 0,
  show_live: 1,
  mentions: '[]',
  closed: 0,
};

describe('handlePollEditButton', () => {
  beforeEach(async () => {
    await cleanAllTables(testDb);
    await createPoll(basePoll, [
      { label: 'Alpha', target: null },
      { label: 'Beta', target: 5 },
    ]);
    await setPollMessageId('editpoll', 'msg1');
  });

  it('returns early for invalid customId (no reply, no showModal)', async () => {
    const interaction = createMockButtonInteraction({
      customId: 'totally-invalid-id',
      user: { id: 'creator1' },
    });

    await handlePollEditButton(interaction as never);

    expect(interaction.reply).not.toHaveBeenCalled();
    expect(interaction.showModal).not.toHaveBeenCalled();
  });

  it('replies "closed" for closed polls', async () => {
    await testDb('polls').where('id', 'editpoll').update({ closed: 1 });

    const interaction = createMockButtonInteraction({
      customId: pollEditOpenId('editpoll'),
      user: { id: 'creator1' },
    });

    await handlePollEditButton(interaction as never);

    expect(interaction.reply).toHaveBeenCalledWith(
      expect.objectContaining({ content: expect.stringContaining('closed') }),
    );
    expect(interaction.showModal).not.toHaveBeenCalled();
  });

  it('replies "closed" for nonexistent polls', async () => {
    const interaction = createMockButtonInteraction({
      customId: pollEditOpenId('nopoll99'),
      user: { id: 'creator1' },
    });

    await handlePollEditButton(interaction as never);

    expect(interaction.reply).toHaveBeenCalledWith(
      expect.objectContaining({ content: expect.stringContaining('closed') }),
    );
    expect(interaction.showModal).not.toHaveBeenCalled();
  });

  it('rejects non-creator with "Only the poll creator can edit."', async () => {
    const interaction = createMockButtonInteraction({
      customId: pollEditOpenId('editpoll'),
      user: { id: 'other-user' },
    });

    await handlePollEditButton(interaction as never);

    expect(interaction.reply).toHaveBeenCalledWith(
      expect.objectContaining({ content: expect.stringContaining('Only the poll creator can edit') }),
    );
    expect(interaction.showModal).not.toHaveBeenCalled();
  });

  it('creator: calls showModal with pre-filled modal (title, customId pattern)', async () => {
    const interaction = createMockButtonInteraction({
      customId: pollEditOpenId('editpoll'),
      user: { id: 'creator1' },
    });

    await handlePollEditButton(interaction as never);

    expect(interaction.showModal).toHaveBeenCalledTimes(1);
    const modalPayload = interaction.showModal.mock.calls[0][0];
    expect(modalPayload.title).toBe('Edit Poll');
    expect(modalPayload.custom_id).toBe(`${POLL_EDIT_MODAL_PREFIX}editpoll`);
  });

  it('creator: modal pre-fills current options with targets in text format', async () => {
    const interaction = createMockButtonInteraction({
      customId: pollEditOpenId('editpoll'),
      user: { id: 'creator1' },
    });

    await handlePollEditButton(interaction as never);

    const modalPayload = interaction.showModal.mock.calls[0][0];
    const components = modalPayload.components;

    // First component: title TextInput
    const titleComponent = components[0].component;
    expect(titleComponent.value).toBe('Edit Test');

    // Second component: options TextInput with target syntax
    const optionsComponent = components[1].component;
    expect(optionsComponent.value).toBe('Alpha\nBeta /5');
  });
});

describe('handlePollEditModalSubmit', () => {
  beforeEach(async () => {
    await cleanAllTables(testDb);
    await createPoll(basePoll, [
      { label: 'Alpha', target: null },
      { label: 'Beta', target: null },
    ]);
    await setPollMessageId('editpoll', 'msg1');
  });

  function buildEditInteraction(overrides: Record<string, unknown> = {}) {
    const titleValue = (overrides.titleValue as string) ?? 'Edit Test';
    const optionsValue = (overrides.optionsValue as string) ?? 'Alpha\nBeta';
    const modeValues = (overrides.modeValues as string[]) ?? [PollMode.Single];
    const settingsValues = (overrides.settingsValues as string[]) ?? [Setting.ShowLive];
    const mentionValues = (overrides.mentionValues as string[]) ?? [];

    const fields = {
      getTextInputValue: vi.fn((id: string) => {
        if (id === MODAL_POLL_TITLE) return titleValue;
        if (id === MODAL_POLL_OPTIONS) return optionsValue;
        return '';
      }),
    };

    const components = [
      labelWrapped(MODAL_POLL_MODE, modeValues),
      labelWrapped(MODAL_POLL_SETTINGS, settingsValues),
      roleSelectWrapped(MODAL_POLL_MENTIONS, mentionValues),
    ];

    return createMockModalSubmitInteraction({
      customId: `${POLL_EDIT_MODAL_PREFIX}editpoll`,
      user: { id: 'creator1' },
      fields,
      components,
      ...overrides,
    });
  }

  it('replies "closed" for closed polls', async () => {
    await testDb('polls').where('id', 'editpoll').update({ closed: 1 });

    const interaction = buildEditInteraction();

    await handlePollEditModalSubmit(interaction as never);

    expect(interaction.reply).toHaveBeenCalledWith(
      expect.objectContaining({ content: expect.stringContaining('closed') }),
    );
  });

  it('rejects non-creator', async () => {
    const interaction = buildEditInteraction({
      user: { id: 'other-user' },
    });

    await handlePollEditModalSubmit(interaction as never);

    expect(interaction.reply).toHaveBeenCalledWith(
      expect.objectContaining({ content: expect.stringContaining('Only the poll creator can edit') }),
    );
  });

  it('replies with validation error for duplicate labels', async () => {
    const interaction = buildEditInteraction({
      optionsValue: 'Same\nSame',
    });

    await handlePollEditModalSubmit(interaction as never);

    expect(interaction.reply).toHaveBeenCalledWith(
      expect.objectContaining({ content: expect.stringContaining('Duplicate') }),
    );
  });

  it('updates poll title/mode/settings successfully, replies "Poll updated!"', async () => {
    const interaction = buildEditInteraction({
      titleValue: 'New Title',
      settingsValues: [Setting.Anonymous, Setting.ShowLive],
    });

    await handlePollEditModalSubmit(interaction as never);

    expect(interaction.reply).toHaveBeenCalledWith(
      expect.objectContaining({ content: 'Poll updated!' }),
    );

    const updated = await getPoll('editpoll');
    expect(updated!.title).toBe('New Title');
    expect(updated!.anonymous).toBe(1);
    expect(updated!.show_live).toBe(1);
  });

  it('changing options clears votes and mentions it in reply', async () => {
    // Cast some votes first
    await votePollSingle('editpoll', 'Alpha', 'voter1');
    await votePollSingle('editpoll', 'Beta', 'voter2');

    const interaction = buildEditInteraction({
      optionsValue: 'Alpha\nGamma',
    });

    await handlePollEditModalSubmit(interaction as never);

    expect(interaction.reply).toHaveBeenCalledWith(
      expect.objectContaining({
        content: expect.stringContaining('Some votes were cleared'),
      }),
    );

    // Beta votes should be gone, Alpha votes should remain
    const votes = await getPollVotes('editpoll');
    const labels = votes.map((v) => v.option_label);
    expect(labels).toContain('Alpha');
    expect(labels).not.toContain('Beta');
  });

  it('switching multi to single clears all votes', async () => {
    // Create a multi-mode poll with votes
    await cleanAllTables(testDb);
    await createPoll({ ...basePoll, mode: PollMode.Multi }, [
      { label: 'Alpha', target: null },
      { label: 'Beta', target: null },
    ]);
    await setPollMessageId('editpoll', 'msg1');
    await votePollSingle('editpoll', 'Alpha', 'voter1');
    await votePollSingle('editpoll', 'Beta', 'voter2');

    const interaction = buildEditInteraction({
      modeValues: [PollMode.Single],
    });

    await handlePollEditModalSubmit(interaction as never);

    expect(interaction.reply).toHaveBeenCalledWith(
      expect.objectContaining({
        content: expect.stringContaining('Some votes were cleared'),
      }),
    );

    const votes = await getPollVotes('editpoll');
    expect(votes).toHaveLength(0);
  });

  it('switching single to multi does NOT clear votes', async () => {
    await votePollSingle('editpoll', 'Alpha', 'voter1');

    const interaction = buildEditInteraction({
      modeValues: [PollMode.Multi],
    });

    await handlePollEditModalSubmit(interaction as never);

    expect(interaction.reply).toHaveBeenCalledWith(
      expect.objectContaining({ content: 'Poll updated!' }),
    );

    const votes = await getPollVotes('editpoll');
    expect(votes).toHaveLength(1);
    expect(votes[0].option_label).toBe('Alpha');
  });

  it('updating targets without changing labels preserves votes', async () => {
    await votePollSingle('editpoll', 'Alpha', 'voter1');
    await votePollSingle('editpoll', 'Beta', 'voter2');

    const interaction = buildEditInteraction({
      optionsValue: 'Alpha /10\nBeta /3',
    });

    await handlePollEditModalSubmit(interaction as never);

    expect(interaction.reply).toHaveBeenCalledWith(
      expect.objectContaining({ content: 'Poll updated!' }),
    );

    // Votes should be preserved
    const votes = await getPollVotes('editpoll');
    expect(votes).toHaveLength(2);

    // Targets should be updated
    const options = await getPollOptions('editpoll');
    const alphaOpt = options.find((o) => o.label === 'Alpha');
    const betaOpt = options.find((o) => o.label === 'Beta');
    expect(alphaOpt!.target).toBe(10);
    expect(betaOpt!.target).toBe(3);
  });

  it('refreshes the channel message via client.rest.patch', async () => {
    const interaction = buildEditInteraction({
      titleValue: 'Refreshed Title',
    });

    await handlePollEditModalSubmit(interaction as never);

    expect(interaction.client.rest.patch).toHaveBeenCalled();
  });

  it('updates with mentions (@everyone + roles)', async () => {
    const interaction = buildEditInteraction({
      settingsValues: [Setting.ShowLive, Setting.MentionEveryone],
      mentionValues: ['role123', 'role456'],
    });

    await handlePollEditModalSubmit(interaction as never);

    expect(interaction.reply).toHaveBeenCalledWith(
      expect.objectContaining({ content: 'Poll updated!' }),
    );

    const updated = await getPoll('editpoll');
    const mentions = JSON.parse(updated!.mentions);
    expect(mentions).toContain('everyone');
    expect(mentions).toContain('role123');
    expect(mentions).toContain('role456');
  });
});
