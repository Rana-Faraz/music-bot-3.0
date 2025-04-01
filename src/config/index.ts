import dotenv from 'dotenv';
import { BotConfig, EnvironmentConfig } from '../types/config';

// Load environment variables
dotenv.config();

// Environment configuration
export const environment: EnvironmentConfig = {
    NODE_ENV: process.env.NODE_ENV || 'development',
    isProd: process.env.NODE_ENV === 'production',
    isDev: process.env.NODE_ENV !== 'production'
};

// Bot configuration
export const config: BotConfig = {
    discord: {
        token: process.env.DISCORD_TOKEN || '',
        clientId: process.env.CLIENT_ID || '',
        guildId: process.env.GUILD_ID || ''
    },
    spotify: process.env.SPOTIFY_CLIENT_ID && process.env.SPOTIFY_CLIENT_SECRET ? {
        clientId: process.env.SPOTIFY_CLIENT_ID,
        clientSecret: process.env.SPOTIFY_CLIENT_SECRET
    } : undefined,
    prefix: process.env.PREFIX || '!'
};

// Validate required configuration
const validateConfig = () => {
    const { discord } = config;
    
    if (!discord.token) throw new Error('DISCORD_TOKEN is required');
    if (!discord.clientId) throw new Error('CLIENT_ID is required');
    if (!discord.guildId) throw new Error('GUILD_ID is required');
};

validateConfig(); 