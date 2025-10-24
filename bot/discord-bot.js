const { Client, GatewayIntentBits, Events, EmbedBuilder } = require('discord.js');
const axios = require('axios');
const spotify = require('./spotify-api');
require('dotenv').config();

class DiscordBot {
    constructor() {
        this.client = new Client({
            intents: [
                GatewayIntentBits.Guilds,
                GatewayIntentBits.GuildMessages,
                GatewayIntentBits.MessageContent
            ]
        });

        this.setupEventHandlers();
    this.spotifyTrackRegex = /https:\/\/open\.spotify\.com\/track\/[a-zA-Z0-9]+/g;
    this.spotifyPlaylistRegex = /https:\/\/open\.spotify\.com\/playlist\/[a-zA-Z0-9]+/g;
    }

    setupEventHandlers() {
        this.client.once(Events.ClientReady, (readyClient) => {
            console.log(`Discord bot ready! Logged in as ${readyClient.user.tag}`);
        });

        this.client.on(Events.MessageCreate, async (message) => {
            // Only process messages in the specified channel
            if (message.channel.id !== process.env.DISCORD_CHANNEL_ID) {
                return;
            }

            // Only process messages on Wednesday (commented out for testing)
            const today = new Date();
            // if (today.getDay() !== 3) { // 3 = Wednesday
            //     return;
            // }

            // Check for playlist links first
            const playlistLinks = message.content.match(this.spotifyPlaylistRegex);
            if (playlistLinks && playlistLinks.length > 0) {
                for (const playlistUrl of playlistLinks) {
                    try {
                        console.log(`Processing Spotify playlist link: ${playlistUrl}`);
                        await this.processSpotifyPlaylistLink(playlistUrl, message);
                    } catch (error) {
                        console.error('Error processing Spotify playlist link:', error);
                    }
                }
                // If a playlist is present, skip processing track links in the same message to avoid duplicates
                return;
            }
            // Otherwise, check for track links
            const spotifyLinks = message.content.match(this.spotifyTrackRegex);
            if (spotifyLinks && spotifyLinks.length > 0) {
                for (const link of spotifyLinks) {
                    try {
                        console.log(`Processing Spotify link: ${link}`);
                        await this.processSpotifyLink(link, message);
                    } catch (error) {
                        console.error('Error processing Spotify link:', error);
                    }
                }
            }
        });
    }

    async processSpotifyPlaylistLink(playlistUrl, message) {
        // Extract playlist ID
        const match = playlistUrl.match(/playlist\/([a-zA-Z0-9]+)/);
        if (!match) {
            console.log('Could not extract playlist ID from URL:', playlistUrl);
            return;
        }
        const playlistId = match[1];
        try {
            const tracks = await spotify.getPlaylistTracks(playlistId);
            if (!tracks.length) {
                await message.reply('❌ No tracks found in that playlist.');
                return;
            }
            await message.reply(`⏳ Adding ${tracks.length} tracks from playlist...`);
            let added = 0;
            for (const item of tracks) {
                // Some playlist items may not have a track (e.g. removed)
                const track = item.track;
                if (!track || !track.id) continue;
                // Reuse processSpotifyLink logic, but pass a fake Spotify URL
                const fakeUrl = `https://open.spotify.com/track/${track.id}`;
                // Use a try/catch to avoid one failure stopping the rest
                try {
                    await this.processSpotifyLink(fakeUrl, message, track);
                    added++;
                } catch (err) {
                    console.error('Error adding track from playlist:', err);
                }
                // Add a 200ms delay between requests to avoid rate limits
                await new Promise(res => setTimeout(res, 200));
            }
            await message.reply(`✅ Added ${added} tracks from playlist!`);
        } catch (error) {
            console.error('Error fetching playlist tracks:', error);
            await message.reply('❌ Failed to fetch playlist tracks.');
        }
    }

    async processSpotifyLink(spotifyUrl, message, preFetchedTrack = null) {
        try {
            // Extract track ID from Spotify URL
            const trackId = this.extractTrackId(spotifyUrl);
            if (!trackId) {
                console.log('Could not extract track ID from URL:', spotifyUrl);
                return;
            }

            // Use pre-fetched track if provided (from playlist), else fetch
            const trackInfo = preFetchedTrack || await this.getSpotifyTrackInfo(trackId);

            // Build API URL without double slash
            const baseUrl = (process.env.WEBSITE_URL || 'https://widening-wednesday.onrender.com').replace(/\/$/, '');
            const apiUrl = `${baseUrl}/api/songs`;
            const response = await axios.post(apiUrl, {
                spotify_url: spotifyUrl,
                title: trackInfo.name,
                artist: trackInfo.artists?.[0]?.name || 'Unknown Artist',
                album: trackInfo.album?.name || null,
                image_url: trackInfo.album?.images?.[0]?.url || null,
                added_by: message.author.username,
                message_id: message.id
            });

            if (response.status === 200 || response.status === 201) {
                // Only send confirmation for single tracks, not for every playlist track
                if (!preFetchedTrack) {
                    const embed = new EmbedBuilder()
                        .setTitle('🎵 Song Added to Rating Queue!')
                        .setDescription(`**${trackInfo.name}** by ${trackInfo.artists?.[0]?.name || 'Unknown Artist'}`)
                        .setColor(0x1DB954)
                        .setThumbnail(trackInfo.album?.images?.[0]?.url || null)
                        .addFields(
                            { name: 'Added by', value: message.author.username, inline: true },
                            { name: 'Status', value: 'Ready for rating!', inline: true }
                        )
                        .setTimestamp();

                    await message.reply({ embeds: [embed] });
                }
            }

        } catch (error) {
            console.error('Error processing Spotify link:', error);
            if (!preFetchedTrack) {
                await message.reply('❌ Sorry, I couldn\'t process that Spotify link. Please try again.');
            }
        }
    }

