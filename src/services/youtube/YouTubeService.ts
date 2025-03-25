import youtubeDl from 'youtube-dl-exec';
import { logger } from '../logger/LoggerService';
import { AppResult, ErrorType } from '../../utils/error';
import { err, ok } from 'neverthrow';

export interface VideoInfo {
    title: string;
    url: string;
    duration: string;
    thumbnail: string;
    description?: string;
    views?: number;
    audioUrl?: string;
}

interface YouTubeDlOptions {
    format?: string;
    getUrl?: boolean;
    noWarnings?: boolean;
    preferFreeFormats?: boolean;
    dumpSingleJson?: boolean;
    addHeader?: string[];
    extractAudio?: boolean;
}

const DEFAULT_HEADERS = [
    'referer:youtube.com',
    'user-agent:Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
];

export class YouTubeService {
    private static instance: YouTubeService | null = null;

    private constructor() {
        logger.debug('YouTubeService initialized');
    }

    public static getInstance(): YouTubeService {
        if (!YouTubeService.instance) {
            YouTubeService.instance = new YouTubeService();
        }
        return YouTubeService.instance;
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

        // First, get video info
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

        logger.debug('Successfully fetched video info with audio URL', {
            title: info.title,
            duration: info.duration_string,
            hasAudioUrl: !!audioUrl
        });

        return ok({
            title: info.title || 'Unknown Title',
            url: info.webpage_url || url,
            duration: info.duration_string || '0:00',
            thumbnail: info.thumbnail || '',
            description: info.description,
            views: info.view_count,
            audioUrl: audioUrl
        });
    }

    public isValidYouTubeUrl(url: string): boolean {
        const youtubeRegex = /^(https?:\/\/)?(www\.)?(youtube\.com|youtu\.be)\/.+$/;
        const isValid = youtubeRegex.test(url);
        logger.debug('Validating YouTube URL', { url, isValid });
        return isValid;
    }
} 