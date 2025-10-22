# Wednesday Spotify Rater

A Discord bot and website that work together to collect and rate Spotify songs shared every Wednesday.

## Features

- **Discord Bot**: Automatically detects Spotify links in a specific channel every Wednesday
- **Website**: Beautiful, user-friendly interface for rating songs (1-10 scale)
- **Real-time Updates**: Songs appear on the website as soon as the bot detects them
- **Weekly Reset**: Automatically resets every Wednesday for new songs
- **Optional Reviews**: Users can leave written reviews along with ratings
- **Statistics**: Shows average ratings and rating counts

## Setup Instructions

### 1. Prerequisites

- Node.js (v16 or higher)
- A Discord server where you have admin permissions
- A Discord bot token

### 2. Discord Bot Setup

1. Go to [Discord Developer Portal](https://discord.com/developers/applications)
2. Create a new application
3. Go to the "Bot" section and create a bot
4. Copy the bot token
5. Go to "OAuth2" > "URL Generator"
6. Select "bot" scope and "Read Messages" and "Send Messages" permissions
7. Use the generated URL to invite the bot to your server

### 3. Installation

1. Clone or download this repository
2. Install dependencies:
   ```bash
   npm install
   ```

3. Copy the environment file:
   ```bash
   cp env.example .env
   ```

4. Edit `.env` with your configuration:
   ```
   DISCORD_TOKEN=your_discord_bot_token_here
   DISCORD_CLIENT_ID=your_discord_client_id_here
   DISCORD_GUILD_ID=your_discord_server_id_here
   DISCORD_CHANNEL_ID=your_wednesday_channel_id_here
   PORT=3000
   NODE_ENV=development
   DATABASE_URL=./database.sqlite
   ```

### 4. Getting Discord IDs

- **Guild ID**: Right-click your server name → "Copy Server ID"
- **Channel ID**: Right-click the channel → "Copy Channel ID"
- **Client ID**: Found in your Discord application's "General Information" page

### 5. Running the Application

#### Development Mode (with auto-restart):
```bash
# Terminal 1 - Start the website
npm run dev

# Terminal 2 - Start the Discord bot
npm run dev-bot
```

#### Production Mode:
```bash
# Terminal 1 - Start the website
npm start

# Terminal 2 - Start the Discord bot
npm run bot
```

### 6. Access the Website

Open your browser and go to `http://localhost:3000`

## How It Works

1. **Wednesday Detection**: The bot only processes messages on Wednesdays
2. **Spotify Link Detection**: Automatically finds Spotify track links in messages
3. **Real-time Updates**: Songs are immediately sent to the website API
4. **User Rating**: Users can rate songs on a 1-10 scale with optional reviews
5. **Weekly Reset**: Every Wednesday at midnight, the system resets for new songs

## API Endpoints

- `GET /api/songs` - Get all active songs
- `POST /api/songs` - Add new song (used by Discord bot)
- `POST /api/songs/:id/rate` - Submit rating for a song
- `GET /api/songs/:id/ratings` - Get ratings for a specific song
- `POST /api/admin/reset` - Manually reset songs (admin)

## Database

The application uses SQLite for simplicity. The database file will be created automatically at `./database.sqlite`.

### Tables:
- `songs` - Stores song information
- `ratings` - Stores user ratings and reviews
- `weeks` - Tracks weekly periods

## Customization

### Changing the Day
To change from Wednesday to another day, modify the cron schedule in `server.js`:
```javascript
// Change '3' to desired day (0=Sunday, 1=Monday, etc.)
cron.schedule('0 0 * * 3', async () => {
```

### Styling
The website uses a modern, responsive design. You can customize the CSS in `public/index.html`.

### Discord Bot Features
The bot can be extended with additional features like:
- Spotify API integration for better track information
- Playlist creation
- Advanced moderation features

## Troubleshooting

### Bot Not Responding
- Check that the bot token is correct
- Ensure the bot has proper permissions in your server
- Verify the channel ID is correct

### Songs Not Appearing
- Check that messages are being sent on Wednesday
- Verify the channel ID matches your target channel
- Check the server logs for errors

### Database Issues
- Delete `database.sqlite` to reset the database
- Check file permissions in the project directory

## Contributing

Feel free to submit issues and enhancement requests!

## License

MIT License - feel free to use this project for your own purposes.
