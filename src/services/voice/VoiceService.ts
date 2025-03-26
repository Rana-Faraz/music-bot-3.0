import { 
    AudioPlayer, 
    AudioPlayerStatus, 
    createAudioPlayer, 
    createAudioResource,
    entersState,
    joinVoiceChannel,
    VoiceConnection,
    VoiceConnectionStatus,
    StreamType
} from '@discordjs/voice';
import { GuildMember, VoiceChannel, StageChannel } from 'discord.js';
import { logger } from '../logger/LoggerService';
import { AppResult, ErrorType, handleAsync, createError } from '../../utils/error';
import { err, ok } from 'neverthrow';
import { EventEmitter } from 'events';
import { YouTubeService, VideoInfo } from '../youtube/YouTubeService';

export class VoiceService extends EventEmitter {
    private static instance: VoiceService;
    private connections: Map<string, VoiceConnection>;
    private players: Map<string, AudioPlayer>;

    private constructor() {
        super();
        this.connections = new Map();
        this.players = new Map();
        logger.debug('VoiceService initialized');
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

        connection.on(VoiceConnectionStatus.Disconnected, () => {
            logger.debug(`Voice connection disconnected for guild ${guildId}`);
            this.emit('connectionDisconnected', guildId);
        });

        connection.on('error', (error) => {
            logger.error(`Voice connection error in guild ${guildId}`, error);
        });
    }

    private setupPlayerHandlers(guildId: string): void {
        const player = this.players.get(guildId);
        if (!player) return;

        player.on('stateChange', (oldState, newState) => {
            logger.debug('Player state changed', {
                guildId,
                oldState: oldState.status,
                newState: newState.status
            });

            if (oldState.status === AudioPlayerStatus.Playing && newState.status === AudioPlayerStatus.Idle) {
                this.emit('trackEnd', guildId);
            }
        });

        player.on('error', (error) => {
            logger.error('Player error', { guildId, error });
            this.emit('trackError', guildId, error);
        });
    }

    public async joinChannel(member: GuildMember): Promise<AppResult<void>> {
        const voiceChannel = member.voice.channel;
        const guildId = member.guild.id;
        
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
            const existingConnection = this.connections.get(guildId);
            const existingPlayer = this.players.get(guildId);

            // If we're already in this voice channel, just return
            if (existingConnection && existingConnection.joinConfig.channelId === voiceChannel.id) {
                logger.debug('Already in the requested voice channel', {
                    guildId,
                    channelId: voiceChannel.id
                });
                return handleAsync(Promise.resolve());
            }

            // If we're in a different channel, destroy the old connection
            if (existingConnection) {
                logger.debug('Moving to new voice channel', {
                    guildId,
                    oldChannelId: existingConnection.joinConfig.channelId,
                    newChannelId: voiceChannel.id
                });
                existingConnection.destroy();
                this.connections.delete(guildId);
            }

            // Create new connection
            const connection = joinVoiceChannel({
                channelId: voiceChannel.id,
                guildId: voiceChannel.guild.id,
                adapterCreator: voiceChannel.guild.voiceAdapterCreator,
            });

            this.setupConnectionHandlers(connection, guildId);
            this.connections.set(guildId, connection);

            // Wait for the connection to be ready
            await entersState(connection, VoiceConnectionStatus.Ready, 5000);

            // Reuse existing player or create a new one
            if (!existingPlayer) {
                const player = createAudioPlayer();
                this.players.set(guildId, player);
                this.setupPlayerHandlers(guildId);
            }

            // Subscribe the connection to the player (existing or new)
            connection.subscribe(this.players.get(guildId)!);

            logger.info(`Joined voice channel in guild ${guildId}`, {
                channelId: voiceChannel.id,
                wasMove: !!existingConnection
            });
            
            return handleAsync(Promise.resolve());
        } catch (error) {
            logger.error('Error joining voice channel', { error });
            return err(createError(
                ErrorType.Discord,
                'Failed to join voice channel',
                error
            ));
        }
    }

    public async playYouTubeAudio(
        guildId: string, 
        url: string,
        videoInfo?: VideoInfo
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
            let audioUrl: string;
            
            // If we have videoInfo with audioUrl, use it
            if (videoInfo?.audioUrl) {
                audioUrl = videoInfo.audioUrl;
            } else {
                // Otherwise fetch the audio URL
                const youtubeService = YouTubeService.getInstance();
                const result = await youtubeService.getAudioUrlForVideo(url);
                
                if (result.isErr()) {
                    return err(result.error);
                }
                
                audioUrl = result.value.audioUrl || '';
            }

            if (!audioUrl) {
                return err(createError(
                    ErrorType.Validation,
                    'Could not get audio URL for this video'
                ));
            }

            // Create and play audio resource
            const resource = createAudioResource(audioUrl, {
                inputType: StreamType.Arbitrary,
            });

            player.play(resource);

            // Wait for the player to start playing
            await entersState(player, AudioPlayerStatus.Playing, 5000);

            logger.info(`Started playing YouTube audio in guild ${guildId}`);

            this.emit('trackStart', guildId);

            return ok(undefined);
        } catch (error) {
            return err(createError(
                ErrorType.Discord,
                'Failed to play YouTube audio',
                error
            ));
        }
    }

    public stopPlayback(guildId: string): void {
        const player = this.players.get(guildId);
        if (player) {
            player.stop();
            logger.debug('Stopped playback', { guildId });
        }
    }

    public async leaveChannel(guildId: string): Promise<void> {
        const connection = this.connections.get(guildId);
        if (connection) {
            // Emit event before leaving
            this.emit('beforeDisconnect', guildId);
            
            // Stop playback and leave
            this.stopPlayback(guildId);
            connection.destroy();
            this.connections.delete(guildId);
            this.players.delete(guildId);
            
            // Emit event after leaving
            this.emit('afterDisconnect', guildId);
            logger.debug('Left voice channel', { guildId });
        }
    }

    public pausePlayback(guildId: string): void {
        const player = this.players.get(guildId);
        if (player) {
            player.pause();
            this.emit('trackPause', guildId);
        }
    }

    public resumePlayback(guildId: string): void {
        const player = this.players.get(guildId);
        if (player) {
            player.unpause();
            this.emit('trackResume', guildId);
        }
    }
}