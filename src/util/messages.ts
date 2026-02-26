import { DiscordAPIError, type Interaction, type MessageEditOptions, Routes } from 'discord.js';
import { enrichDiscordAPIErrorMessage, safeErrorReply } from './errors.js';

/** Converts discord.js builder objects to raw API format for REST calls. */
function resolvePayload(payload: MessageEditOptions): Record<string, unknown> {
  const body: Record<string, unknown> = {};

  if (payload.content !== undefined) body.content = payload.content;

  if (payload.embeds) {
    body.embeds = payload.embeds.map((e) =>
      'toJSON' in e && typeof e.toJSON === 'function' ? e.toJSON() : e,
    );
  }

  if (payload.components !== undefined) {
    body.components = payload.components.map((c) =>
      'toJSON' in c && typeof c.toJSON === 'function' ? c.toJSON() : c,
    );
  }

  if (payload.allowedMentions) {
    const am = payload.allowedMentions;
    body.allowed_mentions = {
      ...(am.parse && { parse: am.parse }),
      ...(am.roles && { roles: am.roles }),
      ...(am.users && { users: am.users }),
      ...(am.repliedUser !== undefined && { replied_user: am.repliedUser }),
    };
  }

  return body;
}

/**
 * Edits a bot message using the channel REST API.
 */
export async function editChannelMessage(
  interaction: Interaction,
  channelId: string,
  messageId: string | null,
  payload: MessageEditOptions,
): Promise<void> {
  if (!messageId) return;
  const body = resolvePayload(payload);

  try {
    await interaction.client.rest.patch(Routes.channelMessage(channelId, messageId), { body });
  } catch (error) {
    if (error instanceof DiscordAPIError) {
      const errorMessage = enrichDiscordAPIErrorMessage(error, 'Failed to update message.');
      await safeErrorReply(interaction, errorMessage);
    } else {
      console.error('editChannelMessage error', error);
    }
  }
}
