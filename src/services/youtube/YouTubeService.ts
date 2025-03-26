import youtubeDl from 'youtube-dl-exec';
import { logger } from '../logger/LoggerService';
import { AppResult, ErrorType, YouTubeError } from '../../types/error';
import { err, ok } from 'neverthrow';
import { FileCacheService } from '../cache/FileCacheService';
import { 
    VideoInfo, 
    SearchResult, 
    YouTubeDlOptions, 
    PlaylistInfo, 
    PlaylistEntry 
} from '../../types/youtube';
import { YouTubeServiceState } from '../../types/services';

const DEFAULT_HEADERS = [
    'referer:youtube.com',
    'user-agent:Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'accept:text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
    'accept-language:en-US,en;q=0.9',
    'sec-ch-ua:"Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"',
    'sec-ch-ua-mobile:?0',
    'sec-ch-ua-platform:"Windows"',
    'sec-fetch-dest:document',
    'sec-fetch-mode:navigate',
    'sec-fetch-site:none',
    'sec-fetch-user:?1',
    'upgrade-insecure-requests:1'
];

export class YouTubeService {
    private static instance: YouTubeService | null = null;
    private cacheService: FileCacheService;
    private readonly CACHE_CLEANUP_INTERVAL = 6 * 60 * 60 * 1000; // 6 hours
    private readonly CACHE_MAX_AGE_HOURS = 6; // 6 hours

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
            const youtubeError: YouTubeError = {
                type: ErrorType.YouTube,
                message: 'Failed to execute youtube-dl',
                originalError: error,
                videoId: this.extractVideoId(url),
                playlistId: this.extractPlaylistId(url)
            };
            
            logger.error('Error executing youtube-dl', youtubeError);
            return err(youtubeError);
        }
    }

    private extractVideoId(url: string): string | undefined {
        const match = url.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=))([^?&]+)/);
        return match?.[1];
    }

    private extractPlaylistId(url: string): string | undefined {
        const match = url.match(/[&?]list=([^&]+)/i);
        return match?.[1];
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

    public isPlaylistUrl(url: string): boolean {
        return url.includes('list=');
    }

    public async getPlaylistVideos(url: string): Promise<AppResult<VideoInfo[]>> {
        logger.debug('Fetching playlist videos', { url });

        try {
            const playlistResult = await this.executeYoutubeDl(url, {
                dumpSingleJson: true,
                noWarnings: true,
                flatPlaylist: true,
                yesPlaylist: true
            });

            if (playlistResult.isErr()) {
                return playlistResult;
            }

            const playlist = playlistResult.value;
            
            if (!playlist || !playlist.entries || !Array.isArray(playlist.entries)) {
                logger.error('Invalid playlist format', { playlist });
                return err({
                    type: ErrorType.Validation,
                    message: 'Could not parse playlist information'
                });
            }

            const videos: VideoInfo[] = playlist.entries.map((entry: any) => {
                // Get the best quality thumbnail
                const thumbnail = entry.thumbnails ? 
                    entry.thumbnails.reduce((best: any, current: any) => 
                        (!best || current.height > best.height) ? current : best
                    ).url : '';

                return {
                    title: entry.title || 'Unknown Title',
                    url: entry.webpage_url || entry.url || '',
                    duration: entry.duration_string || this.formatDuration(entry.duration) || '0:00',
                    thumbnail: thumbnail,
                    description: entry.description,
                    views: entry.view_count
                    // Don't fetch audioUrl here - it will be fetched when needed
                };
            });

            logger.info(`Successfully extracted ${videos.length} videos from playlist`, { url });
            return ok(videos);
        } catch (error) {
            logger.error('Error fetching playlist', error);
            return err({
                type: ErrorType.Network,
                message: 'Failed to fetch playlist information',
                originalError: error
            });
        }
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
                audioUrl: entry.url
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
        logger.debug('Fetching audio URL for video', { url });
        
        try {
            const result = await this.executeYoutubeDl(url, {
                dumpSingleJson: true,
                noWarnings: true,
                format: 'bestaudio',
                extractAudio: true
            });

            if (result.isErr()) {
                return result;
            }

            const info = result.value;
            if (!info || typeof info !== 'object') {
                return err({
                    type: ErrorType.Validation,
                    message: 'Could not parse video information'
                });
            }

            const audioUrl = info.url || (info.formats && info.formats[0]?.url);
            if (!audioUrl) {
                return err({
                    type: ErrorType.Validation,
                    message: 'Could not extract audio URL'
                });
            }

            const videoInfo: VideoInfo = {
                title: info.title || 'Unknown Title',
                url: info.webpage_url || url,
                duration: info.duration_string || this.formatDuration(info.duration) || '0:00',
                thumbnail: info.thumbnail || '',
                description: info.description,
                views: info.view_count,
                audioUrl: audioUrl
            };

            return ok(videoInfo);
        } catch (error) {
            logger.error('Error getting audio URL', error);
            return err({
                type: ErrorType.Network,
                message: 'Failed to get audio URL',
                originalError: error
            });
        }
    }
} 