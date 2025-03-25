import play from 'play-dl';
import youtubeDl from 'youtube-dl-exec';
import { logger } from '../logger/LoggerService';
import { AppResult, ErrorType, handleAsync } from '../../utils/error';
import { err, ok } from 'neverthrow';

export interface VideoInfo {
    title: string;
    url: string;
    duration: string;
    thumbnail: string;
}

export class YouTubeService {
    private static instance: YouTubeService;

    private constructor() {
        logger.debug('YouTubeService initialized');
    }

    public static getInstance(): YouTubeService {
        if (!YouTubeService.instance) {
            YouTubeService.instance = new YouTubeService();
        }
        return YouTubeService.instance;
    }

    public async getVideoInfo(url: string): Promise<AppResult<VideoInfo>> {
        logger.debug('Fetching video info', { url });
        
        try {
            logger.debug('Calling play-dl video_info');
            const videoInfo = await play.video_info(url);
            
            if (!videoInfo || !videoInfo.video_details) {
                logger.debug('No video details found in response', { videoInfo });
                return err({
                    type: ErrorType.Validation,
                    message: 'Could not fetch video information'
                });
            }

            const details = videoInfo.video_details;
            logger.debug('Video details fetched successfully', {
                title: details.title,
                duration: details.durationRaw,
                thumbnailCount: details.thumbnails.length
            });

            return ok({
                title: details.title || 'Unknown Title',
                url: details.url,
                duration: details.durationRaw,
                thumbnail: details.thumbnails[0]?.url || ''
            });
        } catch (error) {
            logger.error('Error fetching video info', error, {
                url,
                errorType: ErrorType.Network
            });
            return err({
                type: ErrorType.Network,
                message: 'Failed to fetch video information',
                originalError: error
            });
        }
    }

    public async getAudioUrl(videoUrl: string): Promise<AppResult<string>> {
        logger.debug('Extracting audio URL', { videoUrl });
        
        try {
            logger.debug('Calling youtube-dl with options', {
                format: 'bestaudio',
                getUrl: true,
                noWarnings: true,
                preferFreeFormats: true
            });

            const result = await youtubeDl(videoUrl, {
                format: 'bestaudio',
                getUrl: true,
                noWarnings: true,
                preferFreeFormats: true,
                addHeader: [
                    'referer:youtube.com',
                    'user-agent:Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
                ]
            });

            if (typeof result !== 'string') {
                logger.debug('Invalid result from youtube-dl', { result });
                return err({
                    type: ErrorType.Validation,
                    message: 'Could not extract audio URL'
                });
            }

            logger.debug('Successfully extracted audio URL', {
                urlLength: result.length,
                urlStart: result.substring(0, 50) + '...' // Log just the start of the URL for debugging
            });

            return ok(result);
        } catch (error) {
            logger.error('Error extracting audio URL', error, {
                videoUrl,
                errorType: ErrorType.Network,
                errorMessage: error instanceof Error ? error.message : 'Unknown error'
            });
            return err({
                type: ErrorType.Network,
                message: 'Failed to extract audio URL',
                originalError: error
            });
        }
    }

    public isValidYouTubeUrl(url: string): boolean {
        const youtubeRegex = /^(https?:\/\/)?(www\.)?(youtube\.com|youtu\.be)\/.+$/;
        const isValid = youtubeRegex.test(url);
        logger.debug('Validating YouTube URL', { url, isValid });
        return isValid;
    }
} 