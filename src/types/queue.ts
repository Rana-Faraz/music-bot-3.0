import { VideoInfo } from '../types/youtube';
import { GuildMember } from 'discord.js';

export enum LoopMode {
    NONE = 'none',
    TRACK = 'track',
    QUEUE = 'queue'
}

export interface TrackState {
    startedAt: Date | null;
    pausedAt: Date | null;
    totalPausedDuration: number; // in milliseconds
    isPaused: boolean;
    wasSkipped: boolean;
}

export interface QueuedTrack {
    info: VideoInfo;
    requestedBy: GuildMember;
    addedAt: Date;
    state: TrackState;
}

export interface GuildQueue {
    tracks: QueuedTrack[];
    currentTrack: QueuedTrack | null;
    isPlaying: boolean;
    lastActivity: Date;
    trackHistory: QueuedTrack[];
    loopMode: LoopMode;
}