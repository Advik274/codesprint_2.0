# DOMINANCE — COORDINATOR OPERATIONS MANUAL
### Ebulliance Tech Fest | Reboot Club × CSI × NCC
### INTERNAL USE ONLY — Do not distribute to participants

---

## EVENT AT A GLANCE

| Item | Detail |
|------|--------|
| Total Duration | ~5.5–6 hours |
| Max Participants | 200 (40–50 teams of 3–5) |
| Phases | Up to 4 (Gauntlet → Campus Conquest → Final Build → Speed Demo) |
| Tech Required | 1 Admin laptop, 6+ Zone laptops, participant phones |
| Admin Password | set via `ADMIN_PASSWORD` env var (see server/.env.example) |
| Zone Password | set via `ZONE_PASSWORD` env var — give this to Zone Operators instead |
| URLs | See Section 6 |

---

## ⚔️ RUNNING CODE ARENA 2026 (Reboot Club format)

Three missions on the same platform, 100 marks total. Enable via **Config tab → ⚔️ CODE ARENA 2026 template → Save** (sets: quiz 20 Q / 25 min / arena bank / 20 marks · Bug Hunt 5 programs / 30 min / 30 marks · Code Strike 45 min / 50 marks).

### Timeline (per the event plan)
| Activity | Time | Where |
|---|---|---|
| Registration & verification | 15 min | Setup tab (Bulk CSV Import + passcode cards from QR tab) |
| Welcome & rules | 10 min | `/guide` on participant phones |
| Mission 1 — Intelligence Scan | 25 min | Control → Advance to Phase 1 → 🧠 Quiz tab → Start |
| Mission 2 — Bug Hunt | 30 min | Control → Advance → 🐛 Bug Hunt tab → Start |
| Mission 3 — Code Strike | 45 min | Control → Advance → ⚔️ Code Strike tab → Start |
| Leaderboard & tie breaker | 15 min | Control → Advance to Results → Dramatic Reveal (+ ⚡ Tie-Break tab if needed) |
| Prize distribution | 10 min | Results tab → Thank You page |

### Mission 1 — Intelligence Scan
- Same Quiz Round flow as always; the template points it at the **multi-topic bank** (Java, C/C++, Python, DBMS, OS, Git, HTML/CSS, Aptitude, Logical) instead of the DSA pool.
- Each member submits on their own phone; team score = member average, auto-normalised to **/20 marks** for the combined board.
- "Top teams qualify" → use the existing **Eliminate Bottom N** control in the Quiz tab if you want cuts after M1 (optional — the combined leaderboard works without eliminating anyone).

