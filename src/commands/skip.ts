import { ChatInputCommandInteraction, SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { QueueService } from '../services/queue/QueueService';
import { logger } from '../services/logger/LoggerService';
import { ErrorType } from '../utils/error';

export const data = new SlashCommandBuilder()
    .setName('skip')
    .setDescription('Skip the currently playing track');

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
        await interaction.deferReply();

        const queue = queueService.getQueue(guildId);
        if (!queue || !queue.currentTrack) {
            await interaction.editReply({
                content: '❌ No track is currently playing',
            });
            return;
        }

        const skippedTrack = queue.currentTrack;
        const nextTrack = queue.tracks[0]; // Get next track before skipping

        const skipResult = queueService.skipTrack(guildId);
        if (skipResult.isErr()) {
            await interaction.editReply({
                content: `❌ ${skipResult.error.message}`
            });
            return;
        }

        const embed = new EmbedBuilder()
            .setColor('#FF0000')
            .setTitle('⏭️ Skipped Track')
            .setDescription(`[${skippedTrack.info.title}](${skippedTrack.info.url})`)
            .setTimestamp();

        if (nextTrack) {
            embed.addFields({
                name: 'Up Next',
                value: `[${nextTrack.info.title}](${nextTrack.info.url})`
            });
        } else {
            embed.addFields({
                name: 'Queue',
                value: 'No more tracks in queue'
            });
        }

        await interaction.editReply({ embeds: [embed] });
    } catch (error) {
        logger.error('Error in skip command', error, {
            errorType: ErrorType.Unknown,
            guildId
        });

        const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
        await interaction.editReply({
            content: `❌ Failed to skip track: ${errorMessage}`
        }).catch(e => {
            logger.error('Failed to send error message', e);
        });
    }
} 