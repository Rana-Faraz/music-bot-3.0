import { AudioPlayer, VoiceConnection } from '@discordjs/voice';
import { VideoInfo } from './youtube';
import { BotEvent } from './events';
import { AppError } from './error';
import { ConnectionEventData, TrackEventData, TrackErrorEventData } from './events';

export interface VoiceServiceState {
    connections: Map<string, VoiceConnection>;
    players: Map<string, AudioPlayer>;
}

export interface VoiceServiceEvents {
    [BotEvent.ConnectionDisconnected]: (data: ConnectionEventData) => void;
    [BotEvent.BeforeDisconnect]: (data: ConnectionEventData) => void;
    [BotEvent.AfterDisconnect]: (data: ConnectionEventData) => void;
    [BotEvent.TrackStart]: (data: TrackEventData) => void;
    [BotEvent.TrackEnd]: (data: TrackEventData) => void;
    [BotEvent.TrackError]: (data: TrackErrorEventData) => void;
    [BotEvent.TrackPause]: (data: ConnectionEventData) => void;
    [BotEvent.TrackResume]: (data: ConnectionEventData) => void;
    [BotEvent.Error]: (error: AppError) => void;
}

export interface CacheServiceOptions {
    maxAge: number; // in hours
    cleanupInterval: number; // in milliseconds
}

export interface CacheEntry<T> {
    data: T;
    timestamp: number;
}

export interface LoggerOptions {
    level: string;
    format: string;
    logDirectory: string;
    maxFiles: number;
    maxSize: string;
}

export interface YouTubeServiceState {
    cache: Map<string, CacheEntry<VideoInfo>>;
    lastCleanup: Date;
} 