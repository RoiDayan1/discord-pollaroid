/**
 * Shared error handling for interaction responses.
 * Handles the common case where we don't know if the interaction
 * has already been replied to or deferred.
 */

import { type Interaction } from 'discord.js';

/** Safely sends an ephemeral error response, handling already-replied/deferred states. */
export async function safeErrorReply(
  interaction: Interaction,
  message = 'Something went wrong.',
): Promise<void> {
  if (!interaction.isRepliable()) return;
  // Use numeric flag (64 = Ephemeral) to avoid discord.js type narrowing issues
  const payload = { content: message, flags: 64 as const };
  if (interaction.replied || interaction.deferred) {
    await interaction.followUp(payload);
  } else {
    await interaction.reply(payload);
  }
}
