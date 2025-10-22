const express = require('express');
const cors = require('cors');
const path = require('path');
const cron = require('node-cron');
const Database = require('./database/database');

const app = express();
const db = new Database();

// Middleware
app.use(cors());
app.use(express.json());
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

// Add new song (called by Discord bot)
app.post('/api/songs', async (req, res) => {
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

        const songId = await db.addSong(spotify_url, title, artist, album, image_url, currentWeek.id);
        
        console.log(`Added song: ${title} by ${artist}`);
        res.status(201).json({ 
            id: songId, 
            message: 'Song added successfully',
            song: { title, artist, album }
        });
    } catch (error) {
        console.error('Error adding song:', error);
        res.status(500).json({ error: 'Failed to add song' });
    }
});

// Add rating for a song
app.post('/api/songs/:id/rate', async (req, res) => {
    try {
        const { id } = req.params;
        const { user_id, rating, review } = req.body;

        if (!user_id || !rating || rating < 1 || rating > 10) {
            return res.status(400).json({ error: 'Valid user_id and rating (1-10) are required' });
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

// Reset songs for new Wednesday (admin endpoint)
app.post('/api/admin/reset', async (req, res) => {
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

// Graceful shutdown
process.on('SIGINT', () => {
    console.log('Shutting down server...');
    db.close();
    process.exit(0);
});

module.exports = app;
