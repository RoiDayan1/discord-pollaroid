/** Handles the poll close button — creator-only, shows final results. */

import { type ButtonInteraction, MessageFlags } from 'discord.js';
import { parsePollClose } from '../util/ids.js';
import { getPoll, getPollOptions, getPollVotes, closePoll } from '../db/polls.js';
import { buildPollEmbed } from '../util/embeds.js';

export async function handlePollClose(interaction: ButtonInteraction) {
  const parsed = parsePollClose(interaction.customId);
  if (!parsed) return;

  const { pollId } = parsed;
  const poll = getPoll(pollId);
  if (!poll) return;

  if (poll.closed) {
    await interaction.reply({
      content: 'This poll is already closed.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  if (interaction.user.id !== poll.creator_id) {
    await interaction.reply({
      content: 'Only the poll creator can close this poll.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  closePoll(pollId);

  // Show final results with no action buttons
  const options = getPollOptions(pollId);
  const votes = getPollVotes(pollId);
  const updatedPoll = getPoll(pollId)!;
  const embed = buildPollEmbed(updatedPoll, options, votes, true);

  await interaction.update({ embeds: [embed], components: [] });
}
