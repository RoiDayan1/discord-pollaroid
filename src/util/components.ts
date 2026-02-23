import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  type MessageActionRowComponentBuilder,
} from 'discord.js';
import type { RankOption } from '../db/ranks.js';
import {
  pollVoteOpenId,
  pollCloseId,
  rankStarButtonId,
  rankCloseId,
  rankOrderStartId,
} from './ids.js';

export function buildPollComponents(
  pollId: string,
): ActionRowBuilder<MessageActionRowComponentBuilder>[] {
  return [
    new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(pollVoteOpenId(pollId))
        .setLabel('Vote')
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId(pollCloseId(pollId))
        .setLabel('Close Poll')
        .setStyle(ButtonStyle.Danger),
    ),
  ];
}

export function buildRankStarComponents(
  rankId: string,
  options: RankOption[],
  includeClose: boolean,
): ActionRowBuilder<MessageActionRowComponentBuilder>[] {
  const rows: ActionRowBuilder<MessageActionRowComponentBuilder>[] = [];

  for (const opt of options) {
    const row = new ActionRowBuilder<MessageActionRowComponentBuilder>();
    for (let s = 1; s <= 5; s++) {
      row.addComponents(
        new ButtonBuilder()
          .setCustomId(rankStarButtonId(rankId, opt.idx, s))
          .setLabel(`${'⭐'.repeat(s)}`)
          .setStyle(ButtonStyle.Secondary),
      );
    }
    rows.push(row);
  }

  if (includeClose) {
    rows.push(
      new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId(rankCloseId(rankId))
          .setLabel('Close Ranking')
          .setStyle(ButtonStyle.Danger),
      ),
    );
  }

  return rows;
}

export function buildRankOrderComponents(
  rankId: string,
): ActionRowBuilder<MessageActionRowComponentBuilder>[] {
  return [
    new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(rankOrderStartId(rankId))
        .setLabel('Submit Your Ranking')
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId(rankCloseId(rankId))
        .setLabel('Close Ranking')
        .setStyle(ButtonStyle.Danger),
    ),
  ];
}
