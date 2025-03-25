import { Result, ok, err } from 'neverthrow';
import { logger } from '../services/logger/LoggerService';

export enum ErrorType {
    Discord = 'DISCORD_ERROR',
    Configuration = 'CONFIGURATION_ERROR',
    Network = 'NETWORK_ERROR',
    Validation = 'VALIDATION_ERROR',
    Unknown = 'UNKNOWN_ERROR',
    FileSystem = 'FILE_SYSTEM_ERROR'
}

export interface AppError {
    type: ErrorType;
    message: string;
    originalError?: Error | unknown;
    metadata?: Record<string, unknown>;
}

export type AppResult<T> = Result<T, AppError>;

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
): Promise<AppResult<T>> {
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
): AppResult<T> {
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