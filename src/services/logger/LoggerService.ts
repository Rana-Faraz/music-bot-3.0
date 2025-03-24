import winston from 'winston';
import { environment } from '../../config';

const { combine, timestamp, printf, colorize, align } = winston.format;

class LoggerService {
    private static instance: LoggerService;
    private logger: winston.Logger;

    private constructor() {
        this.logger = this.createLogger();
    }

    public static getInstance(): LoggerService {
        if (!LoggerService.instance) {
            LoggerService.instance = new LoggerService();
        }
        return LoggerService.instance;
    }

    private createLogger(): winston.Logger {
        const customFormat = printf(({ level, message, timestamp, ...metadata }) => {
            const metaStr = Object.keys(metadata).length 
                ? `\n${JSON.stringify(metadata, null, 2)}`
                : '';
            
            return `${timestamp} | ${level.padEnd(7)} | ${message}${metaStr}`;
        });

        return winston.createLogger({
            level: environment.isDev ? 'debug' : 'info',
            format: combine(
                colorize({ all: true }),
                timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
                align(),
                customFormat
            ),
            transports: [
                new winston.transports.Console(),
                new winston.transports.File({ 
                    filename: 'logs/error.log', 
                    level: 'error',
                    format: combine(
                        timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
                        align(),
                        customFormat
                    )
                }),
                new winston.transports.File({ 
                    filename: 'logs/combined.log',
                    format: combine(
                        timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
                        align(),
                        customFormat
                    )
                })
            ]
        });
    }

    public info(message: string, meta?: object): void {
        this.logger.info(message, meta);
    }

    public error(message: string, error?: Error | unknown, meta?: object): void {
        const errorMeta = error instanceof Error 
            ? { 
                error: {
                    message: error.message,
                    stack: error.stack,
                    name: error.name
                }
            }
            : { error };

        this.logger.error(message, { ...errorMeta, ...meta });
    }

    public warn(message: string, meta?: object): void {
        this.logger.warn(message, meta);
    }

    public debug(message: string, meta?: object): void {
        this.logger.debug(message, meta);
    }

    public getLogger(): winston.Logger {
        return this.logger;
    }
}

export const logger = LoggerService.getInstance(); 