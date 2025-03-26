import { ChatInputCommandInteraction, SlashCommandBuilder } from 'discord.js';
import { VoiceService } from '../services/voice/VoiceService';
import { QueueService } from '../services/queue/QueueService';
import { logger } from '../services/logger/LoggerService';
import { ErrorType } from '../types/error';

export const data = new SlashCommandBuilder()
    .setName('pause')
    .setDescription('Pause the currently playing track');

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
    const voiceService = VoiceService.getInstance();
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
        if (!queue || !queue.currentTrack) {
            await interaction.reply({
                content: '❌ No track is currently playing',
                ephemeral: true
            });
            return;
        }

        if (queue.currentTrack.state.isPaused) {
            await interaction.reply({
                content: '❌ The track is already paused',
                ephemeral: true
            });
            return;
        }

        voiceService.pausePlayback(guildId);
        await interaction.reply({
            content: `⏸️ Paused: ${queue.currentTrack.info.title}`
        });
    } catch (error) {
        logger.error('Error in pause command', error, {
            errorType: ErrorType.Unknown,
            guildId
        });

        const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
        await interaction.reply({
            content: `❌ Failed to pause playback: ${errorMessage}`,
            ephemeral: true
        }).catch(e => {
            logger.error('Failed to send error message', e);
        });
    }
} 