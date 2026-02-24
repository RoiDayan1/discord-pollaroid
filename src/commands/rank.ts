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
import { buildRankRateComponents, buildRankOrderComponents } from '../util/components.js';
import { buildRankEmbed } from '../util/embeds.js';
import {
  generateId,
  RANK_MODAL_ID,
  MODAL_RANK_TITLE,
  MODAL_RANK_OPTIONS,
  MODAL_RANK_MODE,
  MODAL_RANK_SETTINGS,
} from '../util/ids.js';
import { getCheckboxValues, getRawModalComponents } from '../util/modal.js';
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
      description: 'One option per line (minimum 2)',
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

  const modeValues = getCheckboxValues(rawComponents, MODAL_RANK_MODE);
  const settingsValues = getCheckboxValues(rawComponents, MODAL_RANK_SETTINGS);

  const mode = (modeValues[0] ?? 'star') as 'star' | 'order';
  const anonymous = settingsValues.includes('anonymous');
  const showLive = settingsValues.length > 0 ? settingsValues.includes('show_live') : true;

  // Parse and validate options
  const options = parseOptions(optionsRaw);
  const error = validateRankOptions(options);
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
    mode === 'star' ? buildRankRateComponents(rankId) : buildRankOrderComponents(rankId);

  await interaction.reply({ embeds: [embed], components });
  const message = await interaction.fetchReply();
  setRankMessageId(rankId, message.id);
}
