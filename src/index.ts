import { Client, GatewayIntentBits, Events } from 'discord.js';
import { config } from './config.js';
import { commands } from './commands/index.js';
import { routeInteraction } from './interactions/index.js';
import { POLL_MODAL_ID, handlePollModalSubmit } from './commands/poll.js';
import { POLL_VOTE_MODAL_PREFIX, handlePollVoteModalSubmit } from './interactions/poll-vote.js';

// Importing connection initializes the DB and runs schema
import './db/connection.js';

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

client.once(Events.ClientReady, (c) => {
  console.log(`Logged in as ${c.user.tag}`);
});

client.on(Events.InteractionCreate, async (interaction) => {
  if (interaction.isChatInputCommand()) {
    const command = commands.get(interaction.commandName);
    if (!command) return;

    try {
      await command.execute(interaction);
    } catch (err) {
      console.error(`Error executing /${interaction.commandName}:`, err);
      const reply =
        interaction.replied || interaction.deferred
          ? interaction.followUp({ content: 'Something went wrong.', flags: 64 })
          : interaction.reply({ content: 'Something went wrong.', flags: 64 });
      await reply;
    }
  } else if (interaction.isModalSubmit()) {
    try {
      if (interaction.customId === POLL_MODAL_ID) {
        await handlePollModalSubmit(interaction);
      } else if (interaction.customId.startsWith(POLL_VOTE_MODAL_PREFIX)) {
        await handlePollVoteModalSubmit(interaction);
      }
    } catch (err) {
      console.error(`Error handling modal ${interaction.customId}:`, err);
      const reply =
        interaction.replied || interaction.deferred
          ? interaction.followUp({ content: 'Something went wrong.', flags: 64 })
          : interaction.reply({ content: 'Something went wrong.', flags: 64 });
      await reply;
    }
  } else if (interaction.isButton() || interaction.isStringSelectMenu()) {
    await routeInteraction(interaction);
  }
});

client.login(config.botToken);