### Mission 2 — Bug Hunt
- **One submission per team** (one laptop per team, per the rules). Teams type the corrected line for each buggy program.
- **End & Grade** auto-grades with the lenient matcher (spacing/case/quotes don't matter). Then open the review panel: every team's typed fix is shown next to the accepted answers.
- A correct fix written in an unexpected form? Type marks in the override box → **Set**. `↩ auto` restores the auto verdict. Totals update live everywhere.

### Mission 3 — Code Strike
- **Start** reveals all 3 problems (Easy 10 / Medium 15 / Hard 25) with the timer. Teams write code in their own editor and paste the final version per problem — resubmission allowed, latest paste counts and sets their submission time.
- **End (lock submissions)** when time's up — judging continues after.
- Judge panel: **View Code** per team per problem, enter **Correctness 0–10** and **Efficiency 0–10** → per-problem marks = 70% correctness + 20% efficiency + 10% time bonus (automatic). Judge notes under each problem tell evaluators what to look for. **Export CSV** for offline/parallel evaluation.

### Tie Breaker
- **⚡ Tie-Break tab** → tick the tied teams (list is sorted by current total so ties are obvious) → fire a random rapid-fire question or type your own + its answer.
- The question pops up full-screen only on those teams' devices; the server timestamps every answer; **first correct answer wins**, announced on Spectator. The win (⚡) breaks the tie on the final leaderboard automatically.
- Each team gets exactly one attempt per tie-break. Run it again with a new question if nobody gets it.

### 🔒 Protected Mode (the "AI tools not allowed" rule, enforced)
- Toggle it in the **Setup tab**. While ON, during **quiz, Bug Hunt and tie-breaks** every team browser blocks copy/paste + right-click, shows a red lockdown banner, and **reports every tab/app switch to you instantly** — toast + event log + a 🚨 counter on the team's row in the Teams tab (click it to see details or clear it).
- **Code Strike is exempt on purpose** — teams must switch to their editor during it.
- Honest limits: a browser cannot see a second phone or stop someone typing a question into ChatGPT on another device. Protected Mode catches everything on the event device and gives you evidence; volunteers walking the room cover the rest. Penalties are your call — use the existing Eliminate / mark-override tools.

### Pauses & fixes
- Every mission has its own Pause / Resume / ±minutes in its tab; **Emergency Pause** (Control tab) freezes whichever mission timer is live.
- Pausing Code Strike shifts the time-bonus baseline, so paused minutes never cost teams their bonus.
- Wrong grade discovered late? Bug Hunt overrides and Code Strike judge scores can be changed at any time — the combined board recomputes instantly.

---

## SPEED DEMO PHASE (Sprint 3 — Optional)

Enable in **Config tab** before starting the event (`speed_demo_enabled = true`).

### How it works
1. After Phase 3 ends, admin advances to **Speed Demo** phase
2. Each team gets **90 seconds** (configurable) to demo on the projector
3. Audience votes from the **Spectator screen** — one vote per device, tap any team name
4. Live vote bars update in real time on spectator screen
5. Admin uses the **🎤 Demo tab** to start each team's slot and move to the next
6. When advancing to **Results**, audience votes are automatically blended into final scores (configurable weight 0–30%)

### Demo tab controls
- **Select team to start** — tap their button to begin the 90s countdown
- **End Demo / Next Team** — ends current slot, resets timer; select next team manually
- Vote tally shows live counts + estimated bonus points per team

### Config options
| Setting | Default | Range |
|---------|---------|-------|
| Demo Duration | 90 sec | 30–300 sec |
| Audience Vote Weight | 10% | 0–30% of final score |

### Scoring blend
Votes are normalised (top vote-getter = 100%), then scaled by weight. Example: team gets 80% of max votes with 10% weight → +8 bonus points added to Phase 3 judge score.

---

## VOLUNTEER ROLES

| Role | Count | Responsibility |
|------|-------|---------------|
| **Tech Lead (you)** | 1 | Run admin panel, monitor everything |
| **Zone Operators** | 1 per zone (6 total) | Man zone laptops, verify captures |
| **Stage Crew** | 2–3 | Phase 1 crowd management, rules briefing |
| **Floaters** | 2 | Handle technical issues, assist teams |
| **Announcer** | 1 | Results reveal, hype, prizes |

---

## SECTION 1: PRE-EVENT SETUP (Day before / 1 hour before)

### Technical Setup
1. Deploy the app (see Section 7 — Railway deployment)
2. Note the live URL (e.g., `https://dominance-xxx.railway.app`)
3. Test admin panel login — password: whatever you set as ADMIN_PASSWORD
4. Open `/spectator` on projector browser — full screen

### Team Registration (Admin → Setup tab)
1. For each team: enter Name + Year + Members → Click "Register"
2. Note the auto-generated passcode shown next to each team
3. Prepare a printed/digital list:
   ```
   Team Alpha — 2nd year — Passcode: 3847
   Team Beta  — 1st year — Passcode: 6291
   ...
   ```
4. Distribute passcodes to team leaders ONLY (not on projector)

### Zone Setup (Admin → Setup tab)
1. Add all 6 zones with name + location description
2. Note each Zone ID (e.g., `zone_a1b2c3`)
3. Send each Zone Operator their Zone URL: `https://[APP_URL]/zone/[ZONE_ID]`
4. Zone Operators open their URL and enter the ZONE_PASSWORD (not the admin password)
5. Verify each zone laptop shows "READY FOR TEAMS"

### Checklist Before Starting
- [ ] All teams registered, passcodes distributed
- [ ] All zones set up, zone laptops connected
- [ ] Spectator screen on projector
- [ ] Admin panel open on admin laptop
- [ ] Wi-Fi / hotspot confirmed working
- [ ] Backup plan ready (see Section 8)

---

## SECTION 2: PHASE 1 — THE GAUNTLET (50 min)

### Admin Actions
1. **Control tab** → click **"Advance to Phase 1"**
2. Before each round, set **"# to eliminate"** field (typically eliminate ~30–40% per round)
   - Round 1 suggestion: eliminate bottom 5–8 teams
   - Round 2: eliminate 4–6 more
   - Round 3–4: eliminate 3–4 more
   - Round 5: leave top ~4–5 teams for Phase 2
3. Click **"Start Round X"** → question appears on all team screens
4. Watch the admin panel — it shows the correct answer
5. When time is up (or you want to cut short): click **"End + Eliminate [N]"**
6. System auto-eliminates bottom N teams, sends them an elimination screen
7. Repeat for rounds 2–5

### Stage Crew Actions
- Keep crowd quiet during rounds
- Watch for phones being used to search answers — warn teams
- Announce eliminations dramatically between rounds

### What Teams See
- Question appears on their phone/laptop
- They submit their answer before the timer runs out
- If correct + fast → high score; wrong → 0 points
- On elimination: full-screen "ELIMINATED" overlay

### Scoring
`Score = Base Points + (Time Limit − Time Taken in seconds)`
- Round 1–2: MCQ, 20–30s, 10–18 base points
- Round 3–4: MCQ/Text, 30–35s, 18–20 base points
- Round 5: Text input, 45s, 30 base points

---

## SECTION 3: PHASE 2 — CAMPUS CONQUEST (90 min)

### Admin Actions
1. **Control tab** → **"Advance to Phase 2"** — battery drain starts AUTOMATICALLY
2. Monitor from **Zones tab** and **Teams tab**
3. Battery overrides: go to Teams tab → set battery value → click Set
4. Zone resets if technical issue: Zones tab → Reset button

### Zone Operator Actions (one per zone)
Their laptop shows a zone operator screen. Flow:

**Neutral zone (first capture):**
1. Team arrives → operator enters their 4-digit passcode
2. System deducts **5% battery** from that team automatically
3. Operator sees **5 problem options** → picks one (make it interesting!)
4. Team reads the problem on the laptop screen
5. Operator **steps aside** — team types their answer themselves
6. Team clicks Submit
7. Correct → Zone captured (+20% battery to team), operator sees success screen
8. Wrong → Zone still neutral, operator sees fail screen

**Captured zone (re-capture attempt):**
1. Zone already has an owner (defending team)
2. Defending team already set a challenge from their dashboard
3. Attacker team arrives → passcode → 5% deducted
4. Challenge auto-loads (no operator selection needed)
5. Attacker types answer → submit
6. Correct → zone taken, attacker gets +20%, previous owner loses zone
7. Wrong → zone stays with defender

**Important rules for Zone Operators:**
- Only ONE team at a time — if another team is there, make them wait
- The zone screen shows "ZONE BUSY" automatically when an attempt is active
- DO NOT help teams — you are neutral
- If a team's answer is borderline (e.g. slightly different wording), use your judgment — check with admin
- If there's a dispute, immediately call admin on WhatsApp

### What Teams See
- Team dashboard shows battery level draining live
- At 20% battery: warning toast
- At 10% battery: urgent warning
- At 0%: eliminated, battery depleted screen
- When they capture a zone: +20% battery, prompt to set defense problem
- After capturing: team must go to dashboard → "Set Defense Problem" to trap other teams

### Battery Rules
- Starts at 100%
- Drains 2% per minute automatically
- -5% to ATTEMPT any zone (non-refundable if wrong)
- +20% on SUCCESSFUL capture (one-time per zone)
- If battery hits 0% → eliminated

### Advancement to Phase 3
- When 90 minutes is up (or admin decides to end early)
- Top 4–5 teams by zones captured advance
- Tiebreaker: higher battery %
- Admin manually clicks "Advance to Phase 3"

---

## SECTION 4: PHASE 3 — FINAL BUILD (2.5 hours)

### Admin Actions
1. **Control tab** → **"Advance to Phase 3"**
2. Go to **Phase 3 tab** → assign problem statements
   - Option A: Same problem for all teams → select from list → "Reveal to All Teams"
   - Option B: Different problems → select a team from dropdown → assign → repeat for each
3. Timer starts automatically (2.5 hours)
4. Monitor submissions in Phase 3 tab
5. Once all/most teams submit → begin judging

### Judging Process
1. Admin opens Phase 3 tab → Judge Submissions section
2. For each team:
   - Click 🌐 Deployed to view the live app
   - Click 📦 GitHub to review code
   - Score: UI (0–10), Functionality (0–10), Problem Fit (0–10)
   - Click Submit Scores
   - If you need to change a score: click Edit next to the team
3. Formula: `(UI×0.3 + Func×0.4 + Fit×0.3) × 10 = max 100`

### What Teams See
- Problem statement revealed on their screen
- Countdown timer visible
- Submit form with Deployment URL + GitHub URL + notes

---

## SECTION 5: RESULTS REVEAL

### Admin Actions (Results tab)
1. **Control tab** → **"Advance to Results"**
2. Ensure projector shows `/spectator`
3. Build suspense — pause between reveals
4. Click **"▶ Reveal Next"** → full-screen overlay appears on ALL screens simultaneously
   - Zone operator laptops
   - All team phones/laptops
   - Spectator screen
5. Results shown from WORST to BEST (last place first, winner last)
6. When winner is revealed → confetti fires on all screens
7. Announcer takes over for prize distribution

### If you need to reset: click "Reset Reveal" to start over

---

## SECTION 6: URLS REFERENCE

| Screen | URL |
|--------|-----|
| Team Join | `https://[APP_URL]/` |
| Admin Panel | `https://[APP_URL]/admin` |
| Spectator | `https://[APP_URL]/spectator` |
| Zone Laptop | `https://[APP_URL]/zone/[ZONE_ID]` |

Admin/zone passwords: whatever you set as ADMIN_PASSWORD / ZONE_PASSWORD.

---

## SECTION 7: DEPLOYMENT (Railway)

### One-time setup (do before event day):

1. Go to [railway.app](https://railway.app) → Sign up with GitHub
2. Click **"New Project"** → **"Deploy from GitHub repo"**
3. Upload the `dominance/server` folder OR use the provided GitHub repo
4. Set these **Environment Variables** in Railway dashboard:
   ```
   PORT=4000
   NODE_ENV=production
   ```
5. For the frontend: go to [vercel.com](https://vercel.com) → Import the `dominance/client` folder
6. Set this env variable in Vercel:
   ```
   VITE_SERVER_URL=https://[your-railway-url]
   ```
7. Update `client/src/hooks/useSocket.js` — replace `localhost:4000` with your Railway URL
8. Deploy both → test with 2 phones before event day

### Alternative — Run locally on hotspot (no deployment):
1. Connect laptop to hotspot
2. Run `node data/seed.js` then start both servers
3. Find your IP: `ipconfig` (Windows) or `ifconfig` (Mac)
4. Share `http://[YOUR_IP]:5173` with all participants

---

## SECTION 8: BACKUP PLANS

| Problem | Backup |
|---------|--------|
| App crashes | Restart server, teams rejoin with same passcode |
| Internet down | Run Phase 1 verbally (read questions aloud), use paper |
| Zone laptop dies | Use a spare phone, have admin manually mark capture |
| Team loses battery accidentally | Admin can set battery via Teams tab |
| Question seems unfair | Admin can broadcast an announcement and re-run the round |
| Dispute on zone answer | Admin overrides via Reset Zone button |

---

## SECTION 9: EMERGENCY CONTACTS

Fill in before the event:
- Tech Lead: ___________
- Zone Lead Coordinator: ___________
- Faculty Advisor: ___________
- Event Head: ___________

---

## SCORING SUMMARY

| Phase | What counts | Weight |
|-------|-------------|--------|
| Phase 1 | Eliminates teams — does NOT carry forward |
| Phase 2 | Zones captured + battery — determines who advances |
| Phase 3 | UI (30%) + Functionality (40%) + Problem Fit (30%) | Final score /100 |
