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
import { buildMessageContent, buildPollEmbed } from '../util/embeds.js';
import { PollMode, Setting, EVERYONE_SENTINEL } from '../util/constants.js';
import {
  generateId,
  POLL_MODAL_ID,
  MODAL_POLL_TITLE,
  MODAL_POLL_OPTIONS,
  MODAL_POLL_MODE,
  MODAL_POLL_SETTINGS,
  MODAL_POLL_MENTIONS,
} from '../util/ids.js';
import { getCheckboxValues, getRoleSelectValues, getRawModalComponents } from '../util/modal.js';
import { parseOptionsWithTargets, validatePollOptions } from '../util/validation.js';

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
      description: 'One per line. Add /N for a vote target',
      component: {
        type: ComponentType.TextInput as const,
        custom_id: MODAL_POLL_OPTIONS,
        style: TextInputStyle.Paragraph,
        placeholder: 'Valorant /5\nCS2 /3\nOverwatch',
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
        max_values: 3,
        required: false,
        options: [
          { label: 'Anonymous', value: 'anonymous', description: 'Hide voter names' },
          {
            label: 'Show Live Results',
            value: 'show_live',
            description: 'Show results before closing',
            default: true,
          },
          {
            label: 'Mention @everyone',
            value: 'mention_everyone',
            description: 'Notify everyone in the channel',
          },
        ],
      },
    },
    {
      type: ComponentType.Label as const,
      label: 'Mention Roles',
      description: 'Optional — mentioned roles will be notified',
      component: {
        type: ComponentType.RoleSelect as const,
        custom_id: MODAL_POLL_MENTIONS,
        min_values: 0,
        max_values: 25,
        required: false,
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
  const modeValues = getCheckboxValues(rawComponents, MODAL_POLL_MODE) as PollMode[];
  const settingsValues = getCheckboxValues(rawComponents, MODAL_POLL_SETTINGS) as Setting[];

  const mode = modeValues[0] ?? PollMode.Single;
  const anonymous = settingsValues.includes(Setting.Anonymous);
  // Default to show_live when settings is empty (first-time creation)
  const showLive = settingsValues.length > 0 ? settingsValues.includes(Setting.ShowLive) : true;
  const mentionRoleIds: string[] = getRoleSelectValues(rawComponents, MODAL_POLL_MENTIONS);
  if (settingsValues.includes(Setting.MentionEveryone)) mentionRoleIds.unshift(EVERYONE_SENTINEL);
  const mentions = JSON.stringify(mentionRoleIds);

  // Parse and validate options
  const options = parseOptionsWithTargets(optionsRaw);
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
      mentions,
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

  await interaction.reply({
    ...buildMessageContent(title, mentions),
    embeds: [embed],
    components,
  });

  const message = await interaction.fetchReply();
  setPollMessageId(pollId, message.id);
}
