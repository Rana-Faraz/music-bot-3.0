import { Result, ok, err } from 'neverthrow';
import { logger } from '../services/logger/LoggerService';

export enum ErrorType {
    Discord = 'DISCORD_ERROR',
    Configuration = 'CONFIGURATION_ERROR',
    Network = 'NETWORK_ERROR',
    Validation = 'VALIDATION_ERROR',
    Unknown = 'UNKNOWN_ERROR',
    FileSystem = 'FILE_SYSTEM_ERROR',
    YouTube = 'YOUTUBE_ERROR',
    Cache = 'CACHE_ERROR',
    Permission = 'PERMISSION_ERROR'
}

export interface AppError {
    type: ErrorType;
    message: string;
    originalError?: Error | unknown;
    metadata?: Record<string, unknown>;
}

export type AppResult<T> = Result<T, AppError>;

export interface ErrorHandler {
    handle: (error: AppError) => void;
    format: (error: AppError) => string;
}

export interface ValidationError extends AppError {
    type: ErrorType.Validation;
    field?: string;
    value?: unknown;
}

export interface NetworkError extends AppError {
    type: ErrorType.Network;
    statusCode?: number;
    url?: string;
}

export interface DiscordError extends AppError {
    type: ErrorType.Discord;
    guildId?: string;
    channelId?: string | null;
}

export interface YouTubeError extends AppError {
    type: ErrorType.YouTube;
    videoId?: string;
    playlistId?: string;
}

export interface CacheError extends AppError {
    type: ErrorType.Cache;
    key?: string;
    operation?: 'get' | 'set' | 'delete' | 'clear';
}

export interface FileSystemError extends AppError {
    type: ErrorType.FileSystem;
    path?: string;
    operation?: 'read' | 'write' | 'delete' | 'create';
}

export interface ConfigurationError extends AppError {
    type: ErrorType.Configuration;
    configKey?: string;
    expectedType?: string;
}

export interface PermissionError extends AppError {
    type: ErrorType.Permission;
    requiredPermission?: string;
    userPermissions?: string[];
}

export function createError(
    type: ErrorType,
    message: string,
    originalError?: Error | unknown,
    metadata?: Record<string, unknown>
): AppError {
    return {
        type,
        message,
        originalError,
        metadata
    };
}

export async function handleAsync<T>(
    promise: Promise<T>,
    errorType: ErrorType = ErrorType.Unknown
): Promise<Result<T, AppError>> {
    try {
        const result = await promise;
        return ok(result);
    } catch (error) {
        const appError = createError(
            errorType,
            error instanceof Error ? error.message : 'An unknown error occurred',
            error
        );
        logger.error(appError.message, appError.originalError, appError.metadata);
        return err(appError);
    }
}

export function handle<T>(
    fn: () => T,
    errorType: ErrorType = ErrorType.Unknown
): Result<T, AppError> {
    try {
        const result = fn();
        return ok(result);
    } catch (error) {
        const appError = createError(
            errorType,
            error instanceof Error ? error.message : 'An unknown error occurred',
            error
        );
        logger.error(appError.message, appError.originalError, appError.metadata);
        return err(appError);
    }
} 