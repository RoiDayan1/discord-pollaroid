import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest';
import type { Knex as KnexType } from 'knex';
import { cleanAllTables } from '../helpers/db-setup.js';
import {
  createMockCommandInteraction,
  createMockModalSubmitInteraction,
  labelWrapped,
  roleSelectWrapped,
} from '../helpers/discord-mocks.js';
import { RankMode, Setting, EVERYONE_SENTINEL } from '../../src/util/constants.js';
import {
  RANK_MODAL_ID,
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

const { execute, handleRankModalSubmit } = await import('../../src/commands/rank.js');
const { getRank, getRankOptions } = await import('../../src/db/ranks.js');

afterAll(async () => {
  await testDb.destroy();
});

// ---------------------------------------------------------------------------
// execute
// ---------------------------------------------------------------------------

describe('rank command — execute', () => {
  it('calls showModal with the rank creation modal', async () => {
    const interaction = createMockCommandInteraction();

    await execute(interaction as never);

    expect(interaction.showModal).toHaveBeenCalledOnce();
    expect(interaction.showModal).toHaveBeenCalledWith(
      expect.objectContaining({ custom_id: RANK_MODAL_ID }),
    );
  });
});

// ---------------------------------------------------------------------------
// handleRankModalSubmit
// ---------------------------------------------------------------------------

describe('rank command — handleRankModalSubmit', () => {
  beforeEach(async () => {
    await cleanAllTables(testDb);
  });

  // ---- Test 2: creates star-mode rank with options ----
  it('creates a star-mode rank with options in DB, replies with embeds+components', async () => {
    const interaction = createMockModalSubmitInteraction({
      customId: RANK_MODAL_ID,
      user: { id: 'creator1' },
      guildId: 'guild1',
      channelId: 'chan1',
      fields: {
        getTextInputValue: vi.fn((id: string) => {
          if (id === MODAL_RANK_TITLE) return 'Best Language';
          if (id === MODAL_RANK_OPTIONS) return 'TypeScript\nRust\nGo';
          return '';
        }),
      },
      components: [
        labelWrapped(MODAL_RANK_MODE, [RankMode.Star]),
        labelWrapped(MODAL_RANK_SETTINGS, [Setting.ShowLive]),
        roleSelectWrapped(MODAL_RANK_MENTIONS, []),
      ],
    });

    await handleRankModalSubmit(interaction as never);

    // Reply should have been called with embeds and components
    expect(interaction.reply).toHaveBeenCalledOnce();
    const replyCall = interaction.reply.mock.calls[0][0] as Record<string, unknown>;
    expect(replyCall.embeds).toBeDefined();
    expect(replyCall.components).toBeDefined();

    // fetchReply should be called to get the message ID
    expect(interaction.fetchReply).toHaveBeenCalledOnce();

    // DB should contain exactly one rank
    const ranks = await testDb('ranks').select('*');
    expect(ranks).toHaveLength(1);
    expect(ranks[0].title).toBe('Best Language');
    expect(ranks[0].mode).toBe(RankMode.Star);
    expect(ranks[0].creator_id).toBe('creator1');
    expect(ranks[0].guild_id).toBe('guild1');
    expect(ranks[0].channel_id).toBe('chan1');
    expect(ranks[0].closed).toBe(0);

    // DB should contain 3 options
    const options = await testDb('rank_options').select('*').orderBy('idx');
    expect(options).toHaveLength(3);
    expect(options[0].label).toBe('TypeScript');
    expect(options[1].label).toBe('Rust');
    expect(options[2].label).toBe('Go');

    // message_id should be set from fetchReply
    const rankId = ranks[0].id;
    const rank = await getRank(rankId);
    expect(rank!.message_id).toBe('msg123');
  });

  // ---- Test 3: creates order-mode rank ----
  it('creates an order-mode rank with mode=order in DB', async () => {
    const interaction = createMockModalSubmitInteraction({
      customId: RANK_MODAL_ID,
      user: { id: 'creator2' },
      guildId: 'guild1',
      channelId: 'chan1',
      fields: {
        getTextInputValue: vi.fn((id: string) => {
          if (id === MODAL_RANK_TITLE) return 'Order Rank';
          if (id === MODAL_RANK_OPTIONS) return 'First\nSecond\nThird';
          return '';
        }),
      },
      components: [
        labelWrapped(MODAL_RANK_MODE, [RankMode.Order]),
        labelWrapped(MODAL_RANK_SETTINGS, [Setting.ShowLive]),
        roleSelectWrapped(MODAL_RANK_MENTIONS, []),
      ],
    });

    await handleRankModalSubmit(interaction as never);

    const ranks = await testDb('ranks').select('*');
    expect(ranks).toHaveLength(1);
    expect(ranks[0].mode).toBe(RankMode.Order);
    expect(ranks[0].title).toBe('Order Rank');

    const options = await testDb('rank_options').select('*').orderBy('idx');
    expect(options).toHaveLength(3);
    expect(options.map((o: { label: string }) => o.label)).toEqual(['First', 'Second', 'Third']);
  });

  // ---- Test 4: creates rank with anonymous + show_live settings ----
  it('creates a rank with anonymous=1 and show_live=1 when both settings are selected', async () => {
    const interaction = createMockModalSubmitInteraction({
      customId: RANK_MODAL_ID,
      user: { id: 'creator3' },
      guildId: 'guild1',
      channelId: 'chan1',
      fields: {
        getTextInputValue: vi.fn((id: string) => {
          if (id === MODAL_RANK_TITLE) return 'Anon Live Rank';
          if (id === MODAL_RANK_OPTIONS) return 'A\nB';
          return '';
        }),
      },
      components: [
        labelWrapped(MODAL_RANK_MODE, [RankMode.Star]),
        labelWrapped(MODAL_RANK_SETTINGS, [Setting.Anonymous, Setting.ShowLive]),
        roleSelectWrapped(MODAL_RANK_MENTIONS, []),
      ],
    });

    await handleRankModalSubmit(interaction as never);

    const ranks = await testDb('ranks').select('*');
    expect(ranks).toHaveLength(1);
    expect(ranks[0].anonymous).toBe(1);
    expect(ranks[0].show_live).toBe(1);
  });

  // ---- Test 5: creates rank with @everyone mention ----
  it('creates a rank with @everyone mention using the EVERYONE_SENTINEL in mentions JSON', async () => {
    const interaction = createMockModalSubmitInteraction({
      customId: RANK_MODAL_ID,
      user: { id: 'creator4' },
      guildId: 'guild1',
      channelId: 'chan1',
      fields: {
        getTextInputValue: vi.fn((id: string) => {
          if (id === MODAL_RANK_TITLE) return 'Everyone Rank';
          if (id === MODAL_RANK_OPTIONS) return 'X\nY';
          return '';
        }),
      },
      components: [
        labelWrapped(MODAL_RANK_MODE, [RankMode.Star]),
        labelWrapped(MODAL_RANK_SETTINGS, [Setting.ShowLive, Setting.MentionEveryone]),
        roleSelectWrapped(MODAL_RANK_MENTIONS, []),
      ],
    });

    await handleRankModalSubmit(interaction as never);

    const ranks = await testDb('ranks').select('*');
    expect(ranks).toHaveLength(1);

    const mentions = JSON.parse(ranks[0].mentions) as string[];
    expect(mentions).toContain(EVERYONE_SENTINEL);
    // EVERYONE_SENTINEL should be first (unshift)
    expect(mentions[0]).toBe(EVERYONE_SENTINEL);
  });

  // ---- Test 6: creates rank with role mentions ----
  it('creates a rank with role mentions stored in mentions JSON', async () => {
    const roleId1 = '999888777666';
    const roleId2 = '555444333222';

    const interaction = createMockModalSubmitInteraction({
      customId: RANK_MODAL_ID,
      user: { id: 'creator5' },
      guildId: 'guild1',
      channelId: 'chan1',
      fields: {
        getTextInputValue: vi.fn((id: string) => {
          if (id === MODAL_RANK_TITLE) return 'Role Rank';
          if (id === MODAL_RANK_OPTIONS) return 'Opt A\nOpt B';
          return '';
        }),
      },
      components: [
        labelWrapped(MODAL_RANK_MODE, [RankMode.Star]),
        labelWrapped(MODAL_RANK_SETTINGS, [Setting.ShowLive]),
        roleSelectWrapped(MODAL_RANK_MENTIONS, [roleId1, roleId2]),
      ],
    });

    await handleRankModalSubmit(interaction as never);

    const ranks = await testDb('ranks').select('*');
    expect(ranks).toHaveLength(1);

    const mentions = JSON.parse(ranks[0].mentions) as string[];
    expect(mentions).toHaveLength(2);
    expect(mentions).toContain(roleId1);
    expect(mentions).toContain(roleId2);
  });

  // ---- Test 7: validation error (order mode with 1 option) ----
  it('replies with ephemeral error and creates no rank when order mode has only 1 option', async () => {
    const interaction = createMockModalSubmitInteraction({
      customId: RANK_MODAL_ID,
      user: { id: 'creator6' },
      guildId: 'guild1',
      channelId: 'chan1',
      fields: {
        getTextInputValue: vi.fn((id: string) => {
          if (id === MODAL_RANK_TITLE) return 'Bad Order Rank';
          if (id === MODAL_RANK_OPTIONS) return 'OnlyOne';
          return '';
        }),
      },
      components: [
        labelWrapped(MODAL_RANK_MODE, [RankMode.Order]),
        labelWrapped(MODAL_RANK_SETTINGS, [Setting.ShowLive]),
        roleSelectWrapped(MODAL_RANK_MENTIONS, []),
      ],
    });

    await handleRankModalSubmit(interaction as never);

    // Should reply with an ephemeral error about minimum options
    expect(interaction.reply).toHaveBeenCalledOnce();
    const replyCall = interaction.reply.mock.calls[0][0] as Record<string, unknown>;
    expect(replyCall.content).toEqual(expect.stringContaining('at least 2'));
    expect(replyCall.flags).toBeDefined();

    // Should NOT have embeds (error path)
    expect(replyCall.embeds).toBeUndefined();

    // fetchReply should NOT be called (early return)
    expect(interaction.fetchReply).not.toHaveBeenCalled();

    // No rank should exist in DB
    const ranks = await testDb('ranks').select('*');
    expect(ranks).toHaveLength(0);

    // No options should exist in DB
    const options = await testDb('rank_options').select('*');
    expect(options).toHaveLength(0);
  });

  // ---- Test 8: empty settings → show_live defaults to true ----
  it('defaults show_live to true when settings checkbox group is empty', async () => {
    const interaction = createMockModalSubmitInteraction({
      customId: RANK_MODAL_ID,
      user: { id: 'creator7' },
      guildId: 'guild1',
      channelId: 'chan1',
      fields: {
        getTextInputValue: vi.fn((id: string) => {
          if (id === MODAL_RANK_TITLE) return 'Default Live Rank';
          if (id === MODAL_RANK_OPTIONS) return 'P\nQ';
          return '';
        }),
      },
      components: [
        labelWrapped(MODAL_RANK_MODE, [RankMode.Star]),
        // Empty settings — no checkboxes selected
        labelWrapped(MODAL_RANK_SETTINGS, []),
        roleSelectWrapped(MODAL_RANK_MENTIONS, []),
      ],
    });

    await handleRankModalSubmit(interaction as never);

    const ranks = await testDb('ranks').select('*');
    expect(ranks).toHaveLength(1);
    // When settingsValues.length === 0, show_live defaults to true
    expect(ranks[0].show_live).toBe(1);
    // anonymous should be false since it was not selected
    expect(ranks[0].anonymous).toBe(0);
  });

  // ---- Test 9: star mode uses Rate button, order mode uses Submit Your Ranking button ----
  it('star mode reply includes Rate button component', async () => {
    const interaction = createMockModalSubmitInteraction({
      customId: RANK_MODAL_ID,
      user: { id: 'creator8' },
      guildId: 'guild1',
      channelId: 'chan1',
      fields: {
        getTextInputValue: vi.fn((id: string) => {
          if (id === MODAL_RANK_TITLE) return 'Star Rank';
          if (id === MODAL_RANK_OPTIONS) return 'Alpha\nBeta';
          return '';
        }),
      },
      components: [
        labelWrapped(MODAL_RANK_MODE, [RankMode.Star]),
        labelWrapped(MODAL_RANK_SETTINGS, [Setting.ShowLive]),
        roleSelectWrapped(MODAL_RANK_MENTIONS, []),
      ],
    });

    await handleRankModalSubmit(interaction as never);

    expect(interaction.reply).toHaveBeenCalledOnce();
    const replyCall = interaction.reply.mock.calls[0][0] as Record<string, unknown>;
    const components = replyCall.components as { components: { data: { label?: string } }[] }[];

    // Star mode should use a "Rate" button
    const buttonLabels = components
      .flatMap((row) => row.components)
      .map((c) => c.data?.label)
      .filter(Boolean);
    expect(buttonLabels).toContain('Rate');
    expect(buttonLabels).not.toContain('Submit Your Ranking');
  });

  it('order mode reply includes Submit Your Ranking button component', async () => {
    const interaction = createMockModalSubmitInteraction({
      customId: RANK_MODAL_ID,
      user: { id: 'creator9' },
      guildId: 'guild1',
      channelId: 'chan1',
      fields: {
        getTextInputValue: vi.fn((id: string) => {
          if (id === MODAL_RANK_TITLE) return 'Order Rank Buttons';
          if (id === MODAL_RANK_OPTIONS) return 'First\nSecond';
          return '';
        }),
      },
      components: [
        labelWrapped(MODAL_RANK_MODE, [RankMode.Order]),
        labelWrapped(MODAL_RANK_SETTINGS, [Setting.ShowLive]),
        roleSelectWrapped(MODAL_RANK_MENTIONS, []),
      ],
    });

    await handleRankModalSubmit(interaction as never);

    expect(interaction.reply).toHaveBeenCalledOnce();
    const replyCall = interaction.reply.mock.calls[0][0] as Record<string, unknown>;
    const components = replyCall.components as { components: { data: { label?: string } }[] }[];

    // Order mode should use "Submit Your Ranking" button
    const buttonLabels = components
      .flatMap((row) => row.components)
      .map((c) => c.data?.label)
      .filter(Boolean);
    expect(buttonLabels).toContain('Submit Your Ranking');
    expect(buttonLabels).not.toContain('Rate');
  });

  // ---- Test 10: fetchReply called, message_id set in DB ----
  it('calls fetchReply and sets message_id in the database', async () => {
    const interaction = createMockModalSubmitInteraction({
      customId: RANK_MODAL_ID,
      user: { id: 'creator10' },
      guildId: 'guild1',
      channelId: 'chan1',
      fields: {
        getTextInputValue: vi.fn((id: string) => {
          if (id === MODAL_RANK_TITLE) return 'Message ID Rank';
          if (id === MODAL_RANK_OPTIONS) return 'Opt1\nOpt2';
          return '';
        }),
      },
      components: [
        labelWrapped(MODAL_RANK_MODE, [RankMode.Star]),
        labelWrapped(MODAL_RANK_SETTINGS, [Setting.ShowLive]),
        roleSelectWrapped(MODAL_RANK_MENTIONS, []),
      ],
    });

    await handleRankModalSubmit(interaction as never);

    // fetchReply must have been called
    expect(interaction.fetchReply).toHaveBeenCalledOnce();

    // message_id should be set in DB from the mock fetchReply return value
    const ranks = await testDb('ranks').select('*');
    expect(ranks).toHaveLength(1);
    const rankId = ranks[0].id;
    const rank = await getRank(rankId);
    expect(rank!.message_id).toBe('msg123');
  });
});
