# Discord Music Bot

A high-quality Discord music bot built with TypeScript that can play music from YouTube and Spotify.

## Features

- Play music from YouTube videos and playlists
- Stream music from Spotify
- Queue system with skip, pause, resume functionality
- Volume control
- Search for songs
- Display currently playing track with progress

## Prerequisites

- Node.js 16.x or higher
- Discord Bot Token (from [Discord Developer Portal](https://discord.com/developers/applications))
- Spotify Developer API credentials (optional, for Spotify support)

## Setup

1. Clone this repository
2. Install dependencies
   ```
   npm install
   ```
3. Copy `.env.example` to `.env` and fill in your tokens and credentials
   ```
   cp .env.example .env
   ```
4. Build the bot
   ```
   npm run build
   ```
5. Start the bot
   ```
   npm start
   ```

## Development

Run the bot in development mode with hot reloading:

```
npm run dev
```

## Commands

- `!play <song name or URL>` - Play a song from YouTube or Spotify
- `!skip` - Skip the current song
- `!stop` - Stop playback and clear queue
- `!pause` - Pause the current song
- `!resume` - Resume playback
- `!queue` - Show the current queue
- `!volume <1-100>` - Set the volume
- `!nowplaying` - Show currently playing song
- `!help` - Show all commands

## Architecture

This bot follows SOLID and DRY principles with a clear separation of concerns:

- `commands/` - Command handlers
- `services/` - Core services (music, Spotify, YouTube)
- `events/` - Discord event handlers
- `models/` - Type definitions and interfaces
- `utils/` - Utility functions

## License

ISC
