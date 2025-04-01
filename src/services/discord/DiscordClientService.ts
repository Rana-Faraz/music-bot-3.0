import { Client, ClientOptions, Collection, GatewayIntentBits, Events, Interaction } from 'discord.js';
import { config } from '../../config';
import { logger } from '../logger/LoggerService';
import { AppResult, ErrorType, handleAsync } from '../../types/error';
import { CommandRegistry } from '../commands/CommandRegistry';
import path from 'path';

export class DiscordClientService {
    private static instance: DiscordClientService;
    private client: Client;
    private commandRegistry: CommandRegistry;
    
    private constructor() {
        this.client = this.createClient();
        this.commandRegistry = CommandRegistry.getInstance({
            commandsPath: path.join(process.cwd(), 'src', 'commands'),
            devGuildId: process.env.GUILD_ID
        });
        this.setupEventHandlers();
    }

    public static getInstance(): DiscordClientService {
        if (!DiscordClientService.instance) {
            DiscordClientService.instance = new DiscordClientService();
        }
        return DiscordClientService.instance;
    }

    private createClient(): Client {
        const clientOptions: ClientOptions = {
            intents: [
                GatewayIntentBits.Guilds,
                GatewayIntentBits.GuildMessages,
                GatewayIntentBits.GuildVoiceStates,
                GatewayIntentBits.MessageContent,
                GatewayIntentBits.GuildMembers,
            ],
        };

        return new Client(clientOptions);
    }

    private setupEventHandlers(): void {
        this.client.once(Events.ClientReady, async (client) => {
            logger.info(`Discord client ready as ${client.user.tag}`);
            
            // Deploy commands
            const deployResult = await this.commandRegistry.deployCommands(client);
            if (deployResult.isErr()) {
                logger.error('Failed to deploy commands', deployResult.error);
            }
        });

        this.client.on(Events.InteractionCreate, async (interaction) => {
            if (!interaction.isChatInputCommand()) return;
            await this.commandRegistry.handleInteraction(interaction);
        });

        this.client.on(Events.Error, (error) => {
            logger.error('Discord client error occurred', error);
        });

        this.client.on(Events.Debug, (info) => {
            logger.debug('Discord client debug info', { info });
        });

        this.client.on(Events.Warn, (warning) => {
            logger.warn('Discord client warning', { warning });
        });
    }

    public async connect(): Promise<AppResult<void>> {
        logger.info('Attempting to connect Discord client...');
        
        const loginResult = await handleAsync(
            this.client.login(config.discord.token),
            ErrorType.Discord
        );

        if (loginResult.isOk()) {
            logger.info(`Discord client logged in successfully`);
        }

        return loginResult.map(() => undefined);
    }

    public getClient(): Client {
        return this.client;
    }

    public async disconnect(): Promise<AppResult<void>> {
        logger.info('Disconnecting Discord client...');
        
        return handleAsync(
            (async () => {
                await this.client.destroy();
                logger.info('Discord client disconnected successfully');
            })(),
            ErrorType.Discord
        );
    }
} 