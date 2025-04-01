import { DiscordClientService } from './services/discord/DiscordClientService';
import { logger } from './services/logger/LoggerService';
import { ErrorType } from './types/error';

async function bootstrap() {
    try {
        const discordService = DiscordClientService.getInstance();
        const connectResult = await discordService.connect();

        if (connectResult.isErr()) {
            throw connectResult.error;
        }

        // Handle process termination
        const cleanup = async () => {
            logger.info('Initiating graceful shutdown...');
            const disconnectResult = await discordService.disconnect();
            
            if (disconnectResult.isErr()) {
                logger.error(
                    'Error during disconnect',
                    disconnectResult.error,
                    { errorType: ErrorType.Discord }
                );
                process.exit(1);
            }

            logger.info('Graceful shutdown completed');
            process.exit(0);
        };

        process.on('SIGINT', cleanup);
        process.on('SIGTERM', cleanup);

        // Global error handlers
        process.on('uncaughtException', async (error) => {
            logger.error('Uncaught Exception', error, {
                errorType: ErrorType.Unknown
            });
            await cleanup();
        });

        process.on('unhandledRejection', async (reason) => {
            logger.error('Unhandled Rejection', reason, {
                errorType: ErrorType.Unknown
            });
            await cleanup();
        });

    } catch (error) {
        logger.error('Fatal error during bootstrap', error, {
            errorType: ErrorType.Unknown
        });
        process.exit(1);
    }
}

// Start the application
logger.info('Starting Discord Music Bot...');
bootstrap();
