# DOMINANCE v3 — Deployment Guide

## Option A: Railway (Backend) + Vercel (Frontend) — RECOMMENDED for 200 users

This is the best setup for your event. Free tier handles 200 concurrent users easily.

---

### STEP 1: Deploy Backend to Railway

1. Go to [railway.app](https://railway.app) → Sign up with GitHub (free)
2. Click **"New Project"** → **"Deploy from GitHub repo"**
   - If your code isn't on GitHub yet: create a repo, push the `dominance/server/` folder to it
   - OR use **"Deploy from local"** option
3. Railway will auto-detect Node.js
4. Go to **Settings → Environment Variables** and add:
   ```
   NODE_ENV=production
   CLIENT_URL=https://your-vercel-app.vercel.app
   ```
   (Fill CLIENT_URL after step 2)
5. Go to **Settings → Networking** → **Generate Domain**
6. Copy your Railway URL: `https://dominance-xxx.railway.app`

---

### STEP 2: Deploy Frontend to Vercel

1. Go to [vercel.com](https://vercel.com) → Sign up with GitHub (free)
2. Click **"New Project"** → Import your repo (or the `dominance/client/` folder)
3. Set **Framework Preset**: Vite
4. Set **Root Directory**: `client` (if deploying from monorepo)
5. Add **Environment Variable**:
   ```
   VITE_SERVER_URL=https://dominance-xxx.railway.app
   ```
   (Use the Railway URL from Step 1)
6. Click **Deploy**
7. Copy your Vercel URL: `https://dominance-yyy.vercel.app`

---

### STEP 3: Link them together

1. Go back to Railway → Environment Variables
2. Update `CLIENT_URL` to your Vercel URL
3. Railway will redeploy automatically

---

### STEP 4: Initialize the database

The database auto-creates on first server start. No manual seed needed.

After deployment, open:
`https://dominance-xxx.railway.app/health`

You should see: `{"status":"ok","phase":"setup"}`

---

### STEP 5: Test before event day

1. Open `https://dominance-yyy.vercel.app/admin` → Token: `dominance2024`
2. Register 2 test teams
3. Create 1 test zone
4. Open `/` on a phone → join a test team
5. Open `/zone/[ZONE_ID]` on another device
6. Run through the full flow once

---

## Option B: Local Network (Hotspot) — Backup / No Internet

If you prefer to run everything locally on event day:

```bash
# 1. Install dependencies
cd dominance/server && npm install
cd ../client && npm install

# 2. Start both
cd .. && npx concurrently "cd server && npm run dev" "cd client && npm run dev"

# 3. Find your IP
# Windows: ipconfig → look for IPv4 under your hotspot adapter
# Mac/Linux: ifconfig | grep inet

# 4. Share with everyone:
# Teams: http://192.168.x.x:5173/
# Zones: http://192.168.x.x:5173/zone/[ZONE_ID]
# Admin: http://192.168.x.x:5173/admin
# Spectator: http://192.168.x.x:5173/spectator
```

**Hotspot note:** A mobile hotspot can handle 200 users but may slow down. Use a WiFi router if possible.

---

## Resetting the database

To wipe all data and start fresh:

```bash
cd server
node data/seed.js
```

Or if deployed on Railway, set the env variable `RESET_DB=true` and redeploy once, then remove it.

---

## Environment Variables Reference

### Server (Railway)
| Variable | Value | Required |
|----------|-------|----------|
| `PORT` | Auto-set by Railway | No |
| `NODE_ENV` | `production` | Yes |
| `CLIENT_URL` | Your Vercel URL | Yes |

### Client (Vercel)
| Variable | Value | Required |
|----------|-------|----------|
| `VITE_SERVER_URL` | Your Railway URL | Yes |

---

## URLs for event day

| Screen | URL |
|--------|-----|
| Participant join | `https://your-vercel-app.vercel.app/` |
| Admin panel | `https://your-vercel-app.vercel.app/admin` |
| Spectator board | `https://your-vercel-app.vercel.app/spectator` |
| Zone laptop | `https://your-vercel-app.vercel.app/zone/[ZONE_ID]` |

Admin token: `dominance2024`
