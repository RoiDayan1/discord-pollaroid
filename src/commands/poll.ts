import {
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
  type ModalSubmitInteraction,
  MessageFlags,
  ComponentType,
  TextInputStyle,
} from 'discord.js';
import type {
  APIModalSubmitRadioGroupComponent,
  APIModalSubmitCheckboxGroupComponent,
  APIModalSubmissionComponent,
} from 'discord-api-types/v10';
import { generateId } from '../util/ids.js';
import {
  createPoll,
  setPollMessageId,
  getPoll,
  getPollOptions,
  getPollVotes,
} from '../db/polls.js';
import { buildPollEmbed } from '../util/embeds.js';
import { buildPollComponents } from '../util/components.js';
import { MAX_POLL_OPTIONS } from '../util/constants.js';

export const POLL_MODAL_ID = 'poll-create-modal';

const POLL_MODAL_PAYLOAD = {
  title: 'Create a Poll',
  custom_id: POLL_MODAL_ID,
  components: [
    {
      type: ComponentType.Label,
      label: 'Poll Question',
      component: {
        type: ComponentType.TextInput,
        custom_id: 'poll_title',
        style: TextInputStyle.Short,
        placeholder: 'What should we play Friday?',
        required: true,
      },
    },
    {
      type: ComponentType.Label,
      label: 'Options',
      description: 'One option per line (2-20 options)',
      component: {
        type: ComponentType.TextInput,
        custom_id: 'poll_options',
        style: TextInputStyle.Paragraph,
        placeholder: 'Valorant\nCS2\nOverwatch',
        required: true,
      },
    },
    {
      type: ComponentType.Label,
      label: 'Voting Mode',
      component: {
        type: ComponentType.CheckboxGroup,
        custom_id: 'poll_mode',
        min_values: 1,
        max_values: 1,
        options: [
          { label: 'Single Choice', value: 'single', default: true },
          { label: 'Multiple Choice', value: 'multi' },
        ],
      },
    },
    {
      type: ComponentType.Label,
      label: 'Settings',
      component: {
        type: ComponentType.CheckboxGroup,
        custom_id: 'poll_settings',
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
  .setDescription('Create a new poll');

export async function execute(interaction: ChatInputCommandInteraction) {
  // @ts-expect-error -- Label/RadioGroup/CheckboxGroup not in discord.js modal types yet
  await interaction.showModal(POLL_MODAL_PAYLOAD);
}

export function findModalComponent(
  components: APIModalSubmissionComponent[],
  customId: string,
): APIModalSubmitRadioGroupComponent | APIModalSubmitCheckboxGroupComponent | undefined {
  for (const comp of components) {
    if (comp.type === ComponentType.Label) {
      const inner = comp.component;
      if ('customId' in inner && inner.customId === customId) {
        return inner as APIModalSubmitRadioGroupComponent | APIModalSubmitCheckboxGroupComponent;
      }
    }
  }
  return undefined;
}

export async function handlePollModalSubmit(interaction: ModalSubmitInteraction) {
  const title = interaction.fields.getTextInputValue('poll_title');
  const optionsRaw = interaction.fields.getTextInputValue('poll_options');

  // Parse RadioGroup and CheckboxGroup from raw components
  const rawComponents = (interaction as unknown as { components: APIModalSubmissionComponent[] })
    .components;

  const modeComp = findModalComponent(rawComponents, 'poll_mode') as
    | { values?: string[] }
    | undefined;
  const settingsComp = findModalComponent(rawComponents, 'poll_settings') as
    | { values?: string[] }
    | undefined;

  const mode = ((modeComp?.values ?? [])[0] ?? 'single') as 'single' | 'multi';
  const settings = settingsComp?.values ?? ['show_live'];
  const anonymous = settings.includes('anonymous');
  const showLive = settings.includes('show_live');

  const options = optionsRaw
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean);

  if (options.length < 2) {
    await interaction.reply({
      content: 'You need at least 2 options (one per line).',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }
  if (options.length > MAX_POLL_OPTIONS) {
    await interaction.reply({
      content: `Too many options (max ${MAX_POLL_OPTIONS}).`,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

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

  const poll = getPoll(pollId)!;
  const pollOptions = getPollOptions(pollId);
  const votes = getPollVotes(pollId);

  const embed = buildPollEmbed(poll, pollOptions, votes, showLive);
  const components = buildPollComponents(pollId);

  await interaction.reply({ embeds: [embed], components });

  const message = await interaction.fetchReply();
  setPollMessageId(pollId, message.id);
}
