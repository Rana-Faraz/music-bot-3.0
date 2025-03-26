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
import { 
    AppResult, 
    ErrorType, 
    DiscordError, 
    createError, 
    handleAsync 
} from '../../types/error';
import { err, ok } from 'neverthrow';
import { EventEmitter } from 'events';
import { VideoInfo } from '../../types/youtube';
import { VoiceServiceState, VoiceServiceEvents } from '../../types/services';
import { 
    TrackEventData, 
    TrackErrorEventData, 
    ConnectionEventData,
    BotEvent 
} from '../../types/events';
import { YouTubeService } from '../youtube/YouTubeService';
import { QueuedTrack } from '../../types/queue';

export class VoiceService extends EventEmitter {
    private static instance: VoiceService;
    private state: VoiceServiceState;

    private constructor() {
        super();
        this.state = {
            connections: new Map(),
            players: new Map()
        };
        logger.debug('VoiceService initialized');
    }

    public static getInstance(): VoiceService {
        if (!VoiceService.instance) {
            VoiceService.instance = new VoiceService();
        }
        return VoiceService.instance;
    }

    private createEventData(guildId: string, channelId: string | null | undefined): ConnectionEventData {
        return {
            guildId,
            channelId: channelId ?? '',
            timestamp: new Date()
        };
    }

    private setupConnectionHandlers(connection: VoiceConnection, guildId: string): void {
        connection.on('stateChange', (_, newState) => {
            logger.debug(`Voice connection state changed for guild ${guildId}`, {
                state: newState.status
            });
        });

        connection.on(VoiceConnectionStatus.Disconnected, () => {
            logger.debug(`Voice connection disconnected for guild ${guildId}`);
            this.emit(BotEvent.ConnectionDisconnected, this.createEventData(guildId, connection.joinConfig.channelId));
        });

        connection.on('error', (error) => {
            const discordError: DiscordError = {
                type: ErrorType.Discord,
                message: 'Voice connection error',
                originalError: error,
                guildId,
                channelId: connection.joinConfig.channelId
            };
            logger.error(`Voice connection error in guild ${guildId}`, discordError);
            this.emit(BotEvent.Error, discordError);
        });
    }

    private setupPlayerHandlers(guildId: string): void {
        const player = this.state.players.get(guildId);
        if (!player) return;

        player.on('stateChange', (oldState, newState) => {
            logger.debug('Player state changed', {
                guildId,
                oldState: oldState.status,
                newState: newState.status
            });

            if (oldState.status === AudioPlayerStatus.Playing && newState.status === AudioPlayerStatus.Idle) {
                const track = this.getCurrentTrack(guildId);
                if (track) {
                    const eventData: TrackEventData = {
                        guildId,
                        track,
                        timestamp: new Date()
                    };
                    this.emit(BotEvent.TrackEnd, eventData);
                }
            }
        });

        player.on('error', (error) => {
            logger.error('Player error', { guildId, error });
            const track = this.getCurrentTrack(guildId);
            if (track) {
                const eventData: TrackErrorEventData = {
                    guildId,
                    track,
                    timestamp: new Date(),
                    error: {
                        type: ErrorType.Discord,
                        message: 'Audio player error',
                        originalError: error
                    }
                };
                this.emit(BotEvent.TrackError, eventData);
            }
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
            const existingConnection = this.state.connections.get(guildId);
            const existingPlayer = this.state.players.get(guildId);

            // If we're already in this voice channel, just return
            if (existingConnection && existingConnection.joinConfig.channelId === voiceChannel.id) {
                logger.debug('Already in the requested voice channel', {
                    guildId,
                    channelId: voiceChannel.id
                });
                return ok(undefined);
            }

            // If we're in a different channel, destroy the old connection
            if (existingConnection) {
                logger.debug('Moving to new voice channel', {
                    guildId,
                    oldChannelId: existingConnection.joinConfig.channelId,
                    newChannelId: voiceChannel.id
                });
                existingConnection.destroy();
                this.state.connections.delete(guildId);
            }

            // Create new connection
            const connection = joinVoiceChannel({
                channelId: voiceChannel.id,
                guildId: voiceChannel.guild.id,
                adapterCreator: voiceChannel.guild.voiceAdapterCreator,
            });

            this.setupConnectionHandlers(connection, guildId);
            this.state.connections.set(guildId, connection);

            // Wait for the connection to be ready
            await entersState(connection, VoiceConnectionStatus.Ready, 5000);

            // Reuse existing player or create a new one
            if (!existingPlayer) {
                const player = createAudioPlayer();
                this.state.players.set(guildId, player);
                this.setupPlayerHandlers(guildId);
            }

            // Subscribe the connection to the player (existing or new)
            connection.subscribe(this.state.players.get(guildId)!);

            logger.info(`Joined voice channel in guild ${guildId}`, {
                channelId: voiceChannel.id,
                wasMove: !!existingConnection
            });
            
            return ok(undefined);
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
        const connection = this.state.connections.get(guildId);
        const player = this.state.players.get(guildId);

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

            this.emit(BotEvent.TrackStart, this.createEventData(guildId, connection.joinConfig.channelId));

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
        const player = this.state.players.get(guildId);
        if (player) {
            player.stop();
            logger.debug('Stopped playback', { guildId });
        }
    }

    public async leaveChannel(guildId: string): Promise<void> {
        const connection = this.state.connections.get(guildId);
        if (connection) {
            // Emit event before leaving
            this.emit(BotEvent.BeforeDisconnect, this.createEventData(guildId, connection.joinConfig.channelId));
            
            // Stop playback and leave
            this.stopPlayback(guildId);
            connection.destroy();
            this.state.connections.delete(guildId);
            this.state.players.delete(guildId);
            
            // Emit event after leaving
            this.emit(BotEvent.AfterDisconnect, this.createEventData(guildId, connection.joinConfig.channelId));
            logger.debug('Left voice channel', { guildId });
        }
    }

    public pausePlayback(guildId: string): void {
        const player = this.state.players.get(guildId);
        if (player) {
            player.pause();
            const connection = this.state.connections.get(guildId);
            this.emit(BotEvent.TrackPause, this.createEventData(guildId, connection?.joinConfig.channelId));
        }
    }

    public resumePlayback(guildId: string): void {
        const player = this.state.players.get(guildId);
        if (player) {
            player.unpause();
            const connection = this.state.connections.get(guildId);
            this.emit(BotEvent.TrackResume, this.createEventData(guildId, connection?.joinConfig.channelId));
        }
    }

    private getCurrentTrack(guildId: string): QueuedTrack | null {
        // This is a placeholder - you'll need to implement this method
        // by either storing the current track in the state or getting it from the QueueService
        return null;
    }
}