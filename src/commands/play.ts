import { ChatInputCommandInteraction, SlashCommandBuilder } from 'discord.js';
import { VoiceService } from '../services/voice/VoiceService';
import { logger } from '../services/logger/LoggerService';
import { ErrorType } from '../utils/error';
import path from 'path';
import fs from 'fs/promises';

export const data = new SlashCommandBuilder()
    .setName('play')
    .setDescription('Play a local audio file')
    .addStringOption(option =>
        option
            .setName('file')
            .setDescription('The name of the audio file to play')
            .setRequired(true)
    );

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
    const voiceService = VoiceService.getInstance();
    const fileName = interaction.options.getString('file', true);
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

        // Join the voice channel
        const joinResult = await voiceService.joinChannel(interaction.member as any);
        if (joinResult.isErr()) {
            await interaction.editReply({
                content: `❌ ${joinResult.error.message}`
            });
            return;
        }

        // Construct file path and check if file exists
        const audioDir = path.join(process.cwd(), 'assets');
        const filePath = path.join(audioDir, fileName);

        try {
            await fs.access(filePath);
        } catch {
            await interaction.editReply({
                content: `❌ Audio file "${fileName}" not found in the audio directory`
            });
            return;
        }

        // Play the audio file
        const playResult = await voiceService.playLocalAudio(guildId, filePath);
        if (playResult.isErr()) {
            await interaction.editReply({
                content: `❌ ${playResult.error.message}`
            });
            return;
        }

        await interaction.editReply({
            content: `🎵 Now playing: ${fileName}`
        });

    } catch (error) {
        logger.error('Error in play command', error, {
            errorType: ErrorType.Unknown,
            guildId,
            fileName
        });

        const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
        await interaction.editReply({
            content: `❌ Failed to play audio: ${errorMessage}`
        }).catch(e => {
            logger.error('Failed to send error message', e);
        });
    }
} 