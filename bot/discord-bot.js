const { Client, GatewayIntentBits, Events, EmbedBuilder } = require('discord.js');
const axios = require('axios');
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
        this.spotifyRegex = /https:\/\/open\.spotify\.com\/track\/[a-zA-Z0-9]+/g;
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

            // Check if message contains Spotify links
            const spotifyLinks = message.content.match(this.spotifyRegex);
            if (spotifyLinks && spotifyLinks.length > 0) {
                console.log(`Found ${spotifyLinks.length} Spotify link(s) in message:`, message.content);
                
                for (const link of spotifyLinks) {
                    try {
                        console.log(`Processing Spotify link: ${link}`);
                        await this.processSpotifyLink(link, message);
                    } catch (error) {
                        console.error('Error processing Spotify link:', error);
                    }
                }
            } else {
                console.log(`No Spotify links found in message: "${message.content}"`);
            }
        });
    }

    async processSpotifyLink(spotifyUrl, message) {
        try {
            // Extract track ID from Spotify URL
            const trackId = this.extractTrackId(spotifyUrl);
            if (!trackId) {
                console.log('Could not extract track ID from URL:', spotifyUrl);
                return;
            }

            // Get track information from Spotify (you'll need to implement this)
            const trackInfo = await this.getSpotifyTrackInfo(trackId);
            
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
                // Send confirmation to Discord
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

        } catch (error) {
            console.error('Error processing Spotify link:', error);
            await message.reply('❌ Sorry, I couldn\'t process that Spotify link. Please try again.');
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
            // Try scraping Spotify web page first
            console.log('Trying Spotify web scraping...');
            const webResult = await this.getSpotifyTrackInfoFromWeb(trackId);
            if (webResult) {
                return webResult;
            }
            
            // Try alternative: Last.fm API (no auth required)
            try {
                console.log('Trying Last.fm API...');
                const lastfmResponse = await axios.get(`http://ws.audioscrobbler.com/2.0/?method=track.getInfo&api_key=your_lastfm_api_key&track=${encodeURIComponent('track name')}&artist=${encodeURIComponent('artist name')}&format=json`);
                // This would require the track name and artist, so we'll skip for now
            } catch (lastfmError) {
                console.log('Last.fm API not available');
            }
            
            // Fallback to oEmbed API
            console.log('Web scraping failed, trying oEmbed...');
            const response = await axios.get(`https://open.spotify.com/oembed?url=https://open.spotify.com/track/${trackId}`);
            const data = response.data;
            
            console.log('Spotify oEmbed response:', JSON.stringify(data, null, 2));
            
            // For oEmbed, we can only get the title, so we'll use that as the song name
            let artist = 'Unknown Artist';
            let songName = data.title || 'Unknown Track';
            
            // Handle "song and lyrics by" pattern in oEmbed
            if (songName.includes('song and lyrics by')) {
                // Try to extract artist and song from "song and lyrics by Artist by Song"
                const match = songName.match(/song and lyrics by (.+?) by (.+)/);
                if (match) {
                    artist = match[1].trim();
                    songName = match[2].trim();
                } else {
                    // Try "song and lyrics by Artist - Song"
                    const match2 = songName.match(/song and lyrics by (.+?) - (.+)/);
                    if (match2) {
                        artist = match2[1].trim();
                        songName = match2[2].trim();
                    } else {
                        // Just remove the prefix
                        songName = songName.replace('song and lyrics by ', '').trim();
                    }
                }
            } else if (songName.includes(' - ')) {
                // Try to parse "Artist - Song" pattern
                const parts = songName.split(' - ');
                if (parts.length >= 2) {
                    artist = parts[0].trim();
                    songName = parts.slice(1).join(' - ').trim();
                }
            }
            
            console.log(`Parsed: Artist="${artist}", Song="${songName}"`);
            
            return {
                name: songName,
                artists: [{ name: artist }],
                album: { 
                    name: null,
                    images: [{ url: data.thumbnail_url || null }]
                }
            };
            
        } catch (error) {
            console.error('Error fetching Spotify track info:', error);
            // Final fallback
            return {
                name: 'Unknown Track',
                artists: [{ name: 'Unknown Artist' }],
                album: { 
                    name: null,
                    images: [{ url: null }]
                }
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

// Start the bot if this file is run directly
if (require.main === module) {
    const bot = new DiscordBot();
    bot.start();

    // Graceful shutdown
    process.on('SIGINT', async () => {
        console.log('Shutting down Discord bot...');
        await bot.stop();
        process.exit(0);
    });
}

module.exports = DiscordBot;
