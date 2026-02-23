import {
  type ButtonInteraction,
  type ModalSubmitInteraction,
  ComponentType,
  MessageFlags,
} from 'discord.js';
import { findModalComponent } from '../commands/poll.js';
import {
  getPoll,
  getPollOptions,
  getPollVotes,
  getUserPollVotes,
  votePollMulti,
  votePollSingle,
} from '../db/polls.js';
import { buildPollComponents } from '../util/components.js';
import { buildPollEmbed } from '../util/embeds.js';
import { parsePollVoteOpen } from '../util/ids.js';

export const POLL_VOTE_MODAL_PREFIX = 'poll-vote:';

export async function handlePollVoteOpen(interaction: ButtonInteraction) {
  const parsed = parsePollVoteOpen(interaction.customId);
  if (!parsed) return;

  const { pollId } = parsed;
  const poll = getPoll(pollId);
  if (!poll || poll.closed) {
    await interaction.reply({ content: 'This poll is closed.', flags: MessageFlags.Ephemeral });
    return;
  }

  const options = getPollOptions(pollId);
  const userVotes = getUserPollVotes(pollId, interaction.user.id);
  const votedIdxs = new Set(userVotes.map((v) => v.option_idx));

  const modalOptions = options.map((opt) => ({
    label: `${opt.label}`.slice(0, 100),
    value: String(opt.idx),
    default: votedIdxs.has(opt.idx),
  }));

  const isSingle = poll.mode === 'single';

  const choiceComponent = {
    type: ComponentType.Label,
    label: isSingle ? 'Choose an option' : 'Choose one or more options',
    component: {
      type: ComponentType.CheckboxGroup,
      custom_id: 'poll_vote_choice',
      min_values: 1,
      max_values: isSingle ? 1 : options.length,
      options: modalOptions,
    },
  };

  const modalPayload = {
    title: 'Vote',
    custom_id: `${POLL_VOTE_MODAL_PREFIX}${pollId}`,
    components: [choiceComponent],
  };

  // @ts-expect-error -- Label/RadioGroup/CheckboxGroup not in discord.js modal types yet
  await interaction.showModal(modalPayload);
}

export async function handlePollVoteModalSubmit(interaction: ModalSubmitInteraction) {
  const pollId = interaction.customId.slice(POLL_VOTE_MODAL_PREFIX.length);
  const poll = getPoll(pollId);
  if (!poll || poll.closed) {
    await interaction.reply({ content: 'This poll is closed.', flags: MessageFlags.Ephemeral });
    return;
  }

  const rawComponents = (interaction as unknown as { components: unknown[] }).components;
  const options = getPollOptions(pollId);

  const checkboxComp = findModalComponent(rawComponents as never[], 'poll_vote_choice') as
    | { values?: string[] }
    | undefined;
  const values = checkboxComp?.values ?? [];

  if (values.length === 0) {
    await interaction.reply({
      content: 'No option selected.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const selectedIdxs = values.map((v: string) => parseInt(v, 10));

  if (poll.mode === 'single') {
    votePollSingle(pollId, selectedIdxs[0], interaction.user.id);
  } else {
    votePollMulti(pollId, selectedIdxs, interaction.user.id);
  }

  const labels = selectedIdxs
    .map((idx: number) => options.find((o) => o.idx === idx)?.label)
    .filter(Boolean)
    .join(', ');

  if (poll.show_live) {
    const votes = getPollVotes(pollId);
    const embed = buildPollEmbed(poll, options, votes, true);
    const components = buildPollComponents(pollId);
    await interaction.deferUpdate();
    await interaction.editReply({ embeds: [embed], components });
  } else {
    await interaction.reply({
      content: `Vote recorded for **${labels}**!`,
      flags: MessageFlags.Ephemeral,
    });
  }
}
