# Deploying Taployal — permanent demo link

The app is a single Node process that serves everything on one port and honours
`PORT`. Any of these paths gives you a permanent `https://…` URL you can send
anyone, anytime. **Option 1 is the recommended 10-minute path — no CLI, no
credit card.**

---

## Option 1 — Render (recommended, free tier)

1. Make sure this branch is merged into `main` (PR #1), or note which branch you'll deploy.
2. Go to <https://render.com> → **Sign up with GitHub** (uses your existing GitHub, nothing to type).
3. Dashboard → **New +** → **Web Service** → **Connect** this repository
   (`davygeniuz/NFC-LOYALTY-REWARD-`). Authorise GitHub access if prompted.
4. Render auto-detects the `Dockerfile`. Confirm:
   - **Name:** `taployal` (this becomes `taployal.onrender.com` — pick your brand!)
   - **Branch:** `main`
   - **Instance type:** Free
5. **Create Web Service** → wait ~3–5 minutes for the first build.
6. Done — your permanent link is `https://<name>.onrender.com` and
   `https://<name>.onrender.com/demo` goes straight into the dashboard.
   **Auto-deploys on every `git push`.**

**Know before a demo (free tier):**
- Instances sleep after ~15 min idle; the first visit after sleep takes
  30–60 seconds. Open the link once yourself before the meeting.
- The filesystem is ephemeral: when it restarts, the demo world re-seeds.
  That's a feature for pitching (every audience sees the same clean data), but
  if you want points to persist, upgrade to a paid plan and uncomment the disk
  block in `render.yaml`.
- Want `demo.emberandoak.com`-style branding? Render → your service →
  Settings → Custom Domains (free).

---

## Option 2 — Railway (also easy, usage-based free credit)

1. <https://railway.app> → **Login with GitHub**.
2. **New Project** → **Deploy from GitHub repo** → pick this repo.
3. Railway detects Node, builds with the Dockerfile, assigns a
   `*.up.railway.app` domain automatically. Set volume + `TAPLOYAL_DATA_DIR=/data`
   in the service settings if you want persistence.

---

## Option 3 — Fly.io (CLI, global edge)

```bash
brew install flyctl         # or curl -L https://fly.io/install.sh | sh
flyctl auth login
flyctl launch --dockerfile Dockerfile --name taployal --region lhr
flyctl volumes create taployal_data --size 1     # optional persistence
# then in fly.toml:  [mounts] source="taployal_data" destination="/data"
# and set env TAPLOYAL_DATA_DIR=/data
flyctl deploy
```

---

## Option 4 — Any Docker host / VPS

```bash
docker build -t taployal .
docker run -d --name taployal -p 80:3000 \
  -e PORT=3000 \
  -v taployal_data:/data -e TAPLOYAL_DATA_DIR=/data \
  taployal
```

Put your usual TLS/reverse-proxy (Caddy, nginx, Cloudflare Tunnel) in front.

---

### After deploying — checklist

- [ ] Visit `/api/health` → returns `{"ok":true,…}` (platform health checks pass)
- [ ] Open `/demo` → lands inside the dashboard, no password
- [ ] Run one full loop: simulate a tap → wallet → redeem a reward → watch it
      appear in the dashboard's live activity feed
- [ ] Optional: change the demo merchant login — edit the seed in
      `server/db.js` (`merchant.email` / password) and re-deploy, or hit
      `npm run reset-db` equivalent by restarting the service
- [ ] Optional: rebrand in **Settings** (business name, tagline) and re-seed
      by restarting — the tenant name on the seed is `Ember & Oak`
