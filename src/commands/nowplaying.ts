import { ChatInputCommandInteraction, SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { QueueService } from '../services/queue/QueueService';
import { logger } from '../services/logger/LoggerService';
import { ErrorType } from '../types/error';

export const data = new SlashCommandBuilder()
    .setName('nowplaying')
    .setDescription('Shows information about the currently playing track');

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
        
        if (!queue?.currentTrack) {
            await interaction.reply({
                content: '🎵 No track is currently playing',
                ephemeral: true
            });
            return;
        }

        const track = queue.currentTrack;
        
        // Calculate elapsed time accounting for pauses
        let elapsedTime = '0:00';
        if (track.state.startedAt) {
            const now = new Date();
            const totalElapsed = now.getTime() - track.state.startedAt.getTime();
            const actualElapsed = totalElapsed - track.state.totalPausedDuration;
            const elapsedSeconds = Math.floor(actualElapsed / 1000);
            const minutes = Math.floor(elapsedSeconds / 60);
            const seconds = elapsedSeconds % 60;
            elapsedTime = `${minutes}:${seconds.toString().padStart(2, '0')}`;
        }

        const embed = new EmbedBuilder()
            .setColor(0x0099FF)
            .setTitle('Now Playing 🎵')
            .setDescription(`[${track.info.title}](${track.info.url})`)
            .addFields(
                { name: 'Duration', value: `${elapsedTime} / ${track.info.duration}`, inline: true },
                { name: 'Requested by', value: track.requestedBy.displayName, inline: true },
                { name: 'Status', value: track.state.isPaused ? '⏸️ Paused' : '▶️ Playing', inline: true }
            )
            .setThumbnail(track.info.thumbnail)
            .setTimestamp();

        if (track.info.views !== undefined) {
            embed.addFields({ name: 'Views', value: track.info.views.toLocaleString(), inline: true });
        }

        await interaction.reply({ embeds: [embed] });
    } catch (error) {
        logger.error('Error in nowplaying command', error, {
            errorType: ErrorType.Unknown,
            guildId
        });

        const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
        await interaction.reply({
            content: `❌ Failed to get now playing information: ${errorMessage}`,
            ephemeral: true
        });
    }
} 