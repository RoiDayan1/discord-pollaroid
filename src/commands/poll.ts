/**
 * /poll command — opens a modal to create a new poll.
 * The modal uses Discord's new component types (Label, CheckboxGroup)
 * which aren't fully typed in discord.js yet.
 */

import {
  ComponentType,
  MessageFlags,
  SlashCommandBuilder,
  TextInputStyle,
  type APIModalInteractionResponseCallbackData,
  type ChatInputCommandInteraction,
  type ModalSubmitInteraction,
} from 'discord.js';
import {
  createPoll,
  getPoll,
  getPollOptions,
  getPollVotes,
  setPollMessageId,
} from '../db/polls.js';
import { buildPollComponents } from '../util/components.js';
import { buildPollEmbed } from '../util/embeds.js';
import {
  generateId,
  POLL_MODAL_ID,
  MODAL_POLL_TITLE,
  MODAL_POLL_OPTIONS,
  MODAL_POLL_MODE,
  MODAL_POLL_SETTINGS,
} from '../util/ids.js';
import { getCheckboxValues, getRawModalComponents } from '../util/modal.js';
import { parseOptions, validatePollOptions } from '../util/validation.js';

const POLL_MODAL_PAYLOAD: APIModalInteractionResponseCallbackData = {
  title: 'Create a Poll',
  custom_id: POLL_MODAL_ID,
  components: [
    {
      type: ComponentType.Label as const,
      label: 'Poll Question',
      component: {
        type: ComponentType.TextInput as const,
        custom_id: MODAL_POLL_TITLE,
        style: TextInputStyle.Short,
        placeholder: 'What should we play Friday?',
        required: true,
      },
    },
    {
      type: ComponentType.Label as const,
      label: 'Options',
      description: 'One option per line (minimum 2)',
      component: {
        type: ComponentType.TextInput as const,
        custom_id: MODAL_POLL_OPTIONS,
        style: TextInputStyle.Paragraph,
        placeholder: 'Valorant\nCS2\nOverwatch',
        required: true,
      },
    },
    {
      type: ComponentType.Label as const,
      label: 'Voting Mode',
      component: {
        type: ComponentType.CheckboxGroup as const,
        custom_id: MODAL_POLL_MODE,
        min_values: 1,
        max_values: 1,
        options: [
          { label: 'Single Choice', value: 'single', default: true },
          { label: 'Multiple Choice', value: 'multi' },
        ],
      },
    },
    {
      type: ComponentType.Label as const,
      label: 'Settings',
      component: {
        type: ComponentType.CheckboxGroup as const,
        custom_id: MODAL_POLL_SETTINGS,
        min_values: 0,
        max_values: 2,
        required: false,
        options: [
          { label: 'Anonymous', value: 'anonymous', description: 'Hide voter names' },
          {
            label: 'Show Live Results',
            value: 'show_live',
            description: 'Show results before closing',
            default: true,
          },
        ],
      },
    },
  ],
};

export const data = new SlashCommandBuilder()
  .setName('poll')
  .setDescription('Create and manage polls')
  .addSubcommand((sub) => sub.setName('create').setDescription('Create a new poll'));

export async function execute(interaction: ChatInputCommandInteraction) {
  await interaction.showModal(POLL_MODAL_PAYLOAD);
}

export async function handlePollModalSubmit(interaction: ModalSubmitInteraction) {
  const title = interaction.fields.getTextInputValue(MODAL_POLL_TITLE);
  const optionsRaw = interaction.fields.getTextInputValue(MODAL_POLL_OPTIONS);
  const rawComponents = getRawModalComponents(interaction);

  // Extract checkbox selections
  const modeValues = getCheckboxValues(rawComponents, MODAL_POLL_MODE);
  const settingsValues = getCheckboxValues(rawComponents, MODAL_POLL_SETTINGS);

  const mode = (modeValues[0] ?? 'single') as 'single' | 'multi';
  const anonymous = settingsValues.includes('anonymous');
  // Default to show_live when settings is empty (first-time creation)
  const showLive = settingsValues.length > 0 ? settingsValues.includes('show_live') : true;

  // Parse and validate options
  const options = parseOptions(optionsRaw);
  const error = validatePollOptions(options);
  if (error) {
    await interaction.reply({ content: error, flags: MessageFlags.Ephemeral });
    return;
  }

  // Create poll in DB
  const pollId = generateId();
  createPoll(
    {
      id: pollId,
      guild_id: interaction.guildId!,
      channel_id: interaction.channelId!,
      creator_id: interaction.user.id,
      title,
      mode,
      anonymous: anonymous ? 1 : 0,
      show_live: showLive ? 1 : 0,
      closed: 0,
    },
    options,
  );

  // Send poll message and store its ID for later updates
  const poll = getPoll(pollId)!;
  const pollOptions = getPollOptions(pollId);
  const votes = getPollVotes(pollId);
  const embed = buildPollEmbed(poll, pollOptions, votes, showLive);
  const components = buildPollComponents(pollId);

  await interaction.reply({ embeds: [embed], components });

  const message = await interaction.fetchReply();
  setPollMessageId(pollId, message.id);
}
