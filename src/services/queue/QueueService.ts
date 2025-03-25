import { GuildMember } from 'discord.js';
import { VideoInfo } from '../youtube/YouTubeService';
import { GuildQueue, QueuedTrack, TrackState } from '../../types/queue';
import { logger } from '../logger/LoggerService';
import { AppResult, ErrorType } from '../../utils/error';
import { err, ok } from 'neverthrow';
import { VoiceService } from '../voice/VoiceService';

export class QueueService {
    private static instance: QueueService;
    private queues: Map<string, GuildQueue>;
    private voiceService: VoiceService;

    private constructor() {
        this.queues = new Map();
        this.voiceService = VoiceService.getInstance();
        this.setupVoiceServiceHandlers();
        logger.debug('QueueService initialized');
    }

    private setupVoiceServiceHandlers(): void {
        this.voiceService.on('trackStart', (guildId: string) => {
            const queue = this.getQueue(guildId);
            if (queue?.currentTrack) {
                queue.currentTrack.state.startedAt = new Date();
                queue.currentTrack.state.isPaused = false;
                logger.info('Track started', {
                    guildId,
                    track: queue.currentTrack.info.title,
                    startedAt: queue.currentTrack.state.startedAt
                });
            }
        });

        this.voiceService.on('trackEnd', (guildId: string) => {
            const queue = this.getQueue(guildId);
            if (queue?.currentTrack) {
                const endedTrack = queue.currentTrack;
                const endTime = new Date();
                const startTime = endedTrack.state.startedAt;
                const pausedDuration = endedTrack.state.totalPausedDuration;

                if (startTime) {
                    const totalDuration = endTime.getTime() - startTime.getTime();
                    const actualPlaytime = totalDuration - pausedDuration;

                    logger.info('Track ended', {
                        guildId,
                        track: endedTrack.info.title,
                        totalDuration: totalDuration,
                        actualPlaytime: actualPlaytime,
                        pausedDuration: pausedDuration
                    });
                }

                // Add to history
                queue.trackHistory.push(endedTrack);
                // Keep only last 50 tracks in history
                if (queue.trackHistory.length > 50) {
                    queue.trackHistory.shift();
                }

                // Process next track if available
                if (queue.tracks.length > 0) {
                    this.processQueue(guildId).catch(error => {
                        logger.error('Error processing next track after end', error);
                    });
                } else {
                    queue.isPlaying = false;
                    queue.currentTrack = null;
                }
            }
        });

        this.voiceService.on('trackPause', (guildId: string) => {
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
        });

        this.voiceService.on('trackResume', (guildId: string) => {
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
        });

        this.voiceService.on('trackError', (guildId: string, error: Error) => {
            logger.error('Track playback error', { guildId, error });
            const queue = this.getQueue(guildId);
            if (queue) {
                // Skip to next track on error
                this.skipTrack(guildId);
            }
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
                trackHistory: []
            });
        }
        return this.queues.get(guildId)!;
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
                    isPaused: false
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
            // Only shift from queue if there's no current track
            const track = queue.currentTrack || queue.tracks.shift()!;
            if (!queue.currentTrack) {
                queue.currentTrack = track;
            }
            queue.isPlaying = true;
            queue.lastActivity = new Date();

            logger.debug('Processing track', {
                guildId,
                title: track.info.title,
                remainingTracks: queue.tracks.length
            });

            const playResult = await this.voiceService.playYouTubeAudio(guildId, track.info.url);
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

        logger.debug('Starting skip operation', {
            guildId,
            currentTrack: queue.currentTrack?.info.title,
            queueLength: queue.tracks.length,
            queueTracks: queue.tracks.map(t => t.info.title)
        });

        // Add current track to history before skipping
        if (queue.currentTrack) {
            queue.trackHistory.push(queue.currentTrack);
            // Keep only last 50 tracks in history
            if (queue.trackHistory.length > 50) {
                queue.trackHistory.shift();
            }
        }

        // Stop current playback
        this.voiceService.stopPlayback(guildId);
        
        // If there are more tracks, process the next one
        if (queue.tracks.length > 0) {
            const nextTrack = queue.tracks.shift();
            if (!nextTrack) {
                return err({
                    type: ErrorType.Unknown,
                    message: 'Failed to get next track from queue'
                });
            }

            logger.debug('Processing next track in skip', {
                guildId,
                nextTrack: nextTrack.info.title,
                remainingTracks: queue.tracks.length
            });

            // Set as current track
            queue.currentTrack = nextTrack;
            queue.isPlaying = true;

            // Play the track
            this.voiceService.playYouTubeAudio(guildId, nextTrack.info.url)
                .catch(error => {
                    logger.error('Error playing next track after skip', error);
                    queue.isPlaying = false;
                    queue.currentTrack = null;
                });
        } else {
            // No more tracks, reset the queue state
            queue.currentTrack = null;
            queue.isPlaying = false;
            logger.debug('No more tracks in queue after skip', { guildId });
        }

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

        queue.tracks = [];
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
} 