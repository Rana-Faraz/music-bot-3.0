import youtubeDl from 'youtube-dl-exec';
import { logger } from '../logger/LoggerService';
import { AppResult, ErrorType } from '../../utils/error';
import { err, ok } from 'neverthrow';
import { FileCacheService } from '../cache/FileCacheService';

export interface VideoInfo {
    title: string;
    url: string;
    duration: string;
    thumbnail: string;
    description?: string;
    views?: number;
    audioUrl?: string;
}

export interface SearchResult {
    items: VideoInfo[];
    totalResults: number;
}

interface YouTubeSearchEntry {
    title: string;
    webpage_url: string;
    duration_string: string;
    thumbnail: string;
    description?: string;
    view_count?: number;
}

interface YouTubeDlOptions {
    format?: string;
    getUrl?: boolean;
    noWarnings?: boolean;
    preferFreeFormats?: boolean;
    dumpSingleJson?: boolean;
    addHeader?: string[];
    extractAudio?: boolean;
    maxResults?: number;
    flatPlaylist?: boolean;
    yesPlaylist?: boolean;
}

const DEFAULT_HEADERS = [
    'referer:youtube.com',
    'user-agent:Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
];

export class YouTubeService {
    private static instance: YouTubeService | null = null;
    private cacheService: FileCacheService;
    private readonly CACHE_CLEANUP_INTERVAL = 6 * 60 * 60 * 1000; // 6 hours
    private readonly CACHE_MAX_AGE_HOURS = 24; // 24 hours

    private constructor() {
        this.cacheService = FileCacheService.getInstance();
        this.setupCacheCleanup();
        logger.debug('YouTubeService initialized');
    }

    public static getInstance(): YouTubeService {
        if (!YouTubeService.instance) {
            YouTubeService.instance = new YouTubeService();
        }
        return YouTubeService.instance;
    }

    private setupCacheCleanup(): void {
        // Clean cache on startup
        this.cleanCache();
        
        // Set up periodic cleanup
        setInterval(() => {
            this.cleanCache();
        }, this.CACHE_CLEANUP_INTERVAL);
    }

    private async cleanCache(): Promise<void> {
        logger.debug('Starting cache cleanup');
        const result = await this.cacheService.cleanOldEntries(this.CACHE_MAX_AGE_HOURS);
        if (result.isErr()) {
            logger.error('Failed to clean cache', result.error);
        } else {
            logger.debug('Cache cleanup completed');
        }
    }

    private async executeYoutubeDl(url: string, options: YouTubeDlOptions): Promise<AppResult<any>> {
        try {
            logger.debug('Executing youtube-dl with options', { url, options });
            
            const result = await youtubeDl(url, {
                ...options,
                addHeader: [...(options.addHeader || []), ...DEFAULT_HEADERS]
            });

            logger.debug('youtube-dl execution successful', { resultType: typeof result });
            return ok(result);
        } catch (error) {
            logger.error('Error executing youtube-dl', error, {
                url,
                options,
                errorType: ErrorType.Network,
                errorMessage: error instanceof Error ? error.message : 'Unknown error'
            });
            return err({
                type: ErrorType.Network,
                message: 'Failed to execute youtube-dl',
                originalError: error
            });
        }
    }

    public async getVideoInfoWithAudio(url: string): Promise<AppResult<VideoInfo>> {
        logger.debug('Fetching video info with audio URL', { url });

        // Check cache first
        const cachedResult = await this.cacheService.get(url);
        if (cachedResult.isOk() && cachedResult.value) {
            logger.debug('Found video info in cache', { url });
            return ok(cachedResult.value);
        }

        // If not in cache, fetch from YouTube
        const infoResult = await this.executeYoutubeDl(url, {
            dumpSingleJson: true,
            noWarnings: true,
            format: 'bestaudio',
            extractAudio: true
        });

        if (infoResult.isErr()) {
            return infoResult;
        }

        const info = infoResult.value;
        if (!info || typeof info !== 'object') {
            logger.debug('Invalid video info format', { info });
            return err({
                type: ErrorType.Validation,
                message: 'Could not parse video information'
            });
        }

        // Get the audio URL from the formats
        const audioUrl = info.url || (info.formats && info.formats[0]?.url);
        if (!audioUrl) {
            logger.error('No audio URL found in video info', { formats: info.formats });
            return err({
                type: ErrorType.Validation,
                message: 'Could not extract audio URL'
            });
        }

        const videoInfo: VideoInfo = {
            title: info.title || 'Unknown Title',
            url: info.webpage_url || url,
            duration: info.duration_string || '0:00',
            thumbnail: info.thumbnail || '',
            description: info.description,
            views: info.view_count,
            audioUrl: audioUrl
        };

        // Save to cache
        await this.cacheService.set(url, videoInfo);
        logger.debug('Successfully cached video info', { url });

        return ok(videoInfo);
    }

    public isValidYouTubeUrl(url: string): boolean {
        const youtubeRegex = /^(https?:\/\/)?(www\.)?(youtube\.com|youtu\.be)\/.+$/;
        const isValid = youtubeRegex.test(url);
        logger.debug('Validating YouTube URL', { url, isValid });
        return isValid;
    }

    public async searchVideos(query: string, maxResults: number = 5): Promise<AppResult<SearchResult>> {
        logger.debug('Searching for videos', { query, maxResults });

        const searchUrl = `ytsearch${maxResults}:${query}`;
        const searchResult = await this.executeYoutubeDl(searchUrl, {
            dumpSingleJson: true,
            noWarnings: true,
            flatPlaylist: true,
            yesPlaylist: true,
        });

        if (searchResult.isErr()) {
            return searchResult;
        }

        const results = searchResult.value;
        logger.debug("Results for search", {searchResult});
        
        if (!results || !results.entries || !Array.isArray(results.entries)) {
            logger.error('Invalid search results format', { results });
            return err({
                type: ErrorType.Validation,
                message: 'Could not parse search results'
            });
        }

        const items: VideoInfo[] = results.entries.map((entry: any) => {
            // Get the best quality thumbnail
            const thumbnail = entry.thumbnails ? 
                entry.thumbnails.reduce((best: any, current: any) => 
                    (!best || current.height > best.height) ? current : best
                ).url : '';

            return {
                title: entry.title || 'Unknown Title',
                url: entry.url || '',
                duration: this.formatDuration(entry.duration) || '0:00',
                thumbnail: thumbnail,
                description: entry.description,
                views: entry.view_count,
                // Don't set audioUrl here as it requires a separate request
            };
        });

        return ok({
            items,
            totalResults: items.length
        });
    }

    private formatDuration(seconds: number): string {
        if (!seconds) return '0:00';
        
        const minutes = Math.floor(seconds / 60);
        const remainingSeconds = seconds % 60;
        
        if (minutes >= 60) {
            const hours = Math.floor(minutes / 60);
            const remainingMinutes = minutes % 60;
            return `${hours}:${remainingMinutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
        }
        
        return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
    }

    public async getAudioUrlForVideo(url: string): Promise<AppResult<VideoInfo>> {
        // Reuse existing getVideoInfoWithAudio method as it already handles this functionality
        return this.getVideoInfoWithAudio(url);
    }
} 