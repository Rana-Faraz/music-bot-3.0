# Discord Music Player Bot (TypeScript)

## Overview

The **Discord Music Player Bot** is a high-performance, feature-rich music bot built using **TypeScript** and **discord.js**. It provides seamless music playback with an advanced queue system per guild, ensuring efficient and optimized audio streaming. The bot leverages **Discord's Voice API**, supports multiple streaming services, and maintains a **maintainable message system using embeds** for better user interaction.

## Features

- **High-performance queue system** per guild for optimized music playback.
- **Supports multiple sources** including YouTube, Spotify, and direct audio links.
- **Embed-based messaging system** for clear and structured responses.
- **Song Information** use `play-dl` only to fetch song information and nothing else
- **Fast and efficient audio streaming** with `youtube-dl-exec` and `@discordjs/voice`.
- **Scalable and maintainable architecture** following SOLID and DRY principles.
- **Environment-based configuration management** using `dotenv`.
- **Auto-reconnect and failover mechanisms** to ensure seamless playback.
- **Concurrency handling** with `better-queue` for efficient request management.

## Tech Stack & Libraries

The bot is built using the following technologies and libraries:

### Core Dependencies

- **[discord.js](https://discord.js.org/)** (`^14.18.0`) - Core framework for interacting with the Discord API.
- **[@discordjs/voice](https://www.npmjs.com/package/@discordjs/voice)** (`^0.18.0`) - Handling Discord voice connections.
- **[@discordjs/rest](https://www.npmjs.com/package/@discordjs/rest)** (`^2.4.3`) - For REST API interactions.
- **[@discordjs/opus](https://www.npmjs.com/package/@discordjs/opus)** (`^0.10.0`) - Opus encoding for high-quality audio streaming.
- **[play-dl](https://www.npmjs.com/package/play-dl)** (`^1.9.7`) - Streaming YouTube, Spotify, and SoundCloud music.
- **[fluent-ffmpeg](https://www.npmjs.com/package/fluent-ffmpeg)** (`^2.1.3`) - Audio processing and transcoding.
- **[youtube-dl-exec](https://www.npmjs.com/package/youtube-dl-exec)** (`^3.0.19`) - YouTube download support.
- **[spotify-web-api-node](https://www.npmjs.com/package/spotify-web-api-node)** (`^5.0.2`) - Spotify integration.

### Queue & Performance Enhancements

- **[better-queue](https://www.npmjs.com/package/better-queue)** (`^3.8.12`) - High-performance queue management.
- **[better-queue-memory](https://www.npmjs.com/package/better-queue-memory)** (`^1.0.4`) - In-memory queue storage for low latency.
- **[axios](https://www.npmjs.com/package/axios)** (`^1.8.4`) - Efficient API requests.
- **[temp](https://www.npmjs.com/package/temp)** (`^0.9.4`) - Temporary file management.
- **[dotenv](https://www.npmjs.com/package/dotenv)** (`^16.4.7`) - Environment variable management.

## Architecture

- **Event-Driven Design**: The bot listens to various events (message commands, slash commands, voice state updates) and responds efficiently.
- **Command Handling**: Uses a modular command structure to maintain a clean and scalable codebase.
- **Embed System**: Messages and responses are formatted using rich embeds for a professional UI.
- **Queue Management**: Implements priority-based music queueing for each guild, ensuring optimized playback and minimal delay.
- **Error Handling & Logging**: Implements structured error handling and logging for better debugging.

## Optimizations & Best Practices

- **Asynchronous Processing**: Ensures non-blocking execution for improved performance.
- **Cache Optimization**: Caches frequently accessed data to reduce redundant API calls.
- **Auto Cleanup**: Ensures unused resources and temp files are cleaned up after usage.
- **Failover Mechanism**: Detects bot crashes or disconnections and attempts to recover gracefully.
- **Modular Configuration**: Constants and configurations are separated to facilitate easy updates.

## Future Enhancements

- Add support for **custom playlists** and song history.
- Implement **voice recognition commands** for hands-free control.
- Introduce a **web-based dashboard** for better bot management.
- Improve **AI-based recommendations** for smarter playlist generation.
