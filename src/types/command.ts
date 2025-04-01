import { ChatInputCommandInteraction, SlashCommandBuilder } from 'discord.js';

export interface Command {
    data: SlashCommandBuilder | Omit<SlashCommandBuilder, "addSubcommand" | "addSubcommandGroup">;
    execute: (interaction: ChatInputCommandInteraction) => Promise<void>;
    category?: string;
    cooldown?: number; // in seconds
}

export interface CommandRegistryOptions {
    commandsPath: string;
    devGuildId?: string; // For guild-specific commands during development
} 