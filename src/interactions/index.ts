import type { ButtonInteraction, StringSelectMenuInteraction } from 'discord.js';
import { handlePollVoteOpen } from './poll-vote.js';
import { handlePollClose } from './poll-close.js';
import { handleRankStarVote, handleRankOrderStart, handleRankOrderStep } from './rank-vote.js';
import { handleRankClose } from './rank-close.js';

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
  } catch (err) {
    console.error(`Error handling interaction ${id}:`, err);
    const reply =
      interaction.replied || interaction.deferred
        ? interaction.followUp({ content: 'Something went wrong.', flags: 64 })
        : interaction.reply({ content: 'Something went wrong.', flags: 64 });
    await reply;
  }
}
