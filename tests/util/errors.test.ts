import { describe, it, expect, vi } from 'vitest';
import { DiscordAPIError } from 'discord.js';
import { safeErrorReply, enrichDiscordAPIErrorMessage } from '../../src/util/errors.js';

function createMockInteraction(overrides: Record<string, unknown> = {}) {
  return {
    isRepliable: () => true,
    replied: false,
    deferred: false,
    reply: vi.fn(),
    followUp: vi.fn(),
    ...overrides,
  };
}

describe('safeErrorReply', () => {
  it('calls reply with ephemeral flag when interaction not yet replied', async () => {
    const interaction = createMockInteraction();
    await safeErrorReply(interaction as never, 'Test error');
    expect(interaction.reply).toHaveBeenCalledWith({ content: 'Test error', flags: 64 });
  });

  it('calls followUp when interaction already replied', async () => {
    const interaction = createMockInteraction({ replied: true });
    await safeErrorReply(interaction as never, 'Test error');
    expect(interaction.followUp).toHaveBeenCalledWith({ content: 'Test error', flags: 64 });
    expect(interaction.reply).not.toHaveBeenCalled();
  });

  it('calls followUp when interaction is deferred', async () => {
    const interaction = createMockInteraction({ deferred: true });
    await safeErrorReply(interaction as never, 'Test error');
    expect(interaction.followUp).toHaveBeenCalled();
  });

  it('uses default message when none provided', async () => {
    const interaction = createMockInteraction();
    await safeErrorReply(interaction as never);
    expect(interaction.reply).toHaveBeenCalledWith({
      content: 'Something went wrong.',
      flags: 64,
    });
  });

  it('does nothing when interaction is not repliable', async () => {
    const interaction = createMockInteraction({ isRepliable: () => false });
    await safeErrorReply(interaction as never, 'Test');
    expect(interaction.reply).not.toHaveBeenCalled();
    expect(interaction.followUp).not.toHaveBeenCalled();
  });
});

describe('enrichDiscordAPIErrorMessage', () => {
  function makeError(code: number, message: string): DiscordAPIError {
    return { code, message } as DiscordAPIError;
  }

  it('formats error with code and message', () => {
    const result = enrichDiscordAPIErrorMessage(makeError(12345, 'Something failed'));
    expect(result).toContain('**Error 12345:**');
    expect(result).toContain('Something failed');
  });

  it('prepends header when provided', () => {
    const result = enrichDiscordAPIErrorMessage(makeError(12345, 'msg'), 'Header Text');
    expect(result).toContain('**Header Text**');
  });

  it('adds channel permission hint for error code 50001', () => {
    const result = enrichDiscordAPIErrorMessage(makeError(50001, 'Missing Access'));
    expect(result).toContain('View Channel');
    expect(result).toContain('private channel');
  });

  it('adds message unavailable hint for error code 10008', () => {
    const result = enrichDiscordAPIErrorMessage(makeError(10008, 'Unknown Message'));
    expect(result).toContain('no longer available');
  });

  it('returns base message for unknown error codes', () => {
    const result = enrichDiscordAPIErrorMessage(makeError(99999, 'Unknown'));
    expect(result).toContain('**Error 99999:**');
    expect(result).toContain('Unknown');
  });
});
