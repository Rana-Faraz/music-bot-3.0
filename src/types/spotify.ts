export interface SpotifyTrack {
    name: string;
    artists: string[];
    album: string;
    duration: number;
    url: string;
    albumCover?: string;
}

export interface SpotifyPlaylist {
    name: string;
    description?: string;
    tracks: SpotifyTrack[];
    totalTracks: number;
    url: string;
    thumbnail?: string;
}

export interface SpotifyServiceState {
    tokenExpirationTime: number;
} 