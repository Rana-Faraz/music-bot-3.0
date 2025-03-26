import { 
    ChatInputCommandInteraction, 
    SlashCommandBuilder, 
    EmbedBuilder
} from 'discord.js';
import { logger } from '../services/logger/LoggerService';
import { ErrorType } from '../types/error';

// Define option choice type
interface CommandOptionChoice {
    name: string;
    value: string;
}

// Define option type
interface CommandOption {
    name: string;
    description: string;
    choices?: CommandOptionChoice[];
}

// Define command type
interface Command {
    name: string;
    description: string;
    options: CommandOption[];
}

// Define available commands
const AVAILABLE_COMMANDS: Command[] = [
    {
        name: 'play',
        description: 'Play audio from a YouTube URL',
        options: [
            {
                name: 'url',
                description: 'The YouTube URL to play'
            }
        ]
    },
    {
        name: 'search',
        description: 'Search for a song on YouTube',
        options: [
            {
                name: 'query',
                description: 'The song to search for'
            }
        ]
    },
    {
        name: 'pause',
        description: 'Pause the currently playing audio',
        options: []
    },
    {
        name: 'resume',
        description: 'Resume paused audio',
        options: []
    },
    {
        name: 'skip',
        description: 'Skip the currently playing song',
        options: []
    },
    {
        name: 'stop',
        description: 'Stop playback and clear the queue',
        options: []
    },
    {
        name: 'queue',
        description: 'Display the current music queue',
        options: []
    },
    {
        name: 'loop',
        description: 'Toggle loop mode for the current song or queue',
        options: [
            {
                name: 'mode',
                description: 'Loop mode to set (Off, Track, Queue)',
                choices: [
                    { name: 'Off', value: 'NONE' },
                    { name: 'Track', value: 'TRACK' },
                    { name: 'Queue', value: 'QUEUE' }
                ]
            }
        ]
    },
    {
        name: 'help',
        description: 'Shows all available commands',
        options: []
    }
];

export const data = new SlashCommandBuilder()
    .setName('help')
    .setDescription('Shows all available commands');

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
    try {
        const embed = new EmbedBuilder()
            .setColor('#FF0000')
            .setTitle('🎵 Music Bot Commands')
            .setDescription('Here are all the available commands:')
            .setTimestamp();

        // Add each command to the embed
        AVAILABLE_COMMANDS.forEach(command => {
            let value = command.description;
            
            // Add options if they exist
            if (command.options.length > 0) {
                const optionsText = command.options
                    .map(opt => {
                        let text = `\`${opt.name}\`: ${opt.description}`;
                        
                        // Add choices if they exist
                        if (opt.choices && opt.choices.length > 0) {
                            const choicesText = opt.choices
                                .map(choice => `\`${choice.name}\``)
                                .join(', ');
                            text += `\nChoices: ${choicesText}`;
                        }
                        
                        return text;
                    })
                    .join('\n\n');
                value += `\n\nParameters:\n${optionsText}`;
            }

            // Add field for each command
            embed.addFields({
                name: `/${command.name}`,
                value: value
            });
        });

        // Add footer with additional info
        embed.setFooter({
            text: 'Use / to access these commands'
        });

        await interaction.reply({ embeds: [embed] });

    } catch (error) {
        logger.error('Error in help command', error, {
            errorType: ErrorType.Unknown,
            guildId: interaction.guildId
        });

        await interaction.reply({
            content: '❌ Failed to display help menu',
            ephemeral: true
        }).catch(e => {
            logger.error('Failed to send error message', e);
        });
    }
} 