    extractTrackId(url) {
        const match = url.match(/\/track\/([a-zA-Z0-9]+)/);
        return match ? match[1] : null;
    }

    async getSpotifyTrackInfoFromWeb(trackId) {
        try {
            // Try to get track info from Spotify's public web interface
            const response = await axios.get(`https://open.spotify.com/track/${trackId}`, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                    'Accept-Language': 'en-US,en;q=0.5',
                    'Accept-Encoding': 'gzip, deflate, br',
                    'Connection': 'keep-alive',
                    'Upgrade-Insecure-Requests': '1'
                }
            });
            
            const html = response.data;
            console.log('Spotify page HTML length:', html.length);
            
            // Try to extract track info from the page title and meta tags
            const titleMatch = html.match(/<title>(.*?)<\/title>/);
            const artistMatch = html.match(/<meta property="music:musician" content="(.*?)"/);
            const albumMatch = html.match(/<meta property="music:album" content="(.*?)"/);
            const imageMatch = html.match(/<meta property="og:image" content="(.*?)"/);
            
            if (titleMatch) {
                let title = titleMatch[1].replace(' | Spotify', '').trim();
                let artist = artistMatch ? artistMatch[1] : 'Unknown Artist';
                let album = albumMatch ? albumMatch[1] : null;
                let imageUrl = imageMatch ? imageMatch[1] : null;
                
            // Try to parse "Artist - Song" from title if no separate artist meta tag
            // BUT first check if it's the special "Song - song and lyrics by Artist" pattern
            if (!artistMatch && title.includes(' - ') && !title.includes('song and lyrics by')) {
                const parts = title.split(' - ');
                if (parts.length >= 2) {
                    artist = parts[0].trim();
                    title = parts.slice(1).join(' - ').trim();
                }
            }
                
            // Handle special case where title might be "Song - song and lyrics by Artist"
            if (title.includes('song and lyrics by')) {
                // Try splitting on " - song and lyrics by " (with dash and spaces)
                const parts = title.split(' - song and lyrics by ');
                if (parts.length === 2) {
                    title = parts[0].trim();
                    artist = parts[1].trim();
                } else {
                    // If we can't parse it properly, try to clean up the title
                    title = title.replace('song and lyrics by ', '').trim();
                }
            }
                
                console.log(`Extracted from web: Artist="${artist}", Song="${title}", Album="${album}"`);
                
                return {
                    name: title,
                    artists: [{ name: artist }],
                    album: { 
                        name: album,
                        images: [{ url: imageUrl }]
                    }
                };
            }
            
            return null;
        } catch (error) {
            console.error('Error scraping Spotify web page:', error);
            return null;
        }
    }

    async getSpotifyTrackInfo(trackId) {
        try {
            // Use official Spotify API for reliable metadata
            const track = await spotify.getTrack(trackId);
            return {
                name: track.name,
                artists: track.artists,
                album: track.album
            };
        } catch (error) {
            console.error('Error fetching Spotify track info from API:', error);
            return {
                name: 'Unknown Track',
                artists: [{ name: 'Unknown Artist' }],
                album: { name: null, images: [{ url: null }] }
            };
        }
    }

    async start() {
        try {
            await this.client.login(process.env.DISCORD_TOKEN);
        } catch (error) {
            console.error('Error starting Discord bot:', error);
            process.exit(1);
        }
    }

    async stop() {
        await this.client.destroy();
    }
}


// Start the bot and a minimal HTTP server for Koyeb health checks
if (require.main === module) {
    const bot = new DiscordBot();
    bot.start();

    // Minimal HTTP server for health check
    const http = require('http');
    const PORT = process.env.PORT || 8000;
    http.createServer((req, res) => {
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        res.end('OK');
    }).listen(PORT, () => {
        console.log(`Health check server running on port ${PORT}`);
    });

    // Graceful shutdown
    process.on('SIGINT', async () => {
        console.log('Shutting down Discord bot...');
        await bot.stop();
        process.exit(0);
    });
}

module.exports = DiscordBot;
