import { ChatInputCommandInteraction, SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { QueueService } from '../services/queue/QueueService';
import { logger } from '../services/logger/LoggerService';
import { ErrorType } from '../utils/error';

export const data = new SlashCommandBuilder()
    .setName('queue')
    .setDescription('Show the current music queue');

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
    const queueService = QueueService.getInstance();
    const guildId = interaction.guildId;

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

        const embed = new EmbedBuilder()
            .setColor('#FF0000')
            .setTitle('Music Queue 🎵')
            .setTimestamp();

        // Add current track
        if (queue.currentTrack) {
            embed.addFields({
                name: 'Now Playing',
                value: `[${queue.currentTrack.info.title}](${queue.currentTrack.info.url})\nRequested by: ${queue.currentTrack.requestedBy.user.username}\nDuration: ${queue.currentTrack.info.duration}`
            });
        }

        // Add upcoming tracks
        if (queue.tracks.length > 0) {
            const queueList = queue.tracks
                .slice(0, 10) // Show only first 10 tracks
                .map((track, index) => 
                    `${index + 1}. [${track.info.title}](${track.info.url})\n└ Requested by: ${track.requestedBy.user.username} | Duration: ${track.info.duration}`
                )
                .join('\n\n');

            embed.addFields({
                name: 'Up Next',
                value: queueList
            });

            // If there are more tracks, show a footer
            if (queue.tracks.length > 10) {
                embed.setFooter({
                    text: `And ${queue.tracks.length - 10} more tracks...`
                });
            }
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