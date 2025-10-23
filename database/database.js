const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

class Database {
    constructor() {
        this.db = null;
        this.init();
    }

    init() {
        const dbPath = process.env.DATABASE_URL || './database.sqlite';
        
        // Ensure database directory exists
        const dbDir = path.dirname(dbPath);
        if (!fs.existsSync(dbDir)) {
            fs.mkdirSync(dbDir, { recursive: true });
        }

        this.db = new sqlite3.Database(dbPath, (err) => {
            if (err) {
                console.error('Error opening database:', err.message);
            } else {
                console.log('Connected to SQLite database');
                this.createTables();
            }
        });
    }

    createTables() {
        const fs = require('fs');
        const schemaPath = path.join(__dirname, 'schema.sql');
        const schema = fs.readFileSync(schemaPath, 'utf8');
        
        this.db.exec(schema, (err) => {
            if (err) {
                console.error('Error creating tables:', err.message);
            } else {
                console.log('Database tables created successfully');
            }
        });
    }

    // Song operations
    addSong(spotifyUrl, title = null, artist = null, album = null, imageUrl = null, weekId = null) {
        return new Promise((resolve, reject) => {
            const sql = `
                INSERT INTO songs (spotify_url, title, artist, album, image_url, week_id)
                VALUES (?, ?, ?, ?, ?, ?)
            `;
            this.db.run(sql, [spotifyUrl, title, artist, album, imageUrl, weekId], function(err) {
                if (err) {
                    reject(err);
                } else {
                    resolve(this.lastID);
                }
            });
        });
    }

    getActiveSongs() {
        return new Promise((resolve, reject) => {
            const sql = `
                SELECT s.*, 
                       AVG(r.rating) as avg_rating,
                       COUNT(r.id) as rating_count
                FROM songs s
                LEFT JOIN ratings r ON s.id = r.song_id
                WHERE s.is_active = 1
                GROUP BY s.id
                ORDER BY s.added_date DESC
            `;
            this.db.all(sql, [], (err, rows) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(rows);
                }
            });
        });
    }

    // Rating operations
    addRating(songId, userId, rating, review = null) {
        return new Promise((resolve, reject) => {
            // First, check if user already rated this song
            const checkSql = 'SELECT id FROM ratings WHERE song_id = ? AND user_id = ?';
            this.db.get(checkSql, [songId, userId], (err, row) => {
                if (err) {
                    reject(err);
                    return;
                }

                if (row) {
                    // Update existing rating
                    const updateSql = `
                        UPDATE ratings 
                        SET rating = ?, review = ?, created_at = CURRENT_TIMESTAMP
                        WHERE song_id = ? AND user_id = ?
                    `;
                    this.db.run(updateSql, [rating, review, songId, userId], function(err) {
                        if (err) {
                            reject(err);
                        } else {
                            resolve({ id: row.id, updated: true });
                        }
                    });
                } else {
                    // Insert new rating
                    const insertSql = `
                        INSERT INTO ratings (song_id, user_id, rating, review)
                        VALUES (?, ?, ?, ?)
                    `;
                    this.db.run(insertSql, [songId, userId, rating, review], function(err) {
                        if (err) {
                            reject(err);
                        } else {
                            resolve({ id: this.lastID, updated: false });
                        }
                    });
                }
            });
        });
    }

    getSongRatings(songId) {
        return new Promise((resolve, reject) => {
            const sql = `
                SELECT r.*, s.title, s.artist
                FROM ratings r
                JOIN songs s ON r.song_id = s.id
                WHERE r.song_id = ?
                ORDER BY r.created_at DESC
            `;
            this.db.all(sql, [songId], (err, rows) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(rows);
                }
            });
        });
    }

    // Week operations
    createWeek(weekStart, weekEnd) {
        return new Promise((resolve, reject) => {
            // First, deactivate current week
            this.db.run('UPDATE weeks SET is_active = 0', (err) => {
                if (err) {
                    reject(err);
                    return;
                }

                // Create new week
                const sql = `
                    INSERT INTO weeks (week_start, week_end, is_active)
                    VALUES (?, ?, 1)
                `;
                this.db.run(sql, [weekStart, weekEnd], function(err) {
                    if (err) {
                        reject(err);
                    } else {
                        resolve(this.lastID);
                    }
                });
            });
        });
    }

    getCurrentWeek() {
        return new Promise((resolve, reject) => {
            const sql = 'SELECT * FROM weeks WHERE is_active = 1 LIMIT 1';
            this.db.get(sql, [], (err, row) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(row);
                }
            });
        });
    }

    resetSongs() {
        return new Promise((resolve, reject) => {
            const sql = 'UPDATE songs SET is_active = 0';
            this.db.run(sql, [], function(err) {
                if (err) {
                    reject(err);
                } else {
                    resolve(this.changes);
                }
            });
        });
    }

    close() {
        if (this.db) {
            this.db.close((err) => {
                if (err) {
                    console.error('Error closing database:', err.message);
                } else {
                    console.log('Database connection closed');
                }
            });
        }
    }
}

module.exports = Database;

