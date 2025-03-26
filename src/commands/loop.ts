import { SlashCommandBuilder } from '@discordjs/builders';
import { CommandInteraction, EmbedBuilder, CacheType } from 'discord.js';
import { QueueService } from '../services/queue/QueueService';
import { LoopMode } from '../types/queue';
import { ErrorType } from '../types/error';
import { logger } from '../services/logger/LoggerService';

export const data = new SlashCommandBuilder()
    .setName('loop')
    .setDescription('Toggle loop mode for the queue')
    .addStringOption(option =>
        option.setName('mode')
            .setDescription('Loop mode to set')
            .setRequired(true)
            .addChoices(
                { name: 'Off', value: LoopMode.NONE },
                { name: 'Track', value: LoopMode.TRACK },
                { name: 'Queue', value: LoopMode.QUEUE }
            )
    );

export async function execute(interaction: CommandInteraction<CacheType>) {
    const queueService = QueueService.getInstance();
    
    try {
        const mode = interaction.options.get('mode')?.value as LoopMode;
        const guildId = interaction.guildId;

        if (!guildId) {
            await interaction.reply({
                content: 'This command can only be used in a server.',
                ephemeral: true
            });
            return;
        }

        const result = queueService.setLoopMode(guildId, mode);
        if (result.isErr()) {
            const error = result.error;
            if (error.type === ErrorType.Validation) {
                await interaction.reply({
                    content: error.message,
                    ephemeral: true
                });
                return;
            }
            throw error;
        }

        const embed = new EmbedBuilder()
            .setColor('#0099ff')
            .setTitle('🔄 Loop Mode Changed')
            .setDescription(`Loop mode has been set to: **${mode}**`);

        await interaction.reply({ embeds: [embed] });


    } catch (error) {
        logger.error('Error changing loop mode', error);
        await interaction.reply({
            content: 'An error occurred while changing the loop mode.',
            ephemeral: true
        });
    }
} 