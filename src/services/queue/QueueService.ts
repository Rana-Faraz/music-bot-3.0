import { GuildMember } from 'discord.js';
import { VideoInfo } from '../youtube/YouTubeService';
import { GuildQueue, QueuedTrack } from '../../types/queue';
import { logger } from '../logger/LoggerService';
import { AppResult, ErrorType } from '../../utils/error';
import { err, ok } from 'neverthrow';
import { VoiceService } from '../voice/VoiceService';
import { LoopMode } from '../../types/queue';

export class QueueService {
    private static instance: QueueService;
    private queues: Map<string, GuildQueue>;
    private voiceService: VoiceService;
    private readonly MAX_HISTORY_SIZE = 50;

    private constructor() {
        this.queues = new Map();
        this.voiceService = VoiceService.getInstance();
        this.setupVoiceServiceHandlers();
        logger.debug('QueueService initialized');
    }

    private setupVoiceServiceHandlers(): void {
        this.voiceService.on('connectionDisconnected', (guildId: string) => {
            logger.debug(`Voice connection disconnected for guild ${guildId}`);
            this.clearQueue(guildId);
        });

        this.voiceService.on('trackStart', (guildId: string) => {
            this.handleTrackStart(guildId);
        });

        this.voiceService.on('trackEnd', (guildId: string) => {
            this.handleTrackEnd(guildId, false);
        });

        this.voiceService.on('trackPause', (guildId: string) => {
            this.handleTrackPause(guildId);
        });

        this.voiceService.on('trackResume', (guildId: string) => {
            this.handleTrackResume(guildId);
        });

        this.voiceService.on('trackError', (guildId: string, error: Error) => {
            logger.error('Track playback error', { guildId, error });
            this.handleTrackEnd(guildId, true);
        });
    }

    public static getInstance(): QueueService {
        if (!QueueService.instance) {
            QueueService.instance = new QueueService();
        }
        return QueueService.instance;
    }

    private getOrCreateQueue(guildId: string): GuildQueue {
        if (!this.queues.has(guildId)) {
            this.queues.set(guildId, {
                tracks: [],
                currentTrack: null,
                isPlaying: false,
                lastActivity: new Date(),
                trackHistory: [],
                loopMode: LoopMode.NONE
            });
        }
        return this.queues.get(guildId)!;
    }

    private handleTrackStart(guildId: string): void {
        const queue = this.getQueue(guildId);
        if (queue?.currentTrack) {
            queue.currentTrack.state.startedAt = new Date();
            queue.currentTrack.state.isPaused = false;
            logger.info('Track started', {
                guildId,
                track: queue.currentTrack.info.title,
                startedAt: queue.currentTrack.state.startedAt,
                loopMode: queue.loopMode
            });
        }
    }

    private handleTrackPause(guildId: string): void {
        const queue = this.getQueue(guildId);
        if (queue?.currentTrack) {
            queue.currentTrack.state.pausedAt = new Date();
            queue.currentTrack.state.isPaused = true;
            logger.debug('Track paused', {
                guildId,
                track: queue.currentTrack.info.title,
                pausedAt: queue.currentTrack.state.pausedAt
            });
        }
    }

    private handleTrackResume(guildId: string): void {
        const queue = this.getQueue(guildId);
        if (queue?.currentTrack) {
            const track = queue.currentTrack;
            if (track.state.pausedAt) {
                const pauseDuration = new Date().getTime() - track.state.pausedAt.getTime();
                track.state.totalPausedDuration += pauseDuration;
            }
            track.state.pausedAt = null;
            track.state.isPaused = false;
            logger.debug('Track resumed', {
                guildId,
                track: track.info.title,
                totalPausedDuration: track.state.totalPausedDuration
            });
        }
    }

    private async playNextTrack(guildId: string, queue: GuildQueue): Promise<void> {
        if (!queue.tracks.length) {
            queue.currentTrack = null;
            queue.isPlaying = false;
            logger.debug('No more tracks in queue', { guildId });
            return;
        }

        const nextTrack = queue.tracks.shift()!;
        queue.currentTrack = nextTrack;
        queue.isPlaying = true;

        logger.debug('Playing next track', {
            guildId,
            track: nextTrack.info.title,
            remainingTracks: queue.tracks.length
        });

        try {
            await this.voiceService.playYouTubeAudio(guildId, nextTrack.info.audioUrl || nextTrack.info.url);
        } catch (error) {
            logger.error('Error playing next track', error);
            queue.isPlaying = false;
            queue.currentTrack = null;
            // Try to play the next track if available
            await this.playNextTrack(guildId, queue);
        }
    }

    private addToHistory(queue: GuildQueue, track: QueuedTrack): void {
        queue.trackHistory.push(track);
        if (queue.trackHistory.length > this.MAX_HISTORY_SIZE) {
            queue.trackHistory.shift();
        }
    }

