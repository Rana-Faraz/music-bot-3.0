import { 
    ChatInputCommandInteraction, 
    SlashCommandBuilder, 
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ComponentType,
    ButtonInteraction
} from 'discord.js';
import { VoiceService } from '../services/voice/VoiceService';
import { QueueService } from '../services/queue/QueueService';
import { YouTubeService } from '../services/youtube/YouTubeService';
import { logger } from '../services/logger/LoggerService';
import { ErrorType } from '../types/error';

export const data = new SlashCommandBuilder()
    .setName('search')
    .setDescription('Search for a song on YouTube')
    .addStringOption(option =>
        option
            .setName('query')
            .setDescription('The song to search for')
            .setRequired(true)
    );

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
    const youtubeService = YouTubeService.getInstance();
    const voiceService = VoiceService.getInstance();
    const queueService = QueueService.getInstance();
    
    const query = interaction.options.getString('query', true);
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

        // Search for videos
        const searchResult = await youtubeService.searchVideos(query);
        if (searchResult.isErr()) {
            await interaction.editReply({
                content: `❌ ${searchResult.error.message}`
            });
            return;
        }

        if (searchResult.value.items.length === 0) {
            await interaction.editReply({
                content: '❌ No results found'
            });
            return;
        }

        // Create embed with search results
        const embed = new EmbedBuilder()
            .setColor('#FF0000')
            .setTitle('🔎 Search Results')
            .setDescription(`Results for: ${query}`)
            .setTimestamp();

        // Add fields for each result
        searchResult.value.items.forEach((video, index) => {
            embed.addFields({
                name: `${index + 1}. ${video.title}`,
                value: `Duration: ${video.duration} | Views: ${video.views?.toLocaleString() || 'N/A'}`
            });
        });

        // Create buttons for each result
        const row = new ActionRowBuilder<ButtonBuilder>();
        searchResult.value.items.forEach((_, index) => {
            row.addComponents(
                new ButtonBuilder()
                    .setCustomId(`play_${index}`)
                    .setLabel(`${index + 1}`)
                    .setStyle(ButtonStyle.Primary)
            );
        });

        const response = await interaction.editReply({
            embeds: [embed],
            components: [row]
        });

        // Create button collector
        const collector = response.createMessageComponentCollector({
            componentType: ComponentType.Button,
            time: 60000 // 1 minute timeout
        });

        collector.on('collect', async (buttonInteraction: ButtonInteraction) => {
            try {
                // Acknowledge the button interaction immediately
                await buttonInteraction.deferReply();

                // Extract the index from the button custom ID
                const index = parseInt(buttonInteraction.customId.split('_')[1]);
                const selectedVideo = searchResult.value.items[index];

                // Get audio URL for the selected video
                const videoInfoResult = await youtubeService.getAudioUrlForVideo(selectedVideo.url);
                if (videoInfoResult.isErr()) {
                    await buttonInteraction.editReply({
                        content: `❌ Failed to get audio: ${videoInfoResult.error.message}`
                    });
                    return;
                }

                // Update the video info with the audio URL
                const videoWithAudio = {
                    ...selectedVideo,
                    audioUrl: videoInfoResult.value.audioUrl
                };

                // Join voice channel
                const joinResult = await voiceService.joinChannel(buttonInteraction.member as any);
                if (joinResult.isErr()) {
                    await buttonInteraction.editReply({
                        content: `❌ ${joinResult.error.message}`
                    });
                    return;
                }

                // Add to queue
                const queueResult = await queueService.addToQueue(
                    guildId,
                    videoWithAudio,
                    buttonInteraction.member as any
                );

                if (queueResult.isErr()) {
                    await buttonInteraction.editReply({
                        content: `❌ ${queueResult.error.message}`
                    });
                    return;
                }

                const queue = queueService.getQueue(guildId);
                const position = queue ? queue.tracks.length : 0;
                const isNowPlaying = position === 0;

                const playEmbed = new EmbedBuilder()
                    .setColor('#FF0000')
                    .setTitle(isNowPlaying ? 'Now Playing 🎵' : 'Added to Queue 📝')
                    .setDescription(`[${selectedVideo.title}](${selectedVideo.url})`)
                    .addFields(
                        { name: 'Duration', value: selectedVideo.duration, inline: true },
                        { name: 'Position in queue', value: isNowPlaying ? 'Now Playing' : `#${position}`, inline: true },
                        { name: 'Requested by', value: buttonInteraction.member?.user.username || 'Unknown', inline: true }
                    );

                // Safely set thumbnail if URL is valid
                if (selectedVideo.thumbnail && selectedVideo.thumbnail.startsWith('http')) {
                    try {
                        playEmbed.setThumbnail(selectedVideo.thumbnail);
                    } catch (error) {
                        logger.warn('Failed to set thumbnail for embed', {
                            error,
                            thumbnailUrl: selectedVideo.thumbnail
                        });
                    }
                }

                playEmbed.setTimestamp();

                await buttonInteraction.editReply({ embeds: [playEmbed] });

                // Disable all buttons after selection
                row.components.forEach(button => button.setDisabled(true));
                await interaction.editReply({
                    embeds: [embed],
                    components: [row]
                });

                collector.stop();
            } catch (error) {
                logger.error('Error handling button interaction', error);
                await buttonInteraction.editReply({
                    content: '❌ An error occurred while processing your selection.'
                }).catch(() => {});
            }
        });

        collector.on('end', async () => {
            // Disable all buttons when collector ends
            row.components.forEach(button => button.setDisabled(true));
            await interaction.editReply({
                embeds: [embed],
                components: [row]
            }).catch(() => {}); // Ignore errors if message was deleted
        });

    } catch (error) {
        logger.error('Error in search command', error, {
            errorType: ErrorType.Unknown,
            guildId,
            query
        });

        const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
        await interaction.editReply({
            content: `❌ Failed to search: ${errorMessage}`
        }).catch(e => {
            logger.error('Failed to send error message', e);
        });
    }
} 