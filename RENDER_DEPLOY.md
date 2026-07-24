# Deploying DOMINANCE on Render (Free Tier)

Since the server already serves the React build statically, everything runs as
**one single Render Web Service** — no separate frontend host needed.

---

## Step 1 — Push to GitHub

Create a new GitHub repo and push the entire `dominance_v7/` folder:

```bash
git init
git add .
git commit -m "dominance v7"
git remote add origin https://github.com/YOUR_USER/dominance.git
git push -u origin main
```

---

## Step 2 — Create Render Web Service

1. Go to [render.com](https://render.com) → sign up free
2. Click **New → Web Service**
3. Connect your GitHub repo
4. Fill in settings:

| Field | Value |
|-------|-------|
| **Name** | `dominance` (or anything) |
| **Root Directory** | *(leave blank)* |
| **Environment** | `Node` |
| **Build Command** | `cd client && npm install && npm run build && cd ../server && npm install` |
| **Start Command** | `cd server && node index.js` |
| **Instance Type** | `Free` |

5. Add **Environment Variables**:

| Key | Value |
|-----|-------|
| `NODE_ENV` | `production` |
| `ADMIN_PASSWORD` | pick a real password — full admin panel access |
| `ZONE_PASSWORD` | pick a different password — zone-laptop access only |

Without these, the server falls back to an insecure default and logs a warning — fine for a quick demo, not for a real event with the repo on GitHub.

6. Click **Create Web Service**

Render will build and deploy. Takes ~2-3 minutes.

---

## Step 3 — Get your URL

Once deployed, Render gives you a URL like:
```
https://dominance-xxxx.onrender.com
```

That's your single URL for everything.

---

## Step 4 — Test it

| Screen | URL |
|--------|-----|
| Participant join | `https://dominance-xxxx.onrender.com/` |
| Admin panel | `https://dominance-xxxx.onrender.com/admin` |
| Spectator | `https://dominance-xxxx.onrender.com/spectator` |
| Health check | `https://dominance-xxxx.onrender.com/health` |

Admin/zone passwords: whatever you set as `ADMIN_PASSWORD` / `ZONE_PASSWORD` above.

---

## ⚠️ Render Free Tier Caveats

### Cold Starts
Free services **spin down after 15 minutes of inactivity**.
- First request after idle takes ~30 seconds to wake up
- For a demo, just open the URL 1 minute before you show it
- Or use [UptimeRobot](https://uptimerobot.com) (free) to ping `/health` every 5 min to keep it warm

### Ephemeral Disk
Render free has no persistent disk — **db.json resets on every redeploy/restart**.
- This is fine for a demo — just seed the data through the admin panel after each start
- For production events, upgrade to Render's paid plan ($7/mo) which has a persistent disk,
  or switch to Railway (free tier also resets but has a bit more RAM)

### WebSocket Support
✅ Render free fully supports WebSockets — Socket.io will work fine.

---

## Quick Reset (if db gets messy)

Just go to Render dashboard → your service → **Manual Deploy → Deploy latest commit**.
The server restarts fresh with an empty DB.

---

## Optional: Keep it warm (free)

1. Go to [uptimerobot.com](https://uptimerobot.com) → create free account
2. Add a new monitor: **HTTP(s)**, URL = `https://dominance-xxxx.onrender.com/health`
3. Set interval to **5 minutes**
4. Done — no more cold starts during your demo
