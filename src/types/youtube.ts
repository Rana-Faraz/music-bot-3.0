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

export interface YouTubeDlOptions {
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

export interface YouTubeHeaders {
    referer: string;
    userAgent: string;
    accept: string;
    acceptLanguage: string;
    secChUa: string;
    secChUaMobile: string;
    secChUaPlatform: string;
    secFetchDest: string;
    secFetchMode: string;
    secFetchSite: string;
    secFetchUser: string;
    upgradeInsecureRequests: string;
}

export interface PlaylistEntry extends VideoInfo {
    playlistIndex: number;
}

export interface PlaylistInfo {
    title: string;
    description?: string;
    totalVideos: number;
    entries: PlaylistEntry[];
} 