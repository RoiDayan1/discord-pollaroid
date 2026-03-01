import { vi } from 'vitest';

/**
 * Creates a mock ButtonInteraction with all methods discord.js handlers need.
 * Override any property via the `overrides` parameter.
 */
export function createMockButtonInteraction(overrides: Record<string, unknown> = {}) {
  return {
    customId: '',
    user: { id: 'user123' },
    reply: vi.fn(),
    deferUpdate: vi.fn(),
    update: vi.fn(),
    editReply: vi.fn(),
    followUp: vi.fn(),
    showModal: vi.fn(),
    isRepliable: () => true,
    replied: false,
    deferred: false,
    client: {
      rest: { patch: vi.fn() },
    },
    ...overrides,
  };
}

/**
 * Creates a mock ModalSubmitInteraction for modal submit handlers.
 */
export function createMockModalSubmitInteraction(overrides: Record<string, unknown> = {}) {
  return {
    customId: '',
    user: { id: 'user123' },
    guildId: 'guild123',
    channelId: 'channel123',
    fields: {
      getTextInputValue: vi.fn(),
    },
    components: [],
    reply: vi.fn(),
    deferUpdate: vi.fn(),
    editReply: vi.fn(),
    followUp: vi.fn(),
    fetchReply: vi.fn().mockResolvedValue({ id: 'msg123' }),
    isRepliable: () => true,
    replied: false,
    deferred: false,
    client: {
      rest: { patch: vi.fn() },
    },
    ...overrides,
  };
}

/**
 * Creates a mock StringSelectMenuInteraction for select menu handlers.
 */
export function createMockSelectMenuInteraction(overrides: Record<string, unknown> = {}) {
  return {
    customId: '',
    values: [] as string[],
    user: { id: 'user123' },
    reply: vi.fn(),
    update: vi.fn(),
    editReply: vi.fn(),
    followUp: vi.fn(),
    isRepliable: () => true,
    replied: false,
    deferred: false,
    client: {
      rest: { patch: vi.fn() },
    },
    ...overrides,
  };
}

/**
 * Creates a mock ChatInputCommandInteraction for slash command handlers.
 */
export function createMockCommandInteraction(overrides: Record<string, unknown> = {}) {
  return {
    user: { id: 'user123' },
    guildId: 'guild123',
    channelId: 'channel123',
    showModal: vi.fn(),
    reply: vi.fn(),
    fetchReply: vi.fn().mockResolvedValue({ id: 'msg123' }),
    isRepliable: () => true,
    replied: false,
    deferred: false,
    options: {
      getSubcommand: vi.fn().mockReturnValue('create'),
    },
    client: {
      rest: { patch: vi.fn() },
    },
    ...overrides,
  };
}

/**
 * Builds a Label-wrapped modal submission component (matches discord.js transformed format).
 * discord.js converts custom_id → customId on modal submit data.
 * Used for CheckboxGroup, RoleSelect, StringSelect submissions inside modals.
 */
export function labelWrapped(id: string, values: string[]) {
  return {
    type: 18, // ComponentType.Label (wraps inner component)
    component: { customId: id, values },
  };
}

/**
 * Builds a Label-wrapped RoleSelect submission component.
 */
export function roleSelectWrapped(id: string, values: string[]) {
  return {
    type: 18,
    component: { customId: id, values },
  };
}
