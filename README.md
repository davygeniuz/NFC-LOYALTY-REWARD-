# Taployal — NFC Loyalty & Rewards Platform

Loyalty that lives a single tap away. **Taployal** turns any counter into a loyalty
terminal: a customer taps a small NFC sticker with their phone, and points land
instantly — no app, no plastic card, no QR-code fumbling. Merchants get a live
dashboard with analytics, members, rewards and a tag registry.

> The demo tenant is **Ember & Oak**, a fictional specialty coffee house.
> In the physical world the NFC sticker is programmed with a unique earn link
> (`/tap/EMB-XXXXX`). Opening that link *is* the tap — which is exactly what this
> app simulates in the browser.

---

## Quick start

```bash
npm install
npm start
# → http://localhost:3000
```

No build step, no external database. A demo dataset is seeded to `data/db.json`
on first boot (relative to "now", so charts and the live feed always look fresh).

**Demo merchant login:** `demo@taployal.io` / `demo1234` (there is an autofill
button on the sign-in screen).

Reset the world at any time: `npm run reset-db` → restart.

## The three experiences

| Surface | URL | What it is |
| --- | --- | --- |
| Marketing site | `/` | Product story + live programme stats + "simulate a tap" |
| Merchant dashboard | `/app` | Overview (30-day tap chart, tier mix, live activity), Members, Rewards, NFC Tags, Settings |
| Tap page | `/tap/:uid` | What a customer's phone shows when it touches a tag. First-timers enrol here and claim a welcome bonus |
| Customer wallet | `/wallet/:uid` | Digital membership card, tier progress, rewards with redeem + voucher code, activity history |

On the dashboard, **Simulate customer tap** opens a real tag's earn link in a new
tab — the complete loop (tap → earn → wallet → redeem) is exercised end-to-end.

## Program rules (editable in Settings)

- **Points per visit** — points granted by one qualifying tap.
- **Welcome bonus** — granted on enrolment.
- **Cooldown** — minimum hours between two *earning* taps for one member
  (fraud-safe by design; extra taps show a friendly countdown instead of points).
- **Tiers** — lifetime-points ladder (Member → Gold → Reserve by default), each
  with a headline perk; tier-ups are celebrated on the tap screen.

## Deploying a permanent link

The repo ships a `Dockerfile`, a Render blueprint (`render.yaml`) and a health
probe (`/api/health`). Fastest path: **Render → New Web Service → pick this
repo** — it auto-detects the Dockerfile and hands you a permanent
`https://taployal.onrender.com` (guest entry at `/demo`). Set
`TAPLOYAL_DATA_DIR=/data` + a mounted volume for persistence. Full step-by-step
(incl. Railway, Fly, plain Docker): **[DEPLOY.md](DEPLOY.md)**.

## Tech

- **Backend** — Node 18+, Express 4. JSON-file persistence with atomic writes
  (`server/db.js`), scrypt-hashed password, cookie sessions.
- **Frontend** — dependency-free vanilla JS + hand-rolled design system
  (`public/css/styles.css`): variable serif/sans (Fraunces/Inter, self-hosted),
  SVG charts drawn in code, canvas confetti, IntersectionObserver reveals.
- **Zero client trackers, zero CDNs** — works fully offline.

## API surface

Public: `GET /api/bootstrap` · `GET /api/public/stats` · `GET /api/public/sample-tap` ·
`POST /api/tap` · `POST /api/join` · `GET /api/wallet/:uid` · `POST /api/redeem` · `GET /api/rewards`

Auth (`POST /api/auth/login` first): `GET /api/stats` · `GET /api/activity` ·
`GET|POST /api/customers` · `GET|PATCH /api/customers/:id` ·
`POST|PATCH|DELETE /api/rewards[/:id]` ·
`GET|POST /api/cards` + `assign` / `unlink` / `toggle` ·
`GET|PATCH /api/settings` · `POST /api/auth/logout` · `GET /api/auth/me`

## Project layout

```
server/
  index.js      Express routes, sessions, page serving
  db.js         JSON store, demo seed data, domain logic (tap/join/redeem/stats)
public/
  index.html    Marketing landing page
  app.html      Merchant dashboard (SPA)
  tap.html      NFC tap experience
  wallet.html   Customer wallet
  404.html
  css/styles.css
  js/{common,landing,dashboard,tap,wallet}.js
  fonts/        Self-hosted Fraunces + Inter (variable woff2)
data/           Runtime database (git-ignored, seeded on first run)
```
