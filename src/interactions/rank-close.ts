/** Handles the rank close button — creator-only, shows final results. */

import { type ButtonInteraction, MessageFlags } from 'discord.js';
import { parseRankClose } from '../util/ids.js';
import { getRank, getRankOptions, getRankVotes, closeRank } from '../db/ranks.js';
import { buildRankEmbed } from '../util/embeds.js';
import { rankCreatorSessions } from './rank-vote.js';

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

  const options = getRankOptions(rankId);
  const votes = getRankVotes(rankId);
  const updatedRank = getRank(rankId)!;
  const embed = buildRankEmbed(updatedRank, options, votes, true);

  // Check for creator session (button clicked from the star mode ephemeral)
  const key = `${rankId}:${interaction.user.id}`;
  const session = rankCreatorSessions.get(key);

  if (session?.rankInteraction) {
    await interaction.update({ content: 'Ranking closed!', components: [] });

    try {
      await session.rankInteraction.editReply({ embeds: [embed], components: [] });
    } catch {
      // Token may have expired — embed will refresh on next interaction
    }

    rankCreatorSessions.delete(key);
  } else {
    // Fallback: update the message the button is on (e.g. direct close button on message)
    await interaction.update({ embeds: [embed], components: [] });
  }
}
