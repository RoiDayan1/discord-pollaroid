/**
 * Shared error handling for interaction responses.
 * Handles the common case where we don't know if the interaction
 * has already been replied to or deferred.
 */

import { DiscordAPIError, type Interaction } from 'discord.js';

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

/** Enriches a DiscordAPIError message with a header and additional information. */
export function enrichDiscordAPIErrorMessage(error: DiscordAPIError, header?: string): string {
  let errorMessage = `**Error ${error.code}:** ${error.message}`;
  if (header) errorMessage = `**${header}**\n${errorMessage}`;
  switch (error.code) {
    case 50001:
      return (
        errorMessage +
        "\nI don't have access to this channel. Please make sure my role has the **View Channel** permission here. If this is a private channel, you need to add my role to this channel specifically."
      );
    case 10008:
      return errorMessage + "\nThe message you're trying to edit is no longer available.";
    default:
      console.error(errorMessage, error);
      return errorMessage;
  }
}
