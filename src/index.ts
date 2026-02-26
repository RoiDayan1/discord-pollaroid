/**
 * Bot entry point — sets up the Discord client and routes all interactions.
 */

import { Client, Events, GatewayIntentBits } from 'discord.js';
import { commands } from './commands/index.js';
import { handlePollModalSubmit } from './commands/poll.js';
import { handleRankModalSubmit } from './commands/rank.js';
import { config } from './config.js';
import { routeInteraction } from './interactions/index.js';
import { handlePollEditModalSubmit } from './interactions/poll-edit.js';
import { handlePollVoteModalSubmit } from './interactions/poll-vote.js';
import { handleRankEditModalSubmit } from './interactions/rank-edit.js';
import { handleRankStarVoteSubmit } from './interactions/rank-vote.js';
import { safeErrorReply } from './util/errors.js';
import {
  POLL_EDIT_MODAL_PREFIX,
  POLL_MODAL_ID,
  POLL_VOTE_MODAL_PREFIX,
  RANK_EDIT_MODAL_PREFIX,
  RANK_MODAL_ID,
  RANK_STAR_VOTE_MODAL_PREFIX,
} from './util/ids.js';

// Importing connection initializes the DB and runs schema
import './db/connection.js';

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

client.once(Events.ClientReady, (c) => {
  console.log(`Logged in as ${c.user.tag}`);
});

client.on(Events.InteractionCreate, async (interaction) => {
  // Slash commands
  if (interaction.isChatInputCommand()) {
    const command = commands.get(interaction.commandName);
    if (!command) return;

    try {
      await command.execute(interaction);
    } catch (error) {
      console.error(`Error executing /${interaction.commandName}:`, error);
      await safeErrorReply(interaction);
    }
  }

  // Modal submissions
  else if (interaction.isModalSubmit()) {
    try {
      if (interaction.customId === POLL_MODAL_ID) {
        await handlePollModalSubmit(interaction);
      } else if (interaction.customId.startsWith(POLL_VOTE_MODAL_PREFIX)) {
        await handlePollVoteModalSubmit(interaction);
      } else if (interaction.customId.startsWith(POLL_EDIT_MODAL_PREFIX)) {
        await handlePollEditModalSubmit(interaction);
      } else if (interaction.customId === RANK_MODAL_ID) {
        await handleRankModalSubmit(interaction);
      } else if (interaction.customId.startsWith(RANK_STAR_VOTE_MODAL_PREFIX)) {
        await handleRankStarVoteSubmit(interaction);
      } else if (interaction.customId.startsWith(RANK_EDIT_MODAL_PREFIX)) {
        await handleRankEditModalSubmit(interaction);
      }
    } catch (error) {
      console.error(`Error handling modal ${interaction.customId}:`, error);
      await safeErrorReply(interaction);
    }
  }

  // Buttons and select menus
  else if (interaction.isButton() || interaction.isStringSelectMenu()) {
    await routeInteraction(interaction);
  }
});

client.login(config.botToken);
