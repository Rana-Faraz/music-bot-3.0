import { Client, Collection, REST, Routes, ChatInputCommandInteraction } from 'discord.js';
import { Command, CommandRegistryOptions } from '../../types/command';
import { logger } from '../logger/LoggerService';
import { AppResult, ErrorType, handleAsync } from '../../utils/error';
import fs from 'fs/promises';
import path from 'path';

export class CommandRegistry {
    private static instance: CommandRegistry;
    private commands: Collection<string, Command>;
    private rest: REST;
    private options: CommandRegistryOptions;

    private constructor(options: CommandRegistryOptions) {
        this.commands = new Collection();
        this.options = options;
        this.rest = new REST().setToken(process.env.DISCORD_TOKEN || '');
    }

    public static getInstance(options?: CommandRegistryOptions): CommandRegistry {
        if (!CommandRegistry.instance && options) {
            CommandRegistry.instance = new CommandRegistry(options);
        } else if (!CommandRegistry.instance) {
            throw new Error('CommandRegistry must be initialized with options first');
        }
        return CommandRegistry.instance;
    }

    public getCommand(name: string): Command | undefined {
        return this.commands.get(name);
    }

    public getAllCommands(): Collection<string, Command> {
        return this.commands;
    }

    private async loadCommands(): Promise<AppResult<void>> {
        try {
            const commandFiles = await fs.readdir(this.options.commandsPath);
            const tsFiles = commandFiles.filter(file => file.endsWith('.ts') || file.endsWith('.js'));

            for (const file of tsFiles) {
                const filePath = path.join(this.options.commandsPath, file);
                const command: Command = require(filePath);

                if ('data' in command && 'execute' in command) {
                    this.commands.set(command.data.name, command);
                    logger.debug(`Loaded command: ${command.data.name}`);
                } else {
                    logger.warn(`Invalid command file: ${file}`);
                }
            }

            logger.info(`Loaded ${this.commands.size} commands`);
            return handleAsync(Promise.resolve());
        } catch (error) {
            logger.error('Error loading commands', error);
            throw error;
        }
    }

    public async deployCommands(client: Client): Promise<AppResult<void>> {
        try {
            await this.loadCommands();

            const commands = Array.from(this.commands.values()).map(cmd => cmd.data.toJSON());

            logger.info('Started refreshing application commands...');

            if (this.options.devGuildId && process.env.NODE_ENV !== 'production') {
                // Deploy guild commands for development (instant update)
                await this.rest.put(
                    Routes.applicationGuildCommands(client.user!.id, this.options.devGuildId),
                    { body: commands }
                );
                logger.info(`Successfully registered ${commands.length} guild commands for development`);
            } else {
                // Deploy global commands for production (up to 1h update time)
                await this.rest.put(
                    Routes.applicationCommands(client.user!.id),
                    { body: commands }
                );
                logger.info(`Successfully registered ${commands.length} global commands`);
            }

            return handleAsync(Promise.resolve());
        } catch (error) {
            logger.error('Error deploying commands', error, {
                errorType: ErrorType.Discord
            });
            throw error;
        }
    }

    public async handleInteraction(interaction: ChatInputCommandInteraction): Promise<void> {
        const command = this.commands.get(interaction.commandName);

        if (!command) {
            logger.warn(`Command not found: ${interaction.commandName}`);
            await interaction.reply({
                content: '❌ This command is not available.',
                ephemeral: true
            });
            return;
        }

        try {
            await command.execute(interaction);
        } catch (error) {
            logger.error('Error executing command', error, {
                command: interaction.commandName,
                errorType: ErrorType.Unknown
            });

            const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
            const replyContent = {
                content: `❌ There was an error executing this command: ${errorMessage}`,
                ephemeral: true
            };

            if (interaction.deferred || interaction.replied) {
                await interaction.editReply(replyContent);
            } else {
                await interaction.reply(replyContent);
            }
        }
    }
} 