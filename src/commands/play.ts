import { ChatInputCommandInteraction, SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { VoiceService } from '../services/voice/VoiceService';
import { QueueService } from '../services/queue/QueueService';
import { YouTubeService } from '../services/youtube/YouTubeService';
import { logger } from '../services/logger/LoggerService';
import { ErrorType } from '../types/error';

export const data = new SlashCommandBuilder()
    .setName('play')
    .setDescription('Play audio from a YouTube URL or playlist')
    .addStringOption(option =>
        option
            .setName('url')
            .setDescription('The YouTube URL or playlist URL to play')
            .setRequired(true)
    );

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
    const voiceService = VoiceService.getInstance();
    const queueService = QueueService.getInstance();
    const youtubeService = YouTubeService.getInstance();
    
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
        // Defer reply as voice operations might take time
        await interaction.deferReply();

        // Validate YouTube URL
        if (!youtubeService.isValidYouTubeUrl(url)) {
            await interaction.editReply({
                content: '❌ Invalid YouTube URL'
            });
            return;
        }

        // Join the voice channel if not already in one
        const joinResult = await voiceService.joinChannel(interaction.member as any);
        if (joinResult.isErr()) {
            await interaction.editReply({
                content: `❌ ${joinResult.error.message}`
            });
            return;
        }

        // Handle playlists differently
        if (youtubeService.isPlaylistUrl(url)) {
            const playlistResult = await youtubeService.getPlaylistVideos(url);
            if (playlistResult.isErr()) {
                await interaction.editReply({
                    content: `❌ Failed to load playlist: ${playlistResult.error.message}`
                });
                return;
            }

            const videos = playlistResult.value;
            let addedCount = 0;

            // Add each video to the queue
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

            const embed = new EmbedBuilder()
                .setColor('#FF0000')
                .setTitle('Playlist Added to Queue 📝')
                .setDescription(`Successfully added ${addedCount} tracks to the queue`)
                .addFields(
                    { name: 'Requested by', value: interaction.member?.user.username || 'Unknown', inline: true },
                    { name: 'Tracks Added', value: addedCount.toString(), inline: true }
                )
                .setTimestamp();

            await interaction.editReply({ embeds: [embed] });
            return;
        }

        // Handle single video
        const videoInfoResult = await youtubeService.getVideoInfoWithAudio(url);
        if (videoInfoResult.isErr()) {
            await interaction.editReply({
                content: `❌ ${videoInfoResult.error.message}`
            });
            return;
        }

        // Add to queue
        const queueResult = await queueService.addToQueue(
            guildId,
            videoInfoResult.value,
            interaction.member as any
        );

        if (queueResult.isErr()) {
            await interaction.editReply({
                content: `❌ ${queueResult.error.message}`
            });
            return;
        }

        const queue = queueService.getQueue(guildId);
        const position = queue ? queue.tracks.length : 0;
        const isNowPlaying = position === 0;

        const embed = new EmbedBuilder()
            .setColor('#FF0000')
            .setTitle(isNowPlaying ? 'Now Playing 🎵' : 'Added to Queue 📝')
            .setDescription(`[${videoInfoResult.value.title}](${videoInfoResult.value.url})`)
            .addFields(
                { name: 'Duration', value: videoInfoResult.value.duration, inline: true },
                { name: 'Position in queue', value: isNowPlaying ? 'Now Playing' : `#${position}`, inline: true },
                { name: 'Requested by', value: interaction.member?.user.username || 'Unknown', inline: true }
            )
            .setThumbnail(videoInfoResult.value.thumbnail)
            .setTimestamp();

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