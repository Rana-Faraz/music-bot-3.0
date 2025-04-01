import { ChatInputCommandInteraction, SlashCommandBuilder } from 'discord.js';
import { VoiceService } from '../services/voice/VoiceService';
import { logger } from '../services/logger/LoggerService';
import { ErrorType } from '../types/error';
import { QueueService } from '../services/queue/QueueService';

export const data = new SlashCommandBuilder()
    .setName('stop')
    .setDescription('Stop playing audio and leave the voice channel');

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
        await interaction.deferReply();
        
        // Clear the queue first
        queueService.clearQueue(guildId);
        
        // Then leave the channel
        await voiceService.leaveChannel(guildId);
        
        await interaction.editReply({
            content: '⏹️ Stopped playing and left the voice channel'
        });
    } catch (error) {
        logger.error('Error in stop command', error, {
            errorType: ErrorType.Unknown,
            guildId
        });

        const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
        await interaction.editReply({
            content: `❌ Failed to stop playback: ${errorMessage}`
        }).catch(e => {
            logger.error('Failed to send error message', e);
        });
    }
}