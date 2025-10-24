const express = require('express');
const cors = require('cors');
const path = require('path');
const cron = require('node-cron');
const Database = require('./database/database');


const cookieSession = require('cookie-session');

const passport = require('passport');
const DiscordStrategy = require('passport-discord').Strategy;
const rateLimit = require('express-rate-limit');
const app = express();
// Rate limiting (per IP, can be adjusted)
const apiLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: 10, // limit each IP to 10 requests per minute
    message: { error: 'Too many requests, please try again later.' }
});

// Helper: require Discord login
function requireDiscordLogin(req, res, next) {
    if (req.session && req.session.passport && req.session.passport.user) {
        return next();
    }
    return res.status(401).json({ error: 'Login with Discord required.' });
}
const db = new Database();
// Passport config
passport.serializeUser((user, done) => {
    done(null, user);
});
passport.deserializeUser((obj, done) => {
    done(null, obj);
});

passport.use(new DiscordStrategy({
    clientID: process.env.DISCORD_CLIENT_ID,
    clientSecret: process.env.DISCORD_CLIENT_SECRET,
    callbackURL: process.env.DISCORD_CALLBACK_URL || 'http://localhost:3000/auth/discord/callback',
    scope: ['identify']
}, (accessToken, refreshToken, profile, done) => {
    // You can store user info in DB here if needed
    return done(null, profile);
}));

app.use(passport.initialize());
app.use(passport.session && passport.session());
// Discord OAuth2 login
app.get('/auth/discord', passport.authenticate('discord'));

app.get('/auth/discord/callback',
    passport.authenticate('discord', { failureRedirect: '/' }),
    (req, res) => {
        // Successful authentication, redirect home.
        res.redirect('/');
    }
);

// Logout endpoint
app.get('/logout', (req, res) => {
    req.session = null;
    req.logout && req.logout();
    res.redirect('/');
});

// Endpoint to get current user info
app.get('/api/me', (req, res) => {
    if (req.session && req.session.passport && req.session.passport.user) {
        res.json(req.session.passport.user);
    } else {
        res.status(401).json({ error: 'Not logged in' });
    }
});

// Middleware
app.use(cors());
app.use(express.json());
app.use(cookieSession({
    name: 'session',
    keys: [process.env.SESSION_SECRET || 'devsecret'],
    maxAge: 7 * 24 * 60 * 60 * 1000 // 1 week
}));
app.use(express.static(path.join(__dirname, 'public')));

// API Routes

// Get all active songs
app.get('/api/songs', async (req, res) => {
    try {
        const songs = await db.getActiveSongs();
        res.json(songs);
    } catch (error) {
        console.error('Error fetching songs:', error);
        res.status(500).json({ error: 'Failed to fetch songs' });
    }
});

// Add new song (called by Discord bot or admin)
app.post('/api/songs', apiLimiter, requireDiscordLogin, async (req, res) => {
    try {
        const { spotify_url, title, artist, album, image_url, added_by, message_id } = req.body;
        
        if (!spotify_url) {
            return res.status(400).json({ error: 'Spotify URL is required' });
        }

        // Get current week
        let currentWeek = await db.getCurrentWeek();
        if (!currentWeek) {
            // Create a new week if none exists
            const today = new Date();
            const weekStart = new Date(today);
            weekStart.setDate(today.getDate() - today.getDay() + 3); // Wednesday
            const weekEnd = new Date(weekStart);
            weekEnd.setDate(weekStart.getDate() + 6); // Next Tuesday
            
            const weekId = await db.createWeek(weekStart.toISOString().split('T')[0], weekEnd.toISOString().split('T')[0]);
            currentWeek = { id: weekId };
        }

        const songId = await db.addSong(spotify_url, title, artist, album, image_url, added_by, currentWeek.id);
        
        console.log(`Added song: ${title} by ${artist} (by ${added_by})`);
        res.status(201).json({ 
            id: songId, 
            message: 'Song added successfully',
            song: { title, artist, album, added_by }
        });
    } catch (error) {
        console.error('Error adding song:', error);
        res.status(500).json({ error: 'Failed to add song' });
    }
});

