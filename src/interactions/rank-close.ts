/** Handles the rank close button — creator-only, shows final results. */

import { type ButtonInteraction, MessageFlags } from 'discord.js';
import { parseRankClose } from '../util/ids.js';
import { getRank, getRankOptions, getRankVotes, closeRank } from '../db/ranks.js';
import { buildMessageContent, buildRankEmbed } from '../util/embeds.js';
import { editChannelMessage } from '../util/messages.js';

export async function handleRankClose(interaction: ButtonInteraction) {
  const parsed = parseRankClose(interaction.customId);
  if (!parsed) return;

  const { rankId } = parsed;
  const rank = getRank(rankId);
  if (!rank) return;

  if (rank.closed) {
    await interaction.reply({
      content: 'This ranking is already closed.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  if (interaction.user.id !== rank.creator_id) {
    await interaction.reply({
      content: 'Only the creator can close this ranking.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  closeRank(rankId);

  // Update the ephemeral to confirm closure
  await interaction.update({ content: 'Ranking closed!', components: [] });

  // Refresh the rank message with final results and no action buttons
  const options = getRankOptions(rankId);
  const votes = getRankVotes(rankId);
  const updatedRank = getRank(rankId)!;
  const embed = buildRankEmbed(updatedRank, options, votes, true);

  await editChannelMessage(interaction, updatedRank.channel_id, updatedRank.message_id, {
    ...buildMessageContent(updatedRank.title, updatedRank.mentions),
    embeds: [embed],
    components: [],
  });
}
