import { QueuedTrack } from './queue';
import { AppError } from './error';

export enum BotEvent {
    TrackStart = 'trackStart',
    TrackEnd = 'trackEnd',
    TrackError = 'trackError',
    TrackPause = 'trackPause',
    TrackResume = 'trackResume',
    QueueAdd = 'queueAdd',
    QueueClear = 'queueClear',
    VoiceConnect = 'voiceConnect',
    VoiceDisconnect = 'voiceDisconnect',
    VoiceStateUpdate = 'voiceStateUpdate',
    ConnectionDisconnected = 'connectionDisconnected',
    BeforeDisconnect = 'beforeDisconnect',
    AfterDisconnect = 'afterDisconnect',
    Error = 'error'
}

export enum ButtonCustomId {
    QueuePrevPage = 'queue_prev_page',
    QueueNextPage = 'queue_next_page',
    QueueRefresh = 'queue_refresh',
    QueueSelect = 'queue_select'
}

export interface TrackEventData {
    guildId: string;
    track: QueuedTrack;
    timestamp: Date;
}

export interface TrackErrorEventData extends TrackEventData {
    error: AppError;
}

export interface QueueEventData {
    guildId: string;
    queueLength: number;
    timestamp: Date;
}

export interface ConnectionEventData {
    guildId: string;
    channelId: string | null;
    timestamp: Date;
}

export interface VoiceStateEventData {
    guildId: string;
    channelId?: string;
    oldChannelId?: string;
    timestamp: Date;
}

export type BotEventHandler<T> = (data: T) => Promise<void>;

export interface BotEventMap {
    [BotEvent.TrackStart]: BotEventHandler<TrackEventData>;
    [BotEvent.TrackEnd]: BotEventHandler<TrackEventData>;
    [BotEvent.TrackError]: BotEventHandler<TrackErrorEventData>;
    [BotEvent.TrackPause]: BotEventHandler<ConnectionEventData>;
    [BotEvent.TrackResume]: BotEventHandler<ConnectionEventData>;
    [BotEvent.QueueAdd]: BotEventHandler<QueueEventData>;
    [BotEvent.QueueClear]: BotEventHandler<QueueEventData>;
    [BotEvent.VoiceConnect]: BotEventHandler<ConnectionEventData>;
    [BotEvent.VoiceDisconnect]: BotEventHandler<ConnectionEventData>;
    [BotEvent.VoiceStateUpdate]: BotEventHandler<VoiceStateEventData>;
    [BotEvent.ConnectionDisconnected]: BotEventHandler<ConnectionEventData>;
    [BotEvent.BeforeDisconnect]: BotEventHandler<ConnectionEventData>;
    [BotEvent.AfterDisconnect]: BotEventHandler<ConnectionEventData>;
    [BotEvent.Error]: BotEventHandler<AppError>;
} 