// Add rating for a song
app.post('/api/songs/:id/rate', apiLimiter, requireDiscordLogin, async (req, res) => {
    try {
        const { id } = req.params;
        const { user_id, rating, review } = req.body;

        if (!user_id || !rating || rating < 1 || rating > 7) {
            return res.status(400).json({ error: 'Valid user_id and rating (1-7) are required' });
        }

        const result = await db.addRating(id, user_id, rating, review);
        
        res.json({ 
            message: 'Rating added successfully',
            rating_id: result.id,
            updated: result.updated
        });
    } catch (error) {
        console.error('Error adding rating:', error);
        res.status(500).json({ error: 'Failed to add rating' });
    }
});

// Get ratings for a specific song
app.get('/api/songs/:id/ratings', async (req, res) => {
    try {
        const { id } = req.params;
        const ratings = await db.getSongRatings(id);
        res.json(ratings);
    } catch (error) {
        console.error('Error fetching ratings:', error);
        res.status(500).json({ error: 'Failed to fetch ratings' });
    }
});

// Get all ratings/reviews for all songs
app.get('/api/ratings', async (req, res) => {
    try {
        // Join ratings with song info
        const sql = `
            SELECT r.id, r.song_id, r.user_id, r.rating, r.review, r.created_at, s.title, s.artist, s.spotify_url, s.added_by
            FROM ratings r
            JOIN songs s ON r.song_id = s.id
            ORDER BY r.created_at DESC
        `;
        db.db.all(sql, [], (err, rows) => {
            if (err) {
                console.error('Error fetching all ratings:', err);
                return res.status(500).json({ error: 'Failed to fetch all ratings' });
            }
            res.json(rows);
        });
    } catch (error) {
        console.error('Error in /api/ratings:', error);
        res.status(500).json({ error: 'Failed to fetch all ratings' });
    }
});

// Reset songs for new Wednesday (admin endpoint)
app.post('/api/admin/reset', apiLimiter, requireDiscordLogin, async (req, res) => {
    try {
        await db.resetSongs();
        
        // Create new week
        const today = new Date();
        const weekStart = new Date(today);
        weekStart.setDate(today.getDate() - today.getDay() + 3); // Wednesday
        const weekEnd = new Date(weekStart);
        weekEnd.setDate(weekStart.getDate() + 6); // Next Tuesday
        
        await db.createWeek(weekStart.toISOString().split('T')[0], weekEnd.toISOString().split('T')[0]);
        
        res.json({ message: 'Songs reset for new week' });
    } catch (error) {
        console.error('Error resetting songs:', error);
        res.status(500).json({ error: 'Failed to reset songs' });
    }
});

// Serve the admin song submission page
app.get('/admin', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

// Serve the main page
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Schedule weekly reset (every Wednesday at midnight)
cron.schedule('0 0 * * 3', async () => {
    console.log('Running weekly reset...');
    try {
        await db.resetSongs();
        
        // Create new week
        const today = new Date();
        const weekStart = new Date(today);
        weekStart.setDate(today.getDate() - today.getDay() + 3); // Wednesday
        const weekEnd = new Date(weekStart);
        weekEnd.setDate(weekStart.getDate() + 6); // Next Tuesday
        
        await db.createWeek(weekStart.toISOString().split('T')[0], weekEnd.toISOString().split('T')[0]);
        
        console.log('Weekly reset completed');
    } catch (error) {
        console.error('Error during weekly reset:', error);
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`Visit http://localhost:${PORT} to view the website`);
});

// Start Discord bot if token is provided
if (process.env.DISCORD_TOKEN) {
    const DiscordBot = require('./bot/discord-bot');
    const bot = new DiscordBot();
    bot.start().catch(err => {
        console.error('Failed to start Discord bot:', err);
    });
    console.log('Discord bot starting alongside web server...');
}

// Graceful shutdown
process.on('SIGINT', () => {
    console.log('Shutting down server...');
    db.close();
    process.exit(0);
});

module.exports = app;
