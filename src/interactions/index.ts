/**
 * Interaction router — matches button/select menu customIds to handlers.
 * CustomId format: <type>:<nanoid>:<action>[:<params>]
 */

import type { ButtonInteraction, StringSelectMenuInteraction } from 'discord.js';
import { handlePollVoteOpen } from './poll-vote.js';
import { handlePollClose } from './poll-close.js';
import { handlePollEditButton } from './poll-edit.js';
import { handleRankStarVote, handleRankOrderStart, handleRankOrderStep } from './rank-vote.js';
import { handleRankClose } from './rank-close.js';
import { safeErrorReply } from '../util/errors.js';

export async function routeInteraction(
  interaction: ButtonInteraction | StringSelectMenuInteraction,
) {
  const id = interaction.customId;

  try {
    // Poll interactions
    if (id.match(/^poll:\w+:vote-open$/)) {
      return await handlePollVoteOpen(interaction as ButtonInteraction);
    }
    if (id.match(/^poll:\w+:close$/)) {
      return await handlePollClose(interaction as ButtonInteraction);
    }
    if (id.match(/^poll:\w+:edit-open$/)) {
      return await handlePollEditButton(interaction as ButtonInteraction);
    }

    // Rank interactions
    if (id.match(/^rank:\w+:star:\d+:\d+$/)) {
      return await handleRankStarVote(interaction as ButtonInteraction);
    }
    if (id.match(/^rank:\w+:order-start$/)) {
      return await handleRankOrderStart(interaction as ButtonInteraction);
    }
    if (id.match(/^rank:\w+:order-step:\d+$/)) {
      return await handleRankOrderStep(interaction as StringSelectMenuInteraction);
    }
    if (id.match(/^rank:\w+:close$/)) {
      return await handleRankClose(interaction as ButtonInteraction);
    }
  } catch (err: unknown) {
    console.error(`Error handling interaction ${id}:`, err);
    await safeErrorReply(interaction);
  }
}
