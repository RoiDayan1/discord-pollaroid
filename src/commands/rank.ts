import { SlashCommandBuilder, type ChatInputCommandInteraction, MessageFlags } from 'discord.js';
import { generateId } from '../util/ids.js';
import {
  createRank,
  setRankMessageId,
  getRank,
  getRankOptions,
  getRankVotes,
} from '../db/ranks.js';
import { buildRankEmbed } from '../util/embeds.js';
import { buildRankStarComponents, buildRankOrderComponents } from '../util/components.js';
import { MAX_RANK_OPTIONS_PER_MESSAGE } from '../util/constants.js';

export const data = new SlashCommandBuilder()
  .setName('rank')
  .setDescription('Create and manage rankings')
  .addSubcommand((sub) =>
    sub
      .setName('create')
      .setDescription('Create a new ranking')
      .addStringOption((opt) =>
        opt.setName('title').setDescription('Ranking title').setRequired(true),
      )
      .addStringOption((opt) =>
        opt.setName('options').setDescription('Comma-separated options').setRequired(true),
      )
      .addStringOption((opt) =>
        opt
          .setName('mode')
          .setDescription('Ranking mode')
          .setRequired(true)
          .addChoices({ name: 'Star Rating', value: 'star' }, { name: 'Ordering', value: 'order' }),
      )
      .addBooleanOption((opt) =>
        opt.setName('anonymous').setDescription('Hide voter names (default: false)'),
      ),
  );

export async function execute(interaction: ChatInputCommandInteraction) {
  const sub = interaction.options.getSubcommand();
  if (sub === 'create') return handleCreate(interaction);
}

async function handleCreate(interaction: ChatInputCommandInteraction) {
  const title = interaction.options.getString('title', true);
  const optionsRaw = interaction.options.getString('options', true);
  const mode = interaction.options.getString('mode', true) as 'star' | 'order';
  const anonymous = interaction.options.getBoolean('anonymous') ?? false;

  const options = optionsRaw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  if (options.length < 2) {
    await interaction.reply({
      content: 'You need at least 2 options.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const rankId = generateId();
  createRank(
    {
      id: rankId,
      guild_id: interaction.guildId!,
      channel_id: interaction.channelId,
      creator_id: interaction.user.id,
      title,
      mode,
      anonymous: anonymous ? 1 : 0,
      closed: 0,
    },
    options,
  );

  const rank = getRank(rankId)!;
  const rankOptions = getRankOptions(rankId);
  const votes = getRankVotes(rankId);

  if (mode === 'star') {
    // Send multiple messages if > 5 options (5 ActionRows limit per message)
    const chunks: (typeof rankOptions)[] = [];
    for (let i = 0; i < rankOptions.length; i += MAX_RANK_OPTIONS_PER_MESSAGE) {
      chunks.push(rankOptions.slice(i, i + MAX_RANK_OPTIONS_PER_MESSAGE));
    }

    for (let c = 0; c < chunks.length; c++) {
      const isFirst = c === 0;
      const embed = isFirst ? buildRankEmbed(rank, rankOptions, votes, false) : undefined;
      const isLast = c === chunks.length - 1;
      const components = buildRankStarComponents(rankId, chunks[c], isLast);

      if (isFirst) {
        await interaction.reply({ embeds: embed ? [embed] : [], components });
        const message = await interaction.fetchReply();
        setRankMessageId(rankId, message.id);
      } else {
        await interaction.followUp({ components });
      }
    }
  } else {
    // Ordering mode: single message with a "Submit Your Ranking" button
    const embed = buildRankEmbed(rank, rankOptions, votes, false);
    const components = buildRankOrderComponents(rankId);

    await interaction.reply({ embeds: [embed], components });
    const message = await interaction.fetchReply();
    setRankMessageId(rankId, message.id);
  }
}
