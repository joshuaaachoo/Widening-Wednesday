#!/bin/bash

# Wednesday Spotify Rater Startup Script

echo "🎵 Starting Wednesday Spotify Rater..."
echo ""

# Check if .env file exists
if [ ! -f .env ]; then
    echo "❌ .env file not found!"
    echo "Please copy env.example to .env and configure your settings:"
    echo "cp env.example .env"
    echo ""
    echo "Then edit .env with your Discord bot token and server details."
    exit 1
fi

# Check if node_modules exists
if [ ! -d node_modules ]; then
    echo "📦 Installing dependencies..."
    npm install
    echo ""
fi

echo "🚀 Starting services..."
echo ""

# Start the website server in background
echo "Starting website server on port 3000..."
npm start &
SERVER_PID=$!

# Wait a moment for server to start
sleep 2

# Start the Discord bot
echo "Starting Discord bot..."
npm run bot &
BOT_PID=$!

echo ""
echo "✅ Both services are running!"
echo "🌐 Website: http://localhost:3000"
echo "🤖 Discord bot is monitoring for Spotify links"
echo ""
echo "Press Ctrl+C to stop both services"

# Function to cleanup on exit
cleanup() {
    echo ""
    echo "🛑 Stopping services..."
    kill $SERVER_PID 2>/dev/null
    kill $BOT_PID 2>/dev/null
    echo "✅ Services stopped"
    exit 0
}

# Trap Ctrl+C
trap cleanup SIGINT

# Wait for processes
wait