    private handleTrackEnd(guildId: string, isError: boolean): void {
        const queue = this.getQueue(guildId);
        if (!queue?.currentTrack) return;

        const endedTrack = queue.currentTrack;
        
        // Log track completion metrics
        if (!isError && endedTrack.state.startedAt) {
            const endTime = new Date();
            const totalDuration = endTime.getTime() - endedTrack.state.startedAt.getTime();
            const actualPlaytime = totalDuration - endedTrack.state.totalPausedDuration;

            logger.info('Track ended', {
                guildId,
                track: endedTrack.info.title,
                totalDuration,
                actualPlaytime,
                pausedDuration: endedTrack.state.totalPausedDuration,
                loopMode: queue.loopMode,
                wasSkipped: endedTrack.state.wasSkipped
            });
        }

        // Only apply loop mode logic if the track wasn't skipped
        if (!endedTrack.state.wasSkipped) {
            switch (queue.loopMode) {
                case LoopMode.TRACK:
                    if (!isError) {
                        this.voiceService.playYouTubeAudio(guildId, endedTrack.info.audioUrl || endedTrack.info.url);
                        return;
                    }
                    break;

                case LoopMode.QUEUE:
                    queue.tracks.push({
                        ...endedTrack,
                        state: {
                            startedAt: null,
                            pausedAt: null,
                            totalPausedDuration: 0,
                            isPaused: false,
                            wasSkipped: false
                        }
                    });
                    break;

                case LoopMode.NONE:
                    this.addToHistory(queue, endedTrack);
                    break;
            }
        } else {
            // If track was skipped, always add it to history regardless of loop mode
            this.addToHistory(queue, endedTrack);
        }

        this.playNextTrack(guildId, queue);
    }

    public async addToQueue(
        guildId: string,
        videoInfo: VideoInfo,
        member: GuildMember
    ): Promise<AppResult<QueuedTrack>> {
        try {
            const queue = this.getOrCreateQueue(guildId);
            const track: QueuedTrack = {
                info: videoInfo,
                requestedBy: member,
                addedAt: new Date(),
                state: {
                    startedAt: null,
                    pausedAt: null,
                    totalPausedDuration: 0,
                    isPaused: false,
                    wasSkipped: false
                }
            };

            queue.tracks.push(track);
            queue.lastActivity = new Date();

            logger.debug('Added track to queue', {
                guildId,
                title: videoInfo.title,
                queueLength: queue.tracks.length
            });

            // If nothing is playing, start playing
            if (!queue.isPlaying) {
                return this.processQueue(guildId);
            }

            return ok(track);
        } catch (error) {
            logger.error('Error adding to queue', error);
            return err({
                type: ErrorType.Unknown,
                message: 'Failed to add track to queue',
                originalError: error
            });
        }
    }

    public async processQueue(guildId: string): Promise<AppResult<QueuedTrack>> {
        const queue = this.getOrCreateQueue(guildId);
        
        if (queue.tracks.length === 0) {
            logger.debug('Queue is empty', { guildId });
            queue.isPlaying = false;
            queue.currentTrack = null;
            return err({
                type: ErrorType.Validation,
                message: 'Queue is empty'
            });
        }

        try {
            const track = queue.tracks.shift()!;
            queue.currentTrack = track;
            queue.isPlaying = true;
            queue.lastActivity = new Date();

            logger.debug('Processing track', {
                guildId,
                title: track.info.title,
                remainingTracks: queue.tracks.length
            });

            const playResult = await this.voiceService.playYouTubeAudio(guildId, track.info.audioUrl || track.info.url);
            if (playResult.isErr()) {
                return err(playResult.error);
            }

            return ok(track);
        } catch (error) {
            logger.error('Error processing queue', error);
            return err({
                type: ErrorType.Unknown,
                message: 'Failed to process queue',
                originalError: error
            });
        }
    }

    public skipTrack(guildId: string): AppResult<void> {
        const queue = this.queues.get(guildId);
        if (!queue || !queue.isPlaying) {
            return err({
                type: ErrorType.Validation,
                message: 'No track is currently playing'
            });
        }

        logger.debug('Skipping current track', {
            guildId,
            currentTrack: queue.currentTrack?.info.title,
            queueLength: queue.tracks.length
        });

        // Set a flag to indicate this track was skipped
        if (queue.currentTrack) {
            queue.currentTrack.state.wasSkipped = true;
        }

        // Stop current playback - this will trigger handleTrackEnd through the event
        this.voiceService.stopPlayback(guildId);
        return ok(undefined);
    }

    public clearQueue(guildId: string): AppResult<void> {
        const queue = this.queues.get(guildId);
        if (!queue) {
            return err({
                type: ErrorType.Validation,
                message: 'No queue exists for this server'
            });
        }

        logger.debug('Clearing queue', {
            guildId,
            tracksCleared: queue.tracks.length
        });

        this.voiceService.stopPlayback(guildId);
        this.voiceService.leaveChannel(guildId);
        this.queues.delete(guildId);

        return ok(undefined);
    }

    public getQueue(guildId: string): GuildQueue | undefined {
        const queue = this.queues.get(guildId);
        if (queue) {
            queue.lastActivity = new Date();
        }
        return queue;
    }

    public setLoopMode(guildId: string, mode: LoopMode): AppResult<LoopMode> {
        const queue = this.queues.get(guildId);
        if (!queue) {
            return err({
                type: ErrorType.Validation,
                message: 'No queue exists for this server'
            });
        }

        queue.loopMode = mode;
        logger.debug('Loop mode changed', {
            guildId,
            mode,
            currentTrack: queue.currentTrack?.info.title
        });

        return ok(mode);
    }
} 