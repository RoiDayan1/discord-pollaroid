/** Handles the poll close button — creator-only, shows final results. */

import { type ButtonInteraction, MessageFlags } from 'discord.js';
import { parsePollClose } from '../util/ids.js';
import { getPoll, getPollOptions, getPollVotes, closePoll } from '../db/polls.js';
import { buildMessageContent, buildPollEmbed } from '../util/embeds.js';
import { pollCreatorSessions } from './poll-vote.js';

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

  // Check for creator session — refresh poll message via stored interaction
  const key = `${pollId}:${interaction.user.id}`;
  const session = pollCreatorSessions.get(key);

  if (session?.pollInteraction) {
    // Update the ephemeral message to confirm closure
    await interaction.update({ content: 'Poll closed!', components: [] });

    // Refresh the poll message via the stored interaction
    try {
      await session.pollInteraction.editReply({
        ...buildMessageContent(updatedPoll.title, updatedPoll.mentions),
        embeds: [embed],
        components: [],
      });
    } catch {
      // Token may have expired — embed will refresh on next interaction
    }

    pollCreatorSessions.delete(key);
  } else {
    // Fallback: update the message the button is on
    await interaction.update({
      ...buildMessageContent(updatedPoll.title, updatedPoll.mentions),
      embeds: [embed],
      components: [],
    });
  }
}
