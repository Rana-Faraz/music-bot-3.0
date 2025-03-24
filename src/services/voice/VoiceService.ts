import { 
    AudioPlayer, 
    AudioPlayerStatus, 
    AudioResource, 
    createAudioPlayer, 
    createAudioResource,
    entersState,
    joinVoiceChannel,
    VoiceConnection,
    VoiceConnectionStatus
} from '@discordjs/voice';
import { GuildMember, VoiceChannel, StageChannel } from 'discord.js';
import { logger } from '../logger/LoggerService';
import { AppResult, ErrorType, handleAsync, createError } from '../../utils/error';
import { err } from 'neverthrow';
import path from 'path';

export class VoiceService {
    private static instance: VoiceService;
    private connections: Map<string, VoiceConnection>;
    private players: Map<string, AudioPlayer>;

    private constructor() {
        this.connections = new Map();
        this.players = new Map();
    }

    public static getInstance(): VoiceService {
        if (!VoiceService.instance) {
            VoiceService.instance = new VoiceService();
        }
        return VoiceService.instance;
    }

    private setupConnectionHandlers(connection: VoiceConnection, guildId: string): void {
        connection.on('stateChange', (_, newState) => {
            logger.debug(`Voice connection state changed for guild ${guildId}`, {
                state: newState.status
            });
        });

        connection.on('error', (error) => {
            logger.error(`Voice connection error in guild ${guildId}`, error);
        });
    }

    private setupPlayerHandlers(player: AudioPlayer, guildId: string): void {
        player.on('stateChange', (oldState, newState) => {
            logger.debug(`Audio player state changed for guild ${guildId}`, {
                from: oldState.status,
                to: newState.status
            });
        });

        player.on('error', (error) => {
            logger.error(`Audio player error in guild ${guildId}`, error);
        });
    }

    public async joinChannel(member: GuildMember): Promise<AppResult<void>> {
        const voiceChannel = member.voice.channel;
        
        if (!voiceChannel) {
            return err(createError(
                ErrorType.Validation,
                'You must be in a voice channel to use this command'
            ));
        }

        if (!(voiceChannel instanceof VoiceChannel || voiceChannel instanceof StageChannel)) {
            return err(createError(
                ErrorType.Validation,
                'Invalid voice channel type'
            ));
        }

        try {
            const connection = joinVoiceChannel({
                channelId: voiceChannel.id,
                guildId: voiceChannel.guild.id,
                adapterCreator: voiceChannel.guild.voiceAdapterCreator,
            });

            this.setupConnectionHandlers(connection, voiceChannel.guild.id);
            this.connections.set(voiceChannel.guild.id, connection);

            // Wait for the connection to be ready
            await entersState(connection, VoiceConnectionStatus.Ready, 5000);

            // Create and set up audio player if it doesn't exist
            if (!this.players.has(voiceChannel.guild.id)) {
                const player = createAudioPlayer();
                this.setupPlayerHandlers(player, voiceChannel.guild.id);
                this.players.set(voiceChannel.guild.id, player);
                connection.subscribe(player);
            }

            logger.info(`Joined voice channel in guild ${voiceChannel.guild.id}`);
            return handleAsync(Promise.resolve());
        } catch (error) {
            return err(createError(
                ErrorType.Discord,
                'Failed to join voice channel',
                error
            ));
        }
    }

    public async playLocalAudio(
        guildId: string, 
        filePath: string
    ): Promise<AppResult<void>> {
        const connection = this.connections.get(guildId);
        const player = this.players.get(guildId);

        if (!connection || !player) {
            return err(createError(
                ErrorType.Validation,
                'Not connected to a voice channel in this server'
            ));
        }

        try {
            // Validate file exists and has correct extension
            if (!filePath.match(/\.(mp3|wav|ogg|m4a)$/i)) {
                return err(createError(
                    ErrorType.Validation,
                    'Invalid audio file format. Supported formats: mp3, wav, ogg, m4a'
                ));
            }

            const resource = createAudioResource(filePath);
            player.play(resource);

            // Wait for the player to start playing
            await entersState(player, AudioPlayerStatus.Playing, 5000);

            logger.info(`Started playing audio in guild ${guildId}`, {
                file: path.basename(filePath)
            });

            return handleAsync(Promise.resolve());
        } catch (error) {
            return err(createError(
                ErrorType.Discord,
                'Failed to play audio file',
                error
            ));
        }
    }

    public async leaveChannel(guildId: string): Promise<AppResult<void>> {
        const connection = this.connections.get(guildId);
        const player = this.players.get(guildId);

        if (!connection) {
            return err(createError(
                ErrorType.Validation,
                'Not connected to a voice channel in this server'
            ));
        }

        try {
            if (player) {
                player.stop();
                this.players.delete(guildId);
            }

            connection.destroy();
            this.connections.delete(guildId);

            logger.info(`Left voice channel in guild ${guildId}`);
            return handleAsync(Promise.resolve());
        } catch (error) {
            return err(createError(
                ErrorType.Discord,
                'Failed to leave voice channel',
                error
            ));
        }
    }
} 