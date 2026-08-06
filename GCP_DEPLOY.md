# Deploying DOMINANCE on a GCP VM

Single VM, single process: the Node server serves the API, the WebSockets **and** the built React client on one port. No nginx, no Docker, no database to provision.

---

## 1. Create the VM

Console → Compute Engine → **Create instance**:

| Setting | Value |
|---|---|
| Machine type | `e2-small` (2 vCPU, 2 GB) — comfortable for 50+ teams |
| Boot disk | Ubuntu 22.04 LTS, 20 GB |
| Firewall | ✅ Allow HTTP traffic |
| Network tag | `dominance` |

Or from your laptop:

```bash
gcloud compute instances create dominance \
  --machine-type=e2-small --zone=asia-south1-a \
  --image-family=ubuntu-2204-lts --image-project=ubuntu-os-cloud \
  --tags=dominance,http-server

gcloud compute firewall-rules create dominance-http \
  --allow tcp:80 --target-tags=dominance --description="DOMINANCE event"
```

> **Pick a zone near the venue** (`asia-south1` = Mumbai for an event in India). Latency shows up directly in the Phase 1 time bonus, which is scored in seconds.

---

## 2. Provision it (one command)

SSH into the VM (Console → SSH button), then:

```bash
curl -fsSL https://raw.githubusercontent.com/Advik274/codesprint_2.0/master/deploy/setup-gcp-vm.sh | bash
```

That installs Node 20, clones the repo, **generates strong admin/zone passwords**, builds the client, and registers a `systemd` service that restarts on crash and on reboot.

It finishes by printing your URLs and passwords:

```
  Teams / join   http://34.x.x.x/
  Register (QR)  http://34.x.x.x/register
  Admin          http://34.x.x.x/admin
  Spectator      http://34.x.x.x/spectator

  ADMIN PASSWORD   <generated>
  ZONE PASSWORD    <generated>
```

**Save those passwords** — they live only in `server/.env` on the VM. Re-running the script never overwrites them.

> Reserve a **static external IP** (VPC network → IP addresses) before printing QR codes, or a VM restart will change the address on every card you handed out.

---

## 3. Changing things later

There are two kinds of change, and only one of them needs a deploy.

### A. Runtime — no deploy, takes effect instantly

Everything you'd normally tune on the day is already live-configurable from the admin panel:

- Event name, college, **which rounds run**, all durations and marks — Config tab
- Colours and theme — Theme tab (applies to every screen live)
- Protected Mode, penalty thresholds, self-registration — Setup / Config
- Extra quiz questions — Questions tab
- Phase 3 problem statements — Phase 3 tab

### B. Code — deploy in ~30 seconds

Editing the Bug Hunt programs, the Code Strike problems, or anything else in the source:

```bash
# on your laptop
git add -A && git commit -m "Swap in new Bug Hunt programs" && git push

# on the VM
cd ~/dominance && ./deploy/update.sh
```

`update.sh` backs up `db.json` first, pulls, reinstalls, rebuilds the client, restarts the service and verifies it came back — printing the live phase and team count so you know the event state survived:

```
▸ Backing up live event data
  ✓ saved /home/you/dominance-backups/db-20260806-101500.json
▸ Pulling master
  ✓ b6de169 → ab6d1c8
▸ Building the client
  ✓ client/dist rebuilt
▸ Restarting dominance
  ✓ healthy on port 80

  Deployed ab6d1c8 · phase=quiz_round · teams=42
```

If a deploy goes wrong:

```bash
./deploy/update.sh --rollback     # previous commit, rebuilt and restarted
```

Deploying mid-event is safe for data (event state lives in `db.json`, untouched by git) but **every connected browser reloads** to pick up the new bundle — so do it between rounds, not during one.

---

## 4. Day-of operations

```bash
sudo journalctl -u dominance -f        # live logs
sudo systemctl restart dominance       # restart
sudo systemctl status dominance        # is it running?
curl localhost/api/ping                # memory, uptime, team count
```

**Back up before the event and at each round boundary** — admin panel → 💾 Backup → *Download as JSON*. That file restores the entire event through ♻️ Restore. The VM also writes automatic snapshots every 5 minutes (Backup tab → restore in one click).

---

## 5. Optional: HTTPS on a domain

Plain HTTP over the VM's IP is fine for a lab event and is what the setup script gives you. If you point a domain at the VM and want HTTPS (needed for "Add to Home Screen" to install as an app), Caddy handles certificates automatically:

```bash
sudo apt-get install -y debian-keyring debian-archive-keyring apt-transport-https
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt-get update && sudo apt-get install -y caddy

# point Node at 3000 so Caddy can own 80/443
sudo sed -i 's/^PORT=.*/PORT=3000/' ~/dominance/server/.env
sudo systemctl restart dominance

sudo tee /etc/caddy/Caddyfile >/dev/null <<'EOF'
arena.yourdomain.com {
    reverse_proxy localhost:3000
}
EOF
sudo systemctl restart caddy
```

Open `tcp:443` in the firewall as well. The server already sets `trust proxy`, so rate limiting and the login lockout still see real client IPs behind Caddy.

---

## 6. Pre-flight checklist

- [ ] Static external IP reserved (before printing any QR codes)
- [ ] Firewall allows `tcp:80`
- [ ] Admin + zone passwords saved somewhere other than the VM
- [ ] `Config → ⚔️ CODE ARENA 2026 → Save`, then confirm the run sheet numbers
- [ ] One phone joins over mobile data (proves it works off the venue WiFi)
- [ ] Spectator screen open on the projector
- [ ] Backup downloaded from the Backup tab right before 3:30
- [ ] A second person knows the admin password
