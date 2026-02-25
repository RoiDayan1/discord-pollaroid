/**
 * /rank command — opens a modal to create a new ranking.
 * Uses Label, TextInput, CheckboxGroup components (same pattern as /poll).
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
  createRank,
  getRank,
  getRankOptions,
  getRankVotes,
  setRankMessageId,
} from '../db/ranks.js';
import { buildRankOrderComponents, buildRankRateComponents } from '../util/components.js';
import { EVERYONE_SENTINEL, RankMode, Setting } from '../util/constants.js';
import { buildMessageContent, buildRankEmbed } from '../util/embeds.js';
import {
  generateId,
  MODAL_RANK_MENTIONS,
  MODAL_RANK_MODE,
  MODAL_RANK_OPTIONS,
  MODAL_RANK_SETTINGS,
  MODAL_RANK_TITLE,
  RANK_MODAL_ID,
} from '../util/ids.js';
import { getCheckboxValues, getRawModalComponents, getRoleSelectValues } from '../util/modal.js';
import { parseOptions, validateRankOptions } from '../util/validation.js';

const RANK_MODAL_PAYLOAD: APIModalInteractionResponseCallbackData = {
  title: 'Create a Ranking',
  custom_id: RANK_MODAL_ID,
  components: [
    {
      type: ComponentType.Label as const,
      label: 'Ranking Title',
      component: {
        type: ComponentType.TextInput as const,
        custom_id: MODAL_RANK_TITLE,
        style: TextInputStyle.Short,
        placeholder: 'Best programming language?',
        required: true,
      },
    },
    {
      type: ComponentType.Label as const,
      label: 'Options',
      description: 'One option per line (minimum 1; order mode requires 2)',
      component: {
        type: ComponentType.TextInput as const,
        custom_id: MODAL_RANK_OPTIONS,
        style: TextInputStyle.Paragraph,
        placeholder: 'TypeScript\nRust\nGo',
        required: true,
      },
    },
    {
      type: ComponentType.Label as const,
      label: 'Ranking Mode',
      component: {
        type: ComponentType.CheckboxGroup as const,
        custom_id: MODAL_RANK_MODE,
        min_values: 1,
        max_values: 1,
        options: [
          { label: 'Star Rating', value: 'star', default: true },
          { label: 'Ordering', value: 'order' },
        ],
      },
    },
    {
      type: ComponentType.Label as const,
      label: 'Settings',
      component: {
        type: ComponentType.CheckboxGroup as const,
        custom_id: MODAL_RANK_SETTINGS,
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
        custom_id: MODAL_RANK_MENTIONS,
        min_values: 0,
        max_values: 25,
        required: false,
      },
    },
  ],
};

export const data = new SlashCommandBuilder()
  .setName('rank')
  .setDescription('Create and manage rankings')
  .addSubcommand((sub) => sub.setName('create').setDescription('Create a new ranking'));

export async function execute(interaction: ChatInputCommandInteraction) {
  await interaction.showModal(RANK_MODAL_PAYLOAD);
}

export async function handleRankModalSubmit(interaction: ModalSubmitInteraction) {
  const title = interaction.fields.getTextInputValue(MODAL_RANK_TITLE);
  const optionsRaw = interaction.fields.getTextInputValue(MODAL_RANK_OPTIONS);
  const rawComponents = getRawModalComponents(interaction);

  const modeValues = getCheckboxValues(rawComponents, MODAL_RANK_MODE) as RankMode[];
  const settingsValues = getCheckboxValues(rawComponents, MODAL_RANK_SETTINGS) as Setting[];

  const mode = modeValues[0] ?? RankMode.Star;
  const anonymous = settingsValues.includes(Setting.Anonymous);
  const showLive = settingsValues.length > 0 ? settingsValues.includes(Setting.ShowLive) : true;
  const mentionRoleIds: string[] = getRoleSelectValues(rawComponents, MODAL_RANK_MENTIONS);
  if (settingsValues.includes(Setting.MentionEveryone)) mentionRoleIds.unshift(EVERYONE_SENTINEL);
  const mentions = JSON.stringify(mentionRoleIds);

  // Parse and validate options
  const options = parseOptions(optionsRaw);
  const error = validateRankOptions(options, mode);
  if (error) {
    await interaction.reply({ content: error, flags: MessageFlags.Ephemeral });
    return;
  }

  // Create rank in DB
  const rankId = generateId();
  createRank(
    {
      id: rankId,
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

  // Send rank message and store its ID
  const rank = getRank(rankId)!;
  const rankOptions = getRankOptions(rankId);
  const votes = getRankVotes(rankId);
  const embed = buildRankEmbed(rank, rankOptions, votes, showLive);
  const components =
    mode === RankMode.Star ? buildRankRateComponents(rankId) : buildRankOrderComponents(rankId);

  await interaction.reply({
    ...buildMessageContent(title, mentions),
    embeds: [embed],
    components,
  });
  const message = await interaction.fetchReply();
  setRankMessageId(rankId, message.id);
}
