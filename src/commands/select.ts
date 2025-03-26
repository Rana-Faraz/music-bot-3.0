import { 
    ChatInputCommandInteraction, 
    SlashCommandBuilder,
} from 'discord.js';
import { QueueService } from '../services/queue/QueueService';
import { logger } from '../services/logger/LoggerService';
import { ErrorType } from '../types/error';

export const data = new SlashCommandBuilder()
    .setName('select')
    .setDescription('Select a song from the queue to play')
    .addIntegerOption(option =>
        option
            .setName('position')
            .setDescription('Position of the song in the queue (1, 2, 3, etc.)')
            .setMinValue(1)
            .setRequired(true)
    );

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
    const queueService = QueueService.getInstance();
    const guildId = interaction.guildId;
    const position = interaction.options.getInteger('position', true);

    if (!guildId) {
        await interaction.reply({
            content: 'This command can only be used in a server',
            ephemeral: true
        });
        return;
    }

    try {
        const queue = queueService.getQueue(guildId);
        
        if (!queue) {
            await interaction.reply({
                content: '📭 The queue is empty',
                ephemeral: true
            });
            return;
        }

        // Validate position
        if (position > queue.tracks.length) {
            await interaction.reply({
                content: `❌ Invalid position. The queue only has ${queue.tracks.length} track${queue.tracks.length !== 1 ? 's' : ''}.`,
                ephemeral: true
            });
            return;
        }

        // Get the selected track
        const selectedTrack = queue.tracks[position - 1];
        
        // Move the selected track to the front of the queue
        const result = await queueService.moveToFront(guildId, position - 1);
        
        if (result.isErr()) {
            await interaction.reply({
                content: '❌ Failed to select track',
                ephemeral: true
            });
            return;
        }

        await interaction.reply({
            content: `✅ Selected **${selectedTrack.info.title}**. It will play next!`,
            ephemeral: false
        });

    } catch (error) {
        logger.error('Error in select command', error, {
            errorType: ErrorType.Unknown,
            guildId,
            position
        });

        await interaction.reply({
            content: '❌ Failed to select track',
            ephemeral: true
        }).catch(e => {
            logger.error('Failed to send error message', e);
        });
    }
} 