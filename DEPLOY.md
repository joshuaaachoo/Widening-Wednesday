# Deploying to Render

## Step 1: Push to GitHub

Make sure your latest changes are committed and pushed:

```bash
git add .
git commit -m "Add Render deployment configuration"
git push origin feature/lady-tori-shotgun
```

## Step 2: Create Render Account

1. Go to [render.com](https://render.com)
2. Sign up with your GitHub account (easiest option)

## Step 3: Deploy from GitHub

### Option A: Using Blueprint (Recommended - Automated)

1. In Render dashboard, click **"New +"** → **"Blueprint"**
2. Connect your GitHub repository: `joshuaaachoo/rift-rewind`
3. Select the `feature/lady-tori-shotgun` branch
4. Render will automatically detect the `render.yaml` file
5. Click **"Apply"**

### Option B: Manual Setup

1. In Render dashboard, click **"New +"** → **"Web Service"**
2. Connect your GitHub repository: `joshuaaachoo/rift-rewind`
3. Configure:
   - **Name:** wednesday-spotify-rater
   - **Branch:** feature/lady-tori-shotgun
   - **Runtime:** Node
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
4. Add a **Disk** for persistent SQLite storage:
   - Name: `sqlite-data`
   - Mount Path: `/opt/render/project/src`
   - Size: 1GB
5. Click **"Create Web Service"**

## Step 4: Set Environment Variables

In your Render service dashboard, go to **"Environment"** and add:

### Required Variables:
- `NODE_ENV` = `production`
- `PORT` = `3000` (usually auto-set by Render)
- `DATABASE_URL` = `/opt/render/project/src/database.sqlite`

### For Discord Bot (if running):
- `DISCORD_TOKEN` = Your Discord bot token
- `DISCORD_CHANNEL_ID` = Your Discord channel ID
- `WEBSITE_URL` = Your Render URL (e.g., `https://wednesday-spotify-rater.onrender.com`)

## Step 5: Deploy!

- Click **"Manual Deploy"** → **"Deploy latest commit"**
- Wait 2-3 minutes for the build to complete
- Your site will be live at: `https://YOUR-SERVICE-NAME.onrender.com`

## Important Notes

### Free Tier Limitations:
- ✅ Your app will be live 24/7
- ⚠️ Sleeps after 15 minutes of inactivity
- ⚠️ Takes ~30-60 seconds to wake up on first request
- ✅ Database persists (won't lose data)
- ✅ 750 hours/month (enough for small projects)

### To Keep It Awake (Optional):
Use a service like [UptimeRobot](https://uptimerobot.com) to ping your URL every 5 minutes (free tier).

### Auto-Deploy:
Render will automatically redeploy when you push to GitHub (you can configure this in settings).

## Troubleshooting

**Build fails?**
- Check the logs in Render dashboard
- Make sure `package.json` has all dependencies

**Database not persisting?**
- Verify the disk is mounted at `/opt/render/project/src`
- Check `DATABASE_URL` environment variable

**App crashes on startup?**
- Check environment variables are set correctly
- View logs in Render dashboard

## Running the Discord Bot on Render

If you want the Discord bot to run alongside the web server, you have two options:

### Option 1: Separate Service (Recommended)
Create a second "Background Worker" service for the bot:
1. **New +** → **Background Worker**
2. Connect same repo
3. **Start Command:** `node bot/discord-bot.js`
4. Add same environment variables

### Option 2: Single Service
Modify `server.js` to start the bot:
```javascript
// At the end of server.js
const DiscordBot = require('./bot/discord-bot');
if (process.env.DISCORD_TOKEN) {
    const bot = new DiscordBot();
    bot.start();
}
```

---

**Need help?** Check out [Render's Node.js docs](https://render.com/docs/deploy-node-express-app)
