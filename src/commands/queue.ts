import { 
    ChatInputCommandInteraction, 
    SlashCommandBuilder, 
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ComponentType,
    ButtonInteraction
} from 'discord.js';
import { QueueService } from '../services/queue/QueueService';
import { logger } from '../services/logger/LoggerService';
import { ErrorType } from '../types/error';
import { QueuedTrack } from '../types/queue';
import { ButtonCustomId } from '../types/events';

const TRACKS_PER_PAGE = 5;
const BUTTON_TIMEOUT = 60000; // 1 minute

export const data = new SlashCommandBuilder()
    .setName('queue')
    .setDescription('Show the current music queue');

async function createQueueEmbed(queue: { 
    currentTrack: QueuedTrack | null; 
    tracks: QueuedTrack[]; 
}, currentPage: number): Promise<{ embed: EmbedBuilder, totalPages: number }> {
    const totalPages = Math.ceil(queue.tracks.length / TRACKS_PER_PAGE);
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
            .map((track: QueuedTrack, index: number) => 
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

    return { embed, totalPages };
}

function createNavigationRow(currentPage: number, totalPages: number): ActionRowBuilder<ButtonBuilder> {
    const row = new ActionRowBuilder<ButtonBuilder>();

    // Previous page button
    row.addComponents(
        new ButtonBuilder()
            .setCustomId(ButtonCustomId.QueuePrevPage)
            .setLabel('◀️ Previous')
            .setStyle(ButtonStyle.Primary)
            .setDisabled(currentPage <= 1)
    );

    // Refresh button
    row.addComponents(
        new ButtonBuilder()
            .setCustomId(ButtonCustomId.QueueRefresh)
            .setLabel('🔄 Refresh')
            .setStyle(ButtonStyle.Secondary)
    );

    // Next page button
    row.addComponents(
        new ButtonBuilder()
            .setCustomId(ButtonCustomId.QueueNextPage)
            .setLabel('Next ▶️')
            .setStyle(ButtonStyle.Primary)
            .setDisabled(currentPage >= totalPages)
    );

    return row;
}

async function handleButtonInteraction(
    interaction: ButtonInteraction,
    currentPage: number,
    queueService: QueueService
): Promise<void> {
    const guildId = interaction.guildId;
    if (!guildId) return;

    const queue = queueService.getQueue(guildId);
    if (!queue) {
        await interaction.update({
            content: '📭 The queue is empty',
            embeds: [],
            components: []
        });
        return;
    }

    let newPage = currentPage;
    const totalPages = Math.ceil(queue.tracks.length / TRACKS_PER_PAGE);

    switch (interaction.customId) {
        case ButtonCustomId.QueuePrevPage:
            newPage = Math.max(1, currentPage - 1);
            break;
        case ButtonCustomId.QueueNextPage:
            newPage = Math.min(totalPages, currentPage + 1);
            break;
        case ButtonCustomId.QueueRefresh:
            // Keep the same page, just refresh the data
            break;
    }

    const { embed } = await createQueueEmbed(queue, newPage);
    const row = createNavigationRow(newPage, totalPages);

    await interaction.update({
        embeds: [embed],
        components: [row]
    });
}

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

        const currentPage = 1;
        const { embed, totalPages } = await createQueueEmbed(queue, currentPage);
        const row = createNavigationRow(currentPage, totalPages);

        const reply = await interaction.reply({
            embeds: [embed],
            components: [row],
            fetchReply: true
        });

        // Create button collector
        const collector = reply.createMessageComponentCollector({
            componentType: ComponentType.Button,
            // time: BUTTON_TIMEOUT
        });

        let page = currentPage;

        collector.on('collect', async (buttonInteraction) => {
            // Verify the user who clicked is the one who used the command
            if (buttonInteraction.user.id !== interaction.user.id) {
                await buttonInteraction.reply({
                    content: '❌ Only the user who used this command can navigate the queue',
                    ephemeral: true
                });
                return;
            }

            try {
                await handleButtonInteraction(buttonInteraction, page, queueService);
                // Update the page based on the button pressed
                switch (buttonInteraction.customId) {
                    case ButtonCustomId.QueuePrevPage:
                        page = Math.max(1, page - 1);
                        break;
                    case ButtonCustomId.QueueNextPage:
                        page = Math.min(totalPages, page + 1);
                        break;
                }
            } catch (error) {
                logger.error('Error handling button interaction', error);
                await buttonInteraction.reply({
                    content: '❌ Failed to update queue display',
                    ephemeral: true
                });
            }
        });

        collector.on('end', async () => {
            // Remove buttons after timeout
            const { embed } = await createQueueEmbed(queue, page);
            await interaction.editReply({
                embeds: [embed],
                components: []
            }).catch(() => {}); // Ignore errors if message was deleted
        });

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