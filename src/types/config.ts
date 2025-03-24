export interface BotConfig {
    discord: {
        token: string;
        clientId: string;
        guildId: string;
    };
    spotify?: {
        clientId: string;
        clientSecret: string;
    };
    prefix: string;
}

export interface EnvironmentConfig {
    NODE_ENV: string;
    isProd: boolean;
    isDev: boolean;
} 