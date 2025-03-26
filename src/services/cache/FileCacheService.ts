import fs from 'fs/promises';
import path from 'path';
import { logger } from '../logger/LoggerService';
import { AppResult, ErrorType } from '../../types/error';
import { err, ok } from 'neverthrow';
import { VideoInfo } from '../../types/youtube';

interface CacheEntry {
    data: VideoInfo;
    createdAt: number;
    accessedAt: number;
}

export class FileCacheService {
    private static instance: FileCacheService | null = null;
    private readonly cacheDir: string;

    private constructor() {
        this.cacheDir = path.join(process.cwd(), 'data', 'cache');
        this.initializeCache();
        logger.debug('FileCacheService initialized', { cacheDir: this.cacheDir });
    }

    public static getInstance(): FileCacheService {
        if (!FileCacheService.instance) {
            FileCacheService.instance = new FileCacheService();
        }
        return FileCacheService.instance;
    }

    private async initializeCache(): Promise<void> {
        try {
            await fs.mkdir(this.cacheDir, { recursive: true });
        } catch (error) {
            logger.error('Error initializing cache directory', error);
        }
    }

    private getCacheFilePath(key: string): string {
        // Create a safe filename from the URL
        const safeKey = Buffer.from(key).toString('base64url');
        return path.join(this.cacheDir, `${safeKey}.json`);
    }

    public async get(key: string): Promise<AppResult<VideoInfo | null>> {
        try {
            const filePath = this.getCacheFilePath(key);
            
            try {
                const fileContent = await fs.readFile(filePath, 'utf-8');
                const cacheEntry: CacheEntry = JSON.parse(fileContent);

                // Update last accessed time
                cacheEntry.accessedAt = Date.now();
                await fs.writeFile(filePath, JSON.stringify(cacheEntry, null, 2));

                return ok(cacheEntry.data);
            } catch (error) {
                if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
                    return ok(null);
                }
                throw error;
            }
        } catch (error) {
            logger.error('Error reading from cache', error);
            return err({
                type: ErrorType.FileSystem,
                message: 'Failed to read from cache',
                originalError: error
            });
        }
    }

    public async set(key: string, value: VideoInfo): Promise<AppResult<void>> {
        try {
            const filePath = this.getCacheFilePath(key);
            const cacheEntry: CacheEntry = {
                data: value,
                createdAt: Date.now(),
                accessedAt: Date.now()
            };

            await fs.writeFile(filePath, JSON.stringify(cacheEntry, null, 2));
            return ok(undefined);
        } catch (error) {
            logger.error('Error writing to cache', error);
            return err({
                type: ErrorType.FileSystem,
                message: 'Failed to write to cache',
                originalError: error
            });
        }
    }

    public async cleanOldEntries(maxAgeHours: number): Promise<AppResult<void>> {
        try {
            const files = await fs.readdir(this.cacheDir);
            const maxAgeMs = maxAgeHours * 60 * 60 * 1000;
            const now = Date.now();

            for (const file of files) {
                try {
                    const filePath = path.join(this.cacheDir, file);
                    const content = await fs.readFile(filePath, 'utf-8');
                    const cacheEntry: CacheEntry = JSON.parse(content);

                    if (now - cacheEntry.accessedAt > maxAgeMs) {
                        await fs.unlink(filePath);
                        logger.debug('Removed old cache entry', { file });
                    }
                } catch (error) {
                    logger.error('Error processing cache file', error, { file });
                }
            }

            return ok(undefined);
        } catch (error) {
            logger.error('Error cleaning old cache entries', error);
            return err({
                type: ErrorType.FileSystem,
                message: 'Failed to clean old cache entries',
                originalError: error
            });
        }
    }
}