# Dockerfile for Discord Bot
FROM node:18-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy application files
COPY . .

# Run the Discord bot
CMD ["node", "bot/discord-bot.js"]
