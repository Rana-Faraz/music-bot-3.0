import { ChatInputCommandInteraction, SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { QueueService } from '../services/queue/QueueService';
import { logger } from '../services/logger/LoggerService';
import { ErrorType } from '../utils/error';
import { QueuedTrack } from '../types/queue';

export const data = new SlashCommandBuilder()
    .setName('queue')
    .setDescription('Show the current music queue')
    .addIntegerOption(option =>
        option
            .setName('page')
            .setDescription('Page number to view')
            .setMinValue(1)
            .setRequired(false)
    );

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
    const queueService = QueueService.getInstance();
    const guildId = interaction.guildId;
    const page = interaction.options.getInteger('page') || 1;

    if (!guildId) {
        await interaction.reply({
            content: 'This command can only be used in a server',
            ephemeral: true
        });
        return;
    }

    try {
        const queue = queueService.getQueue(guildId);
        
        if (!queue || (!queue.currentTrack && queue.tracks.length === 0)) {
            await interaction.reply({
                content: '📭 The queue is empty',
                ephemeral: true
            });
            return;
        }

        const TRACKS_PER_PAGE = 5;
        const totalPages = Math.ceil(queue.tracks.length / TRACKS_PER_PAGE);
        const currentPage = Math.min(page, totalPages);
        const startIndex = (currentPage - 1) * TRACKS_PER_PAGE;
        const endIndex = startIndex + TRACKS_PER_PAGE;

        const embed = new EmbedBuilder()
            .setColor('#FF0000')
            .setTitle('Music Queue 🎵')
            .setTimestamp();

        // Add current track
        if (queue.currentTrack) {
            const currentTrackDuration = queue.currentTrack.info.duration;
            const currentTrackStatus = queue.currentTrack.state.isPaused ? '⏸️ Paused' : '▶️ Playing';
            
            embed.addFields({
                name: 'Now Playing',
                value: `${currentTrackStatus}\n[${queue.currentTrack.info.title}](${queue.currentTrack.info.url})\nRequested by: ${queue.currentTrack.requestedBy.displayName}\nDuration: ${currentTrackDuration}`
            });
        }

        // Add upcoming tracks for current page
        if (queue.tracks.length > 0) {
            const pageItems = queue.tracks.slice(startIndex, endIndex);
            const queueList = pageItems
                .map((track, index) => 
                    `${startIndex + index + 1}. [${track.info.title}](${track.info.url})\n└ Requested by: ${track.requestedBy.displayName} | Duration: ${track.info.duration}`
                )
                .join('\n\n');

            if (queueList) {
                embed.addFields({
                    name: 'Up Next',
                    value: queueList
                });
            }

            // Add page information
            embed.setFooter({
                text: `Page ${currentPage}/${totalPages} • ${queue.tracks.length} track${queue.tracks.length !== 1 ? 's' : ''} in queue`
            });
        }

        await interaction.reply({ embeds: [embed] });

    } catch (error) {
        logger.error('Error in queue command', error, {
            errorType: ErrorType.Unknown,
            guildId
        });

        await interaction.reply({
            content: '❌ Failed to display queue',
            ephemeral: true
        }).catch(e => {
            logger.error('Failed to send error message', e);
        });
    }
} 