import { REST, Routes } from 'discord.js';
import { config } from './config.js';
import { commands } from './commands/index.js';

const rest = new REST().setToken(config.botToken);

const body = [...commands.values()].map((cmd) => cmd.data.toJSON());

console.log(`Registering ${body.length} commands globally...`);
await rest.put(Routes.applicationCommands(config.clientId), { body });
console.log('Global commands registered successfully.');

if (config.guildId) {
  console.log(`Registering ${body.length} commands to guild ${config.guildId}...`);
  await rest.put(Routes.applicationGuildCommands(config.clientId, config.guildId), { body });
  console.log('Guild commands registered successfully.');
}
