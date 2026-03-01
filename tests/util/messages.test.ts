import { describe, it, expect, vi } from 'vitest';
import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { editChannelMessage } from '../../src/util/messages.js';

function createMockInteraction() {
  return {
    client: {
      rest: { patch: vi.fn() },
    },
    isRepliable: () => true,
    replied: false,
    deferred: false,
    reply: vi.fn(),
    followUp: vi.fn(),
  };
}

describe('editChannelMessage', () => {
  it('returns early without calling patch when messageId is null', async () => {
    const interaction = createMockInteraction();
    await editChannelMessage(interaction as never, 'chan1', null, { content: 'test' });
    expect(interaction.client.rest.patch).not.toHaveBeenCalled();
  });

  it('calls rest.patch with serialized payload', async () => {
    const interaction = createMockInteraction();
    await editChannelMessage(interaction as never, 'chan1', 'msg1', {
      content: 'Hello',
    });
    expect(interaction.client.rest.patch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ body: expect.objectContaining({ content: 'Hello' }) }),
    );
  });

  it('converts EmbedBuilder to JSON via .toJSON()', async () => {
    const interaction = createMockInteraction();
    const embed = new EmbedBuilder().setDescription('Test').setColor(0x5865f2);
    await editChannelMessage(interaction as never, 'chan1', 'msg1', {
      embeds: [embed],
    });
    const body = interaction.client.rest.patch.mock.calls[0][1].body;
    expect(body.embeds).toEqual([embed.toJSON()]);
  });

  it('converts ActionRowBuilder to JSON', async () => {
    const interaction = createMockInteraction();
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('test').setLabel('Test').setStyle(ButtonStyle.Primary),
    );
    await editChannelMessage(interaction as never, 'chan1', 'msg1', {
      components: [row as never],
    });
    const body = interaction.client.rest.patch.mock.calls[0][1].body;
    expect(body.components).toEqual([row.toJSON()]);
  });

  it('converts allowedMentions to snake_case', async () => {
    const interaction = createMockInteraction();
    await editChannelMessage(interaction as never, 'chan1', 'msg1', {
      content: 'test',
      allowedMentions: { roles: ['role1'], parse: ['everyone'] },
    });
    const body = interaction.client.rest.patch.mock.calls[0][1].body;
    expect(body.allowed_mentions).toEqual({ roles: ['role1'], parse: ['everyone'] });
  });

  it('handles empty components array', async () => {
    const interaction = createMockInteraction();
    await editChannelMessage(interaction as never, 'chan1', 'msg1', {
      components: [],
    });
    const body = interaction.client.rest.patch.mock.calls[0][1].body;
    expect(body.components).toEqual([]);
  });

  it('handles DiscordAPIError gracefully', async () => {
    const interaction = createMockInteraction();
    const { DiscordAPIError } = await import('discord.js');
    const error = new DiscordAPIError(
      { code: 50001, message: 'Missing Access' },
      50001,
      200,
      'PATCH',
      'https://discord.com/api',
      {} as never,
    );
    interaction.client.rest.patch.mockRejectedValue(error);
    // Should not throw
    await editChannelMessage(interaction as never, 'chan1', 'msg1', { content: 'test' });
    // Should have sent an error reply
    expect(interaction.reply).toHaveBeenCalled();
  });

  it('logs non-DiscordAPIError errors to console', async () => {
    const interaction = createMockInteraction();
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    interaction.client.rest.patch.mockRejectedValue(new Error('Network failure'));
    await editChannelMessage(interaction as never, 'chan1', 'msg1', { content: 'test' });
    expect(consoleSpy).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });
});
