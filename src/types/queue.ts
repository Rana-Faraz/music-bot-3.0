import { VideoInfo } from '../services/youtube/YouTubeService';
import { GuildMember } from 'discord.js';

export interface TrackState {
    startedAt: Date | null;
    pausedAt: Date | null;
    totalPausedDuration: number; // in milliseconds
    isPaused: boolean;
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
}