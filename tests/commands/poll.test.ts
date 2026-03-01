import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest';
import type { Knex as KnexType } from 'knex';
import { cleanAllTables } from '../helpers/db-setup.js';
import {
  createMockCommandInteraction,
  createMockModalSubmitInteraction,
  labelWrapped,
  roleSelectWrapped,
} from '../helpers/discord-mocks.js';
import { PollMode, Setting, EVERYONE_SENTINEL } from '../../src/util/constants.js';
import {
  POLL_MODAL_ID,
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

const { execute, handlePollModalSubmit } = await import('../../src/commands/poll.js');
const { getPoll, getPollOptions } = await import('../../src/db/polls.js');

afterAll(async () => {
  await testDb.destroy();
});

// ---------------------------------------------------------------------------
// execute
// ---------------------------------------------------------------------------

describe('poll command — execute', () => {
  it('calls showModal with the poll creation modal', async () => {
    const interaction = createMockCommandInteraction();

    await execute(interaction as never);

    expect(interaction.showModal).toHaveBeenCalledOnce();
    expect(interaction.showModal).toHaveBeenCalledWith(
      expect.objectContaining({ custom_id: POLL_MODAL_ID }),
    );
  });
});

// ---------------------------------------------------------------------------
// handlePollModalSubmit
// ---------------------------------------------------------------------------

describe('poll command — handlePollModalSubmit', () => {
  beforeEach(async () => {
    await cleanAllTables(testDb);
  });

  // ---- Test 2: creates single-choice poll with 2 options ----
  it('creates a single-choice poll with 2 options, replies with embeds+components, fetches reply, and sets message_id', async () => {
    const interaction = createMockModalSubmitInteraction({
      customId: POLL_MODAL_ID,
      user: { id: 'creator1' },
      guildId: 'guild1',
      channelId: 'chan1',
      fields: {
        getTextInputValue: vi.fn((id: string) => {
          if (id === MODAL_POLL_TITLE) return 'Favorite Color';
          if (id === MODAL_POLL_OPTIONS) return 'Red\nBlue';
          return '';
        }),
      },
      components: [
        labelWrapped(MODAL_POLL_MODE, [PollMode.Single]),
        labelWrapped(MODAL_POLL_SETTINGS, [Setting.ShowLive]),
        roleSelectWrapped(MODAL_POLL_MENTIONS, []),
      ],
    });

    await handlePollModalSubmit(interaction as never);

    // Reply should have been called with embeds and components
    expect(interaction.reply).toHaveBeenCalledOnce();
    const replyCall = interaction.reply.mock.calls[0][0] as Record<string, unknown>;
    expect(replyCall.embeds).toBeDefined();
    expect(replyCall.components).toBeDefined();

    // fetchReply should be called to get the message ID
    expect(interaction.fetchReply).toHaveBeenCalledOnce();

    // DB should contain exactly one poll
    const polls = await testDb('polls').select('*');
    expect(polls).toHaveLength(1);
    expect(polls[0].title).toBe('Favorite Color');
    expect(polls[0].mode).toBe(PollMode.Single);
    expect(polls[0].creator_id).toBe('creator1');
    expect(polls[0].guild_id).toBe('guild1');
    expect(polls[0].channel_id).toBe('chan1');
    expect(polls[0].closed).toBe(0);

    // DB should contain 2 options
    const options = await testDb('poll_options').select('*').orderBy('idx');
    expect(options).toHaveLength(2);
    expect(options[0].label).toBe('Red');
    expect(options[1].label).toBe('Blue');

    // message_id should be set from fetchReply
    const pollId = polls[0].id;
    const poll = await getPoll(pollId);
    expect(poll!.message_id).toBe('msg123');
  });

  // ---- Test 3: creates multi-choice poll ----
  it('creates a multi-choice poll with mode=multi in DB', async () => {
    const interaction = createMockModalSubmitInteraction({
      customId: POLL_MODAL_ID,
      user: { id: 'creator2' },
      guildId: 'guild1',
      channelId: 'chan1',
      fields: {
        getTextInputValue: vi.fn((id: string) => {
          if (id === MODAL_POLL_TITLE) return 'Multi Poll';
          if (id === MODAL_POLL_OPTIONS) return 'Alpha\nBeta\nGamma';
          return '';
        }),
      },
      components: [
        labelWrapped(MODAL_POLL_MODE, [PollMode.Multi]),
        labelWrapped(MODAL_POLL_SETTINGS, [Setting.ShowLive]),
        roleSelectWrapped(MODAL_POLL_MENTIONS, []),
      ],
    });

    await handlePollModalSubmit(interaction as never);

    const polls = await testDb('polls').select('*');
    expect(polls).toHaveLength(1);
    expect(polls[0].mode).toBe(PollMode.Multi);
    expect(polls[0].title).toBe('Multi Poll');

    const options = await testDb('poll_options').select('*').orderBy('idx');
    expect(options).toHaveLength(3);
    expect(options.map((o: { label: string }) => o.label)).toEqual(['Alpha', 'Beta', 'Gamma']);
  });

  // ---- Test 4: creates poll with anonymous + no show_live ----
  it('creates a poll with anonymous=1 and show_live=0 when settings include anonymous but not show_live', async () => {
    const interaction = createMockModalSubmitInteraction({
      customId: POLL_MODAL_ID,
      user: { id: 'creator3' },
      guildId: 'guild1',
      channelId: 'chan1',
      fields: {
        getTextInputValue: vi.fn((id: string) => {
          if (id === MODAL_POLL_TITLE) return 'Secret Poll';
          if (id === MODAL_POLL_OPTIONS) return 'Yes\nNo';
          return '';
        }),
      },
      components: [
        labelWrapped(MODAL_POLL_MODE, [PollMode.Single]),
        labelWrapped(MODAL_POLL_SETTINGS, [Setting.Anonymous]),
        roleSelectWrapped(MODAL_POLL_MENTIONS, []),
      ],
    });

    await handlePollModalSubmit(interaction as never);

    const polls = await testDb('polls').select('*');
    expect(polls).toHaveLength(1);
    expect(polls[0].anonymous).toBe(1);
    expect(polls[0].show_live).toBe(0);
  });

  // ---- Test 5: creates poll with vote targets ----
  it('creates a poll with vote targets stored in poll_options', async () => {
    const interaction = createMockModalSubmitInteraction({
      customId: POLL_MODAL_ID,
      user: { id: 'creator4' },
      guildId: 'guild1',
      channelId: 'chan1',
      fields: {
        getTextInputValue: vi.fn((id: string) => {
          if (id === MODAL_POLL_TITLE) return 'Target Poll';
          if (id === MODAL_POLL_OPTIONS) return 'Valorant /5\nCS2 /3\nOverwatch';
          return '';
        }),
      },
      components: [
        labelWrapped(MODAL_POLL_MODE, [PollMode.Single]),
        labelWrapped(MODAL_POLL_SETTINGS, [Setting.ShowLive]),
        roleSelectWrapped(MODAL_POLL_MENTIONS, []),
      ],
    });

    await handlePollModalSubmit(interaction as never);

    const polls = await testDb('polls').select('*');
    expect(polls).toHaveLength(1);

    const options = await testDb('poll_options').select('*').orderBy('idx');
    expect(options).toHaveLength(3);
    expect(options[0].label).toBe('Valorant');
    expect(options[0].target).toBe(5);
    expect(options[1].label).toBe('CS2');
    expect(options[1].target).toBe(3);
    expect(options[2].label).toBe('Overwatch');
    expect(options[2].target).toBeNull();
  });

  // ---- Test 6: creates poll with @everyone mention ----
  it('creates a poll with @everyone mention using the EVERYONE_SENTINEL in mentions JSON', async () => {
    const interaction = createMockModalSubmitInteraction({
      customId: POLL_MODAL_ID,
      user: { id: 'creator5' },
      guildId: 'guild1',
      channelId: 'chan1',
      fields: {
        getTextInputValue: vi.fn((id: string) => {
          if (id === MODAL_POLL_TITLE) return 'Everyone Poll';
          if (id === MODAL_POLL_OPTIONS) return 'A\nB';
          return '';
        }),
      },
      components: [
        labelWrapped(MODAL_POLL_MODE, [PollMode.Single]),
        labelWrapped(MODAL_POLL_SETTINGS, [Setting.ShowLive, Setting.MentionEveryone]),
        roleSelectWrapped(MODAL_POLL_MENTIONS, []),
      ],
    });

    await handlePollModalSubmit(interaction as never);

    const polls = await testDb('polls').select('*');
    expect(polls).toHaveLength(1);

    const mentions = JSON.parse(polls[0].mentions) as string[];
    expect(mentions).toContain(EVERYONE_SENTINEL);
    // EVERYONE_SENTINEL should be first (unshift)
    expect(mentions[0]).toBe(EVERYONE_SENTINEL);
  });

  // ---- Test 7: creates poll with role mentions ----
  it('creates a poll with role mentions stored in mentions JSON', async () => {
    const roleId1 = '111222333444';
    const roleId2 = '555666777888';

    const interaction = createMockModalSubmitInteraction({
      customId: POLL_MODAL_ID,
      user: { id: 'creator6' },
      guildId: 'guild1',
      channelId: 'chan1',
      fields: {
        getTextInputValue: vi.fn((id: string) => {
          if (id === MODAL_POLL_TITLE) return 'Role Poll';
          if (id === MODAL_POLL_OPTIONS) return 'Option 1\nOption 2';
          return '';
        }),
      },
      components: [
        labelWrapped(MODAL_POLL_MODE, [PollMode.Single]),
        labelWrapped(MODAL_POLL_SETTINGS, [Setting.ShowLive]),
        roleSelectWrapped(MODAL_POLL_MENTIONS, [roleId1, roleId2]),
      ],
    });

    await handlePollModalSubmit(interaction as never);

    const polls = await testDb('polls').select('*');
    expect(polls).toHaveLength(1);

    const mentions = JSON.parse(polls[0].mentions) as string[];
    expect(mentions).toHaveLength(2);
    expect(mentions).toContain(roleId1);
    expect(mentions).toContain(roleId2);
  });

  // ---- Test 8: validation error (duplicate options) ----
  it('replies with ephemeral error and creates no poll when options contain duplicates', async () => {
    const interaction = createMockModalSubmitInteraction({
      customId: POLL_MODAL_ID,
      user: { id: 'creator7' },
      guildId: 'guild1',
      channelId: 'chan1',
      fields: {
        getTextInputValue: vi.fn((id: string) => {
          if (id === MODAL_POLL_TITLE) return 'Dup Poll';
          if (id === MODAL_POLL_OPTIONS) return 'Same\nSame';
          return '';
        }),
      },
      components: [
        labelWrapped(MODAL_POLL_MODE, [PollMode.Single]),
        labelWrapped(MODAL_POLL_SETTINGS, [Setting.ShowLive]),
        roleSelectWrapped(MODAL_POLL_MENTIONS, []),
      ],
    });

    await handlePollModalSubmit(interaction as never);

    // Should reply with an ephemeral error message about duplicates
    expect(interaction.reply).toHaveBeenCalledOnce();
    const replyCall = interaction.reply.mock.calls[0][0] as Record<string, unknown>;
    expect(replyCall.content).toEqual(expect.stringContaining('Duplicate'));
    expect(replyCall.flags).toBeDefined();

    // Should NOT have an embed (error path, not poll creation)
    expect(replyCall.embeds).toBeUndefined();

    // fetchReply should NOT be called (early return)
    expect(interaction.fetchReply).not.toHaveBeenCalled();

    // No poll should exist in DB
    const polls = await testDb('polls').select('*');
    expect(polls).toHaveLength(0);

    // No options should exist in DB
    const options = await testDb('poll_options').select('*');
    expect(options).toHaveLength(0);
  });

  // ---- Test 9: empty settings → show_live defaults to true ----
  it('defaults show_live to true when settings checkbox group is empty', async () => {
    const interaction = createMockModalSubmitInteraction({
      customId: POLL_MODAL_ID,
      user: { id: 'creator8' },
      guildId: 'guild1',
      channelId: 'chan1',
      fields: {
        getTextInputValue: vi.fn((id: string) => {
          if (id === MODAL_POLL_TITLE) return 'Default Live Poll';
          if (id === MODAL_POLL_OPTIONS) return 'X\nY';
          return '';
        }),
      },
      components: [
        labelWrapped(MODAL_POLL_MODE, [PollMode.Single]),
        // Empty settings — no checkboxes selected
        labelWrapped(MODAL_POLL_SETTINGS, []),
        roleSelectWrapped(MODAL_POLL_MENTIONS, []),
      ],
    });

    await handlePollModalSubmit(interaction as never);

    const polls = await testDb('polls').select('*');
    expect(polls).toHaveLength(1);
    // When settingsValues.length === 0, show_live defaults to true
    expect(polls[0].show_live).toBe(1);
    // anonymous should be false since it was not selected
    expect(polls[0].anonymous).toBe(0);
  });

  // ---- Test 10: reply includes embeds array with at least one embed ----
  it('reply includes an embeds array with at least one embed object', async () => {
    const interaction = createMockModalSubmitInteraction({
      customId: POLL_MODAL_ID,
      user: { id: 'creator9' },
      guildId: 'guild1',
      channelId: 'chan1',
      fields: {
        getTextInputValue: vi.fn((id: string) => {
          if (id === MODAL_POLL_TITLE) return 'Embed Check Poll';
          if (id === MODAL_POLL_OPTIONS) return 'Foo\nBar\nBaz';
          return '';
        }),
      },
      components: [
        labelWrapped(MODAL_POLL_MODE, [PollMode.Multi]),
        labelWrapped(MODAL_POLL_SETTINGS, [Setting.ShowLive]),
        roleSelectWrapped(MODAL_POLL_MENTIONS, []),
      ],
    });

    await handlePollModalSubmit(interaction as never);

    expect(interaction.reply).toHaveBeenCalledOnce();
    const replyCall = interaction.reply.mock.calls[0][0] as Record<string, unknown>;

    // embeds should be an array with at least one embed
    expect(Array.isArray(replyCall.embeds)).toBe(true);
    const embeds = replyCall.embeds as unknown[];
    expect(embeds.length).toBeGreaterThanOrEqual(1);

    // components should also be present
    expect(Array.isArray(replyCall.components)).toBe(true);
    const components = replyCall.components as unknown[];
    expect(components.length).toBeGreaterThanOrEqual(1);
  });
});
