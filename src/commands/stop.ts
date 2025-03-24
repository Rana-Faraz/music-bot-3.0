import { ChatInputCommandInteraction, SlashCommandBuilder } from 'discord.js';
import { VoiceService } from '../services/voice/VoiceService';
import { logger } from '../services/logger/LoggerService';
import { ErrorType } from '../utils/error';

export const data = new SlashCommandBuilder()
    .setName('stop')
    .setDescription('Stop playing audio and leave the voice channel');

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
    const voiceService = VoiceService.getInstance();
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

        const leaveResult = await voiceService.leaveChannel(guildId);
        if (leaveResult.isErr()) {
            await interaction.editReply({
                content: `❌ ${leaveResult.error.message}`
            });
            return;
        }

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