import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  type MessageActionRowComponentBuilder,
} from 'discord.js';
import { pollVoteOpenId, rankRateId, rankOrderStartId } from './ids.js';

export function buildPollComponents(
  pollId: string,
): ActionRowBuilder<MessageActionRowComponentBuilder>[] {
  return [
    new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(pollVoteOpenId(pollId))
        .setLabel('Vote')
        .setStyle(ButtonStyle.Primary),
    ),
  ];
}

/** Star mode: single "Rate" button (voting happens via modal). */
export function buildRankRateComponents(
  rankId: string,
): ActionRowBuilder<MessageActionRowComponentBuilder>[] {
  return [
    new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(rankRateId(rankId))
        .setLabel('Rate')
        .setStyle(ButtonStyle.Primary),
    ),
  ];
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
    ),
  ];
}
