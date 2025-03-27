import SpotifyWebApi from 'spotify-web-api-node';
import { logger } from '../logger/LoggerService';
import { AppResult, ErrorType } from '../../types/error';
import { err, ok } from 'neverthrow';
import { SpotifyTrack, SpotifyPlaylist } from '../../types/spotify';

export class SpotifyService {
    private static instance: SpotifyService;
    private spotifyApi: SpotifyWebApi;
    private tokenExpirationTime: number = 0;

    private constructor() {
        this.spotifyApi = new SpotifyWebApi({
            clientId: process.env.SPOTIFY_CLIENT_ID,
            clientSecret: process.env.SPOTIFY_CLIENT_SECRET
        });
        logger.debug('SpotifyService initialized');
    }

    public static getInstance(): SpotifyService {
        if (!SpotifyService.instance) {
            SpotifyService.instance = new SpotifyService();
        }
        return SpotifyService.instance;
    }

    private async refreshAccessToken(): Promise<AppResult<void>> {
        try {
            const data = await this.spotifyApi.clientCredentialsGrant();
            this.spotifyApi.setAccessToken(data.body.access_token);
            this.tokenExpirationTime = Date.now() + (data.body.expires_in * 1000);
            return ok(undefined);
        } catch (error) {
            logger.error('Failed to refresh Spotify access token', error);
            return err({
                type: ErrorType.Spotify,
                message: 'Failed to authenticate with Spotify',
                originalError: error
            });
        }
    }

    private async ensureValidToken(): Promise<AppResult<void>> {
        if (Date.now() >= this.tokenExpirationTime) {
            return this.refreshAccessToken();
        }
        return ok(undefined);
    }

    public isSpotifyUrl(url: string): boolean {
        return url.includes('open.spotify.com');
    }

    private extractSpotifyId(url: string): { type: 'track' | 'playlist' | 'album', id: string } | null {
        const match = url.match(/spotify\.com\/(track|playlist|album)\/([a-zA-Z0-9]+)/);
        if (!match) return null;
        return { type: match[1] as 'track' | 'playlist' | 'album', id: match[2] };
    }

    public async getTrack(url: string): Promise<AppResult<SpotifyTrack>> {
        const spotifyId = this.extractSpotifyId(url);
        if (!spotifyId || spotifyId.type !== 'track') {
            return err({
                type: ErrorType.Validation,
                message: 'Invalid Spotify track URL'
            });
        }

        try {
            await this.ensureValidToken();
            const response = await this.spotifyApi.getTrack(spotifyId.id);
            
            return ok({
                name: response.body.name,
                artists: response.body.artists.map(artist => artist.name),
                album: response.body.album.name,
                duration: response.body.duration_ms,
                url: response.body.external_urls.spotify,
                albumCover: response.body.album.images[0]?.url
            });
        } catch (error) {
            logger.error('Failed to fetch Spotify track', error);
            return err({
                type: ErrorType.Spotify,
                message: 'Failed to fetch track information from Spotify',
                originalError: error
            });
        }
    }

    public async getPlaylist(url: string): Promise<AppResult<SpotifyPlaylist>> {
        const spotifyId = this.extractSpotifyId(url);
        if (!spotifyId || spotifyId.type !== 'playlist') {
            return err({
                type: ErrorType.Validation,
                message: 'Invalid Spotify playlist URL'
            });
        }

        try {
            await this.ensureValidToken();
            const response = await this.spotifyApi.getPlaylist(spotifyId.id);
            
            const tracks: SpotifyTrack[] = response.body.tracks.items
                .filter(item => item.track !== null)
                .map(item => ({
                    name: item.track!.name,
                    artists: item.track!.artists.map(artist => artist.name),
                    album: item.track!.album.name,
                    duration: item.track!.duration_ms,
                    url: item.track!.external_urls.spotify,
                    albumCover: item.track!.album.images[0]?.url
                }));

            return ok({
                name: response.body.name,
                description: response.body.description || undefined,
                tracks,
                totalTracks: tracks.length,
                url: response.body.external_urls.spotify,
                thumbnail: response.body.images[0]?.url
            });
        } catch (error) {
            logger.error('Failed to fetch Spotify playlist', error);
            return err({
                type: ErrorType.Spotify,
                message: 'Failed to fetch playlist information from Spotify',
                originalError: error
            });
        }
    }

    public async getAlbum(url: string): Promise<AppResult<SpotifyPlaylist>> {
        const spotifyId = this.extractSpotifyId(url);
        if (!spotifyId || spotifyId.type !== 'album') {
            return err({
                type: ErrorType.Validation,
                message: 'Invalid Spotify album URL'
            });
        }

        try {
            await this.ensureValidToken();
            const response = await this.spotifyApi.getAlbum(spotifyId.id);
            
            const tracks: SpotifyTrack[] = response.body.tracks.items.map(track => ({
                name: track.name,
                artists: response.body.artists.map(artist => artist.name),
                album: response.body.name,
                duration: track.duration_ms,
                url: track.external_urls.spotify,
                albumCover: response.body.images[0]?.url
            }));

            return ok({
                name: response.body.name,
                tracks,
                totalTracks: tracks.length,
                url: response.body.external_urls.spotify,
                thumbnail: response.body.images[0]?.url
            });
        } catch (error) {
            logger.error('Failed to fetch Spotify album', error);
            return err({
                type: ErrorType.Spotify,
                message: 'Failed to fetch album information from Spotify',
                originalError: error
            });
        }
    }
} 