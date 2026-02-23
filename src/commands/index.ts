import type { ChatInputCommandInteraction, SharedSlashCommand } from 'discord.js';
import * as poll from './poll.js';
import * as rank from './rank.js';

export interface Command {
  data: SharedSlashCommand;
  execute: (interaction: ChatInputCommandInteraction) => Promise<void>;
}

const commandList: Command[] = [poll, rank];

export const commands = new Map<string, Command>(commandList.map((cmd) => [cmd.data.name, cmd]));
