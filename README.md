# DOMINANCE — Event App
### Ebulliance Tech Fest · Reboot × CSI × NCC

---

## ✨ WHAT'S NEW

- **Real auth** — env-based admin/zone passwords (never shipped in the client bundle), login lockout after repeated failures, a separate lower-privilege Zone Operator password
- **Auto-recovery** — timestamped local snapshots every 5 min + before any risky action, one-click restore from the Backup tab
- **Event archive** — Factory Reset now auto-archives the completed event (teams, scores, top 3) before wiping, downloadable from the Backup tab
- **Offline QR codes** — generated fully client-side, no internet dependency (the old version called a third-party API — broken on a no-internet hotspot deployment)
- **Printable passcode cards** — big-font, print-ready sheet for the registration desk
- **"Need Help" button** — team dashboard can ping admin/floaters in real time with team name + phase
- **Live analytics** — hardest gauntlet rounds, hardest zones, hardest quiz questions, all computed live, no setup needed
- **Sound & hype mode** — synthesized capture/elimination/winner sound effects on the Spectator screen (mutable)
- **Live rank toasts** — teams get notified when their leaderboard position changes
- **Dark/light theme toggle** — on every screen
- **Installable PWA** — add-to-homescreen on phones, resilient to brief WiFi drops (auto rejoins its room on reconnect)

---

## ⚡ QUICK START (do this in order)

### Step 1 — Install dependencies
```bash
cd dominance
npm install          # installs concurrently at root
cd server && npm install
cd ../client && npm install
```

### Step 2 — Seed the database
```bash
cd server
node data/seed.js
```
This creates all 10 teams, 6 zones, 25 questions. Run again to reset.

### Step 3 — Start everything
```bash
cd ..              # back to dominance/ root
npx concurrently "cd server && npm run dev" "cd client && npm run dev"
```

- **Server** → http://localhost:4000
- **Client** → http://localhost:3000

---

## 🌐 URLS

| Screen | URL | Who |
|--------|-----|-----|
| Team Join | `http://[YOUR_IP]:3000` | All participants |
| Admin Panel | `http://localhost:3000/admin` | You (tech lead) |
| Spectator | `http://localhost:3000/spectator` | Projector screen |

**Find your IP:** Run `ipconfig` (Windows) or `ifconfig` (Mac/Linux). Use the IPv4 address under your hotspot/WiFi adapter.

---

## 🔐 CREDENTIALS

Admin/zone passwords are **no longer hardcoded** — they're read from environment variables so the real password never ships inside the public client bundle.

1. Copy `server/.env.example` to `server/.env`
2. Set `ADMIN_PASSWORD` (full admin panel) and `ZONE_PASSWORD` (zone-laptop only — give this to Zone Operators instead of the admin password)
3. Restart the server

If unset, it falls back to the old default (`dominance2024`) with a loud console warning — fine for local testing, **do not leave it unset for a real event**.

Team passcodes are now auto-generated per team at registration (no fixed list) — see the Setup tab or the printable Passcode Cards in QR & Cards tab.

---

## 📋 EVENT DAY FLOW

### Before participants arrive:
1. Run `node data/seed.js` to reset everything clean
2. Start servers with `npx concurrently ...`
3. Open `/admin` on your laptop
4. Open `/spectator` on projector
5. Test one phone join on `/`

### Phase 1 — The Gauntlet:
- Admin: **Control tab** → click **Advance to Phase 1**
- Admin: click **Next Round** to start each round
- After timer runs out or admin clicks **End Round + Eliminate** → bottom 40% eliminated
- Repeat for rounds 2–5
- Admin: click **Advance to Phase 2** when done

### Phase 2 — Campus Conquest:
- Battery drain starts automatically (1% per minute)
- Teams physically go to campus zones and solve challenges on their phones
- Zone Marshals watch for cheating; admin can reset zones in the **Phase tab**
- Admin: click **Advance to Phase 3** when 90 min is up (or use the timer)

### Phase 3 — Final Build:
- Admin: **Control tab** → **Advance to Phase 3** → then **Select Problem Statement** + **Reveal**
- Teams build for 2.5 hours
- Admin/Judges: go to **Phase tab** → **Judge Panel** → enter scores per team
- Admin: click **Advance to Results** to show final leaderboard

---

## 🗂️ PROJECT STRUCTURE

```
dominance/
├── server/
│   ├── index.js              ← Express + Socket.io server
│   ├── .env.example           ← Copy to .env — ADMIN_PASSWORD / ZONE_PASSWORD
│   ├── data/
│   │   ├── seed.js           ← Run to reset database
│   │   ├── db.json           ← Auto-generated flat-file DB
│   │   ├── snapshots/        ← Auto-generated recovery points (gitignored)
│   │   └── archive/          ← Auto-generated past-event archives (gitignored)
│   ├── lib/
│   │   ├── auth.js           ← Sessions, login lockout, admin/zone roles
│   │   ├── snapshots.js      ← Periodic snapshots + event archive
│   │   ├── battery.js        ← Battery drain engine
│   │   ├── scoring.js        ← Score calculations
│   │   └── questions.js      ← Question/zone-problem pools
│   └── sockets/
│       └── events.js         ← All real-time events
└── client/
    └── src/
        ├── pages/
        │   ├── JoinTeam.jsx
        │   ├── TeamDashboard.jsx   ← Mobile team view
        │   ├── AdminDashboard.jsx  ← Full admin control
        │   ├── ZoneOperator.jsx    ← Zone-laptop screen (own password)
        │   └── Spectator.jsx       ← Big screen leaderboard
        ├── components/
        │   ├── phase1/       ← Question cards, elimination overlay
        │   ├── phase2/       ← Zone map, battery, firewall/breach
        │   ├── phase3/       ← Problem reveal, submission, judge panel
        │   └── shared/       ← Navbar, toasts, battery bar, help button, theme toggle
        ├── context/
        │   └── AppContext.jsx  ← Global state + socket wiring
        └── hooks/
            ├── useSocket.js   ← Socket.io connection + reconnect pubsub
            ├── useSound.js    ← Synthesized sound effects
            └── useTimer.js    ← Countdown hook
```

---

## 🚨 TROUBLESHOOTING

**Teams can't connect on their phones?**
→ Make sure laptop and phones are on the same hotspot/WiFi. Use your laptop's local IP (not localhost).

**db.json not found error?**
→ Run `node data/seed.js` first.

**Socket not connecting?**
→ Check that server is running on port 4000. Check browser console for errors.

**Battery not draining?**
→ Battery drain only runs during Phase 2. Make sure you advanced to Phase 2 from admin panel.

**Zone capture not working?**
→ Make sure the team is not eliminated and the phase is 'phase2'.

---

## ⚠️ FALLBACKS (if something breaks)

- **Phase 1 broken** → Use a Google Form with the questions, enter scores manually via admin panel
- **Phase 2 map broken** → Teams still capture zones, Zone Marshals report to admin who manually adjusts battery via admin panel
- **Phase 3 submission broken** → Teams share their links in a WhatsApp group, admin enters scores manually
- **Wi-Fi dies** → Run questions verbally, use printed backup

---

Good luck. Dominate. 🏆
