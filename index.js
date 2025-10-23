// Replit entry point - runs both web server and Discord bot
const { spawn } = require('child_process');

console.log('Starting Wednesday Spotify Rater...');

// Start the web server
const server = spawn('node', ['server.js'], {
    stdio: 'inherit'
});

// Start the Discord bot
const bot = spawn('node', ['bot/discord-bot.js'], {
    stdio: 'inherit'
});

// Handle process cleanup
process.on('SIGINT', () => {
    console.log('\nShutting down...');
    server.kill();
    bot.kill();
    process.exit(0);
});

server.on('error', (err) => {
    console.error('Server error:', err);
});

bot.on('error', (err) => {
    console.error('Bot error:', err);
});

console.log('Web server and Discord bot starting...');
