import { ChatInputCommandInteraction, SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { VoiceService } from '../services/voice/VoiceService';
import { QueueService } from '../services/queue/QueueService';
import { YouTubeService } from '../services/youtube/YouTubeService';
import { SpotifyService } from '../services/spotify/SpotifyService';
import { logger } from '../services/logger/LoggerService';
import { ErrorType } from '../types/error';
import { VideoInfo } from '../types/youtube';
import { SpotifyTrack } from '../types/spotify';

export const data = new SlashCommandBuilder()
    .setName('play')
    .setDescription('Play audio from a YouTube or Spotify URL')
    .addStringOption(option =>
        option
            .setName('url')
            .setDescription('The YouTube or Spotify URL to play')
            .setRequired(true)
    );

async function searchAndGetVideoInfo(query: string): Promise<VideoInfo> {
    const youtubeService = YouTubeService.getInstance();
    const searchResult = await youtubeService.searchVideos(query, 1);
    
    if (searchResult.isErr() || searchResult.value.items.length === 0) {
        throw new Error('Could not find a YouTube video for this track');
    }

    return searchResult.value.items[0];
}

async function handleSpotifyTrack(url: string): Promise<VideoInfo> {
    const spotifyService = SpotifyService.getInstance();
    const trackResult = await spotifyService.getTrack(url);
    
    if (trackResult.isErr()) {
        throw trackResult.error;
    }

    const track = trackResult.value;
    const searchQuery = `${track.name} ${track.artists.join(' ')}`;
    return await searchAndGetVideoInfo(searchQuery);
}

async function handleSpotifyPlaylist(url: string): Promise<VideoInfo[]> {
    const spotifyService = SpotifyService.getInstance();
    const playlistResult = await spotifyService.getPlaylist(url);
    
    if (playlistResult.isErr()) {
        throw playlistResult.error;
    }

    const videoInfos: VideoInfo[] = [];
    for (const track of playlistResult.value.tracks) {
        try {
            const searchQuery = `${track.name} ${track.artists.join(' ')}`;
            const videoInfo = await searchAndGetVideoInfo(searchQuery);
            videoInfos.push(videoInfo);
        } catch (error) {
            logger.warn(`Failed to find YouTube video for track: ${track.name}`, { error });
        }
    }

    return videoInfos;
}

async function handleSpotifyAlbum(url: string): Promise<VideoInfo[]> {
    const spotifyService = SpotifyService.getInstance();
    const albumResult = await spotifyService.getAlbum(url);
    
    if (albumResult.isErr()) {
        throw albumResult.error;
    }

    const videoInfos: VideoInfo[] = [];
    for (const track of albumResult.value.tracks) {
        try {
            const searchQuery = `${track.name} ${track.artists.join(' ')}`;
            const videoInfo = await searchAndGetVideoInfo(searchQuery);
            videoInfos.push(videoInfo);
        } catch (error) {
            logger.warn(`Failed to find YouTube video for track: ${track.name}`, { error });
        }
    }

    return videoInfos;
}

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
    const voiceService = VoiceService.getInstance();
    const queueService = QueueService.getInstance();
    const youtubeService = YouTubeService.getInstance();
    const spotifyService = SpotifyService.getInstance();
    
    const url = interaction.options.getString('url', true);
    const guildId = interaction.guildId;

    if (!guildId) {
        await interaction.reply({
            content: 'This command can only be used in a server',
            ephemeral: true
        });
        return;
    }

    try {
        await interaction.deferReply();

        // Join the voice channel if not already in one
        const joinResult = await voiceService.joinChannel(interaction.member as any);
        if (joinResult.isErr()) {
            await interaction.editReply({
                content: `❌ ${joinResult.error.message}`
            });
            return;
        }

        let videos: VideoInfo[] = [];

        if (spotifyService.isSpotifyUrl(url)) {
            const spotifyId = spotifyService['extractSpotifyId'](url);
            if (!spotifyId) {
                await interaction.editReply({
                    content: '❌ Invalid Spotify URL'
                });
                return;
            }

            switch (spotifyId.type) {
                case 'track':
                    videos = [await handleSpotifyTrack(url)];
                    break;
                case 'playlist':
                    videos = await handleSpotifyPlaylist(url);
                    break;
                case 'album':
                    videos = await handleSpotifyAlbum(url);
                    break;
            }
        } else if (youtubeService.isValidYouTubeUrl(url)) {
            if (youtubeService.isPlaylistUrl(url)) {
                const playlistResult = await youtubeService.getPlaylistVideos(url);
                if (playlistResult.isErr()) {
                    await interaction.editReply({
                        content: `❌ Failed to load playlist: ${playlistResult.error.message}`
                    });
                    return;
                }
                videos = playlistResult.value;
            } else {
                const videoInfoResult = await youtubeService.getVideoInfoWithAudio(url);
                if (videoInfoResult.isErr()) {
                    await interaction.editReply({
                        content: `❌ ${videoInfoResult.error.message}`
                    });
                    return;
                }
                videos = [videoInfoResult.value];
            }
        } else {
            await interaction.editReply({
                content: '❌ Invalid URL. Please provide a valid YouTube or Spotify URL'
            });
            return;
        }

        if (videos.length === 0) {
            await interaction.editReply({
                content: '❌ No playable tracks found'
            });
            return;
        }

        let addedCount = 0;
        for (const video of videos) {
            const queueResult = await queueService.addToQueue(
                guildId,
                video,
                interaction.member as any
            );

            if (queueResult.isOk()) {
                addedCount++;
            }
        }

        const queue = queueService.getQueue(guildId);
        const position = queue ? queue.tracks.length : 0;
        const isNowPlaying = position === 0;

        const embed = new EmbedBuilder()
            .setColor('#1DB954') // Spotify green for Spotify URLs, YouTube red for YouTube URLs
            .setTitle(videos.length === 1 ? (isNowPlaying ? 'Now Playing 🎵' : 'Added to Queue 📝') : 'Playlist Added to Queue 📝')
            .setDescription(videos.length === 1 
                ? `[${videos[0].title}](${videos[0].url})`
                : `Successfully added ${addedCount} tracks to the queue`)
            .addFields(
                videos.length === 1 
                    ? [
                        { name: 'Duration', value: videos[0].duration, inline: true },
                        { name: 'Position in queue', value: isNowPlaying ? 'Now Playing' : `#${position}`, inline: true },
                        { name: 'Requested by', value: interaction.member?.user.username || 'Unknown', inline: true }
                    ]
                    : [
                        { name: 'Tracks Added', value: addedCount.toString(), inline: true },
                        { name: 'Requested by', value: interaction.member?.user.username || 'Unknown', inline: true }
                    ]
            );

        if (videos.length === 1 && videos[0].thumbnail) {
            embed.setThumbnail(videos[0].thumbnail);
        }

        await interaction.editReply({ embeds: [embed] });

    } catch (error) {
        logger.error('Error in play command', error, {
            errorType: ErrorType.Unknown,
            guildId,
            url
        });

        const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
        await interaction.editReply({
            content: `❌ Failed to play audio: ${errorMessage}`
        }).catch(e => {
            logger.error('Failed to send error message', e);
        });
    }
} 