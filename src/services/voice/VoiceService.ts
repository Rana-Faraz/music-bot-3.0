import { 
    AudioPlayer, 
    AudioPlayerStatus, 
    AudioResource, 
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
import { err } from 'neverthrow';
import { EventEmitter } from 'events';
import { YouTubeService, VideoInfo } from '../youtube/YouTubeService';

interface TrackStateEvents {
    trackStart: (guildId: string) => void;
    trackEnd: (guildId: string) => void;
    trackPause: (guildId: string) => void;
    trackResume: (guildId: string) => void;
    trackError: (guildId: string, error: Error) => void;
}

export class VoiceService extends EventEmitter {
    private static instance: VoiceService;
    private connections: Map<string, VoiceConnection>;
    private players: Map<string, AudioPlayer>;
    private youtubeService: YouTubeService;

    private constructor() {
        super();
        this.connections = new Map();
        this.players = new Map();
        this.youtubeService = YouTubeService.getInstance();
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

            // Handle state transitions
            if (oldState.status !== AudioPlayerStatus.Playing && newState.status === AudioPlayerStatus.Playing) {
                this.emit('trackStart', guildId);
            } else if (oldState.status === AudioPlayerStatus.Playing && newState.status === AudioPlayerStatus.Idle) {
                this.emit('trackEnd', guildId);
            } else if (oldState.status === AudioPlayerStatus.Playing && newState.status === AudioPlayerStatus.Paused) {
                this.emit('trackPause', guildId);
            } else if (oldState.status === AudioPlayerStatus.Paused && newState.status === AudioPlayerStatus.Playing) {
                this.emit('trackResume', guildId);
            }
        });

        player.on('error', (error) => {
            logger.error('Player error', { guildId, error });
            this.emit('trackError', guildId, error);
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
                this.players.set(voiceChannel.guild.id, player);
                this.setupPlayerHandlers(voiceChannel.guild.id);
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

    public async playYouTubeAudio(
        guildId: string, 
        url: string
    ): Promise<AppResult<VideoInfo>> {
        const connection = this.connections.get(guildId);
        const player = this.players.get(guildId);

        if (!connection || !player) {
            return err(createError(
                ErrorType.Validation,
                'Not connected to a voice channel in this server'
            ));
        }

        if (!this.youtubeService.isValidYouTubeUrl(url)) {
            return err(createError(
                ErrorType.Validation,
                'Invalid YouTube URL'
            ));
        }

        try {
            // Get video info
            const videoInfoResult = await this.youtubeService.getVideoInfo(url);
            if (videoInfoResult.isErr()) {
                return err(videoInfoResult.error);
            }
            const videoInfo = videoInfoResult.value;

            // Get audio URL
            const audioUrlResult = await this.youtubeService.getAudioUrl(url);
            if (audioUrlResult.isErr()) {
                return err(audioUrlResult.error);
            }

            // Create and play audio resource
            const resource = createAudioResource(audioUrlResult.value, {
                inputType: StreamType.Arbitrary,
            });

            player.play(resource);

            // Wait for the player to start playing
            await entersState(player, AudioPlayerStatus.Playing, 5000);

            logger.info(`Started playing YouTube audio in guild ${guildId}`, {
                title: videoInfo.title,
                url: videoInfo.url
            });

            return videoInfoResult;
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
            this.stopPlayback(guildId);
            connection.destroy();
            this.connections.delete(guildId);
            this.players.delete(guildId);
            logger.debug('Left voice channel', { guildId });
        }
    }

    public pausePlayback(guildId: string): void {
        const player = this.players.get(guildId);
        if (player) {
            player.pause();
            logger.debug('Paused playback', { guildId });
        }
    }

    public resumePlayback(guildId: string): void {
        const player = this.players.get(guildId);
        if (player) {
            player.unpause();
            logger.debug('Resumed playback', { guildId });
        }
    }
}