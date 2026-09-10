/**
 * Taployal — application server.
 * Serves the marketing site, the merchant dashboard and the customer-facing
 * tap/wallet experiences, plus the JSON API that ties everything together.
 */
'use strict';

const express = require('express');
const path = require('path');
const crypto = require('crypto');

const { Store, publicCustomer, cardUid, verifyPassword } = require('./db');

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, '..', 'public');

const store = new Store();
store.load();

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '64kb' }));

/* -------------------------------- sessions -------------------------------- */

const sessions = new Map(); // token -> { createdAt }
const SESSION_TTL = 14 * 24 * 60 * 60 * 1000;

function parseCookies(req) {
  const header = req.headers.cookie || '';
  const out = {};
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx > -1) out[part.slice(0, idx).trim()] = decodeURIComponent(part.slice(idx + 1).trim());
  }
  return out;
}

function sessionToken(req) {
  const token = parseCookies(req)['taployal_session'];
  if (!token) return null;
  const sess = sessions.get(token);
  if (!sess) return null;
  if (Date.now() - sess.createdAt > SESSION_TTL) { sessions.delete(token); return null; }
  return token;
}

function requireAuth(req, res, next) {
  if (!sessionToken(req)) return res.status(401).json({ error: 'unauthenticated' });
  next();
}

/* ------------------------------ public routes ------------------------------ */

app.get('/api/bootstrap', (req, res) => {
  const s = store.data.settings;
  res.json({
    businessName: s.businessName,
    tagline: s.tagline,
    pointsPerVisit: s.pointsPerVisit,
    welcomeBonus: s.welcomeBonus,
    cooldownHours: s.cooldownHours,
    tiers: s.tiers,
  });
});

app.get('/api/public/stats', (req, res) => {
  const s = store.stats();
  res.json({
    businessName: store.data.settings.businessName,
    members: s.members,
    taps30d: s.taps30d,
    pointsInCirculation: s.pointsInCirculation,
    redeems30d: s.redeems30d,
  });
});

/* Picks a live tag for the "simulate a tap" demo buttons — preferring a
   customer whose cooldown has expired so the demo usually earns points. */
app.get('/api/public/sample-tap', (req, res) => {
  const s = store.data.settings;
  const cooldownMs = s.cooldownHours * 60 * 60 * 1000;
  const linked = store.data.cards.filter((k) => k.status === 'active' && k.customerId);
  const ready = linked.filter((k) => {
    const c = store.customer(k.customerId);
    return c && (!c.lastTapAt || Date.now() - c.lastTapAt >= cooldownMs);
  });
  const pool = ready.length ? ready : linked;
  if (!pool.length) return res.status(404).json({ error: 'no_tag' });
  const card = pool[crypto.randomInt(pool.length)];
  res.json({ uid: card.uid });
});

/* ---------------------------------  auth  ---------------------------------- */

app.post('/api/auth/login', (req, res) => {
  const { email, password } = req.body || {};
  const m = store.data.merchant;
  const ok = String(email || '').trim().toLowerCase() === m.email.toLowerCase() &&
             verifyPassword(String(password || ''), m.password);
  if (!ok) return res.status(401).json({ error: 'Invalid email or password.' });

  const token = crypto.randomBytes(24).toString('hex');
  sessions.set(token, { createdAt: Date.now() });
  res.setHeader('Set-Cookie',
    `taployal_session=${token}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${SESSION_TTL / 1000}`);
  res.json({ ok: true, name: m.name, business: store.data.settings.businessName });
});

app.post('/api/auth/logout', (req, res) => {
  const token = sessionToken(req);
  if (token) sessions.delete(token);
  res.setHeader('Set-Cookie', 'taployal_session=; HttpOnly; Path=/; Max-Age=0');
  res.json({ ok: true });
});

app.get('/api/auth/me', (req, res) => {
  if (!sessionToken(req)) return res.status(401).json({ error: 'unauthenticated' });
  res.json({ name: store.data.merchant.name, email: store.data.merchant.email, business: store.data.settings.businessName });
});

/* ----------------------------- merchant: stats ----------------------------- */

app.get('/api/stats', requireAuth, (req, res) => res.json(store.stats()));

app.get('/api/activity', requireAuth, (req, res) => {
  const limit = Math.min(100, parseInt(req.query.limit, 10) || 30);
  const items = store.data.activity.slice(0, limit).map((a) => {
    const c = a.customerId ? store.customer(a.customerId) : null;
    return { ...a, customerName: c ? c.name : null };
  });
  res.json({ activity: items });
});

/* ---------------------------- merchant: customers --------------------------- */

app.get('/api/customers', requireAuth, (req, res) => {
  const q = String(req.query.q || '').trim().toLowerCase();
  let list = store.data.customers.map((c) => publicCustomer(store, c));
  if (q) list = list.filter((c) => c.name.toLowerCase().includes(q) || c.email.toLowerCase().includes(q));
  const sort = req.query.sort || 'recent';
  const by = {
    recent: (a, b) => (b.lastTapAt || 0) - (a.lastTapAt || 0),
    points: (a, b) => b.points - a.points,
    lifetime: (a, b) => b.lifetimePoints - a.lifetimePoints,
    visits: (a, b) => b.visits - a.visits,
    name: (a, b) => a.name.localeCompare(b.name),
  }[sort] || ((a, b) => (b.lastTapAt || 0) - (a.lastTapAt || 0));
  res.json({ customers: list.sort(by) });
});

app.post('/api/customers', requireAuth, (req, res) => {
  const name = String((req.body || {}).name || '').trim().slice(0, 60);
  const email = String((req.body || {}).email || '').trim().toLowerCase();
  if (name.length < 2) return res.status(400).json({ error: 'Name is required.' });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return res.status(400).json({ error: 'A valid email is required.' });
  if (store.customerByEmail(email)) return res.status(409).json({ error: 'A member with that email already exists.' });

  const s = store.data.settings;
  const c = {
    id: require('./db').id('cus'), name, email,
    points: s.welcomeBonus, lifetimePoints: s.welcomeBonus, visits: 0,
    joinedAt: Date.now(), lastTapAt: null, createdAt: Date.now(),
  };
  store.data.customers.push(c);

  let tag = null;
  if (req.body && req.body.withTag) {
    const uidv = cardUid();
    tag = { uid: uidv, customerId: c.id, status: 'active', registeredAt: Date.now() };
    store.data.cards.push(tag);
  }
  store.log('join', { customerId: c.id, cardUid: tag ? tag.uid : null, pointsDelta: s.welcomeBonus, label: `Joined · welcome bonus +${s.welcomeBonus} pts` });
  store.save();
  res.status(201).json({ customer: publicCustomer(store, c), tag });
});

app.get('/api/customers/:id', requireAuth, (req, res) => {
  const c = store.customer(req.params.id);
  if (!c) return res.status(404).json({ error: 'Member not found.' });
  const tags = store.data.cards.filter((k) => k.customerId === c.id);
  const activity = store.data.activity.filter((a) => a.customerId === c.id).slice(0, 20);
  const redemptions = store.data.redemptions.filter((r) => r.customerId === c.id).slice(0, 10);
  res.json({ customer: publicCustomer(store, c), tags, activity, redemptions });
});

app.patch('/api/customers/:id', requireAuth, (req, res) => {
  const c = store.customer(req.params.id);
  if (!c) return res.status(404).json({ error: 'Member not found.' });
  const { name, email, adjustPoints, reason } = req.body || {};

  if (typeof name === 'string' && name.trim().length >= 2) c.name = name.trim().slice(0, 60);
  if (typeof email === 'string') {
    const clean = email.trim().toLowerCase();
    const clash = store.customerByEmail(clean);
    if (clash && clash.id !== c.id) return res.status(409).json({ error: 'Another member already uses that email.' });
    if (/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(clean)) c.email = clean;
  }
  if (Number.isFinite(adjustPoints) && adjustPoints !== 0) {
    const delta = Math.max(-5000, Math.min(5000, Math.trunc(adjustPoints)));
    if (c.points + delta < 0) return res.status(400).json({ error: 'Balance can’t go below zero.' });
    c.points += delta;
    if (delta > 0) c.lifetimePoints += delta;
    store.log('adjust', {
      customerId: c.id, pointsDelta: delta,
      label: `${delta > 0 ? 'Added' : 'Removed'} ${Math.abs(delta)} pts${reason ? ` · ${String(reason).slice(0, 80)}` : ''}`,
    });
  }
  store.save();
  res.json({ customer: publicCustomer(store, c) });
});

/* ----------------------------- merchant: rewards ---------------------------- */

app.get('/api/rewards', (req, res) => {
  // Public callers (wallet/tap pages) only see live rewards; the dashboard sees all.
  const all = sessionToken(req) ? store.data.rewards : store.data.rewards.filter((r) => r.active);
  res.json({ rewards: all });
});

app.post('/api/rewards', requireAuth, (req, res) => {
  const { title, description = '', cost, stock = null, icon = 'espresso', active = true } = req.body || {};
  if (!title || String(title).trim().length < 2) return res.status(400).json({ error: 'Title is required.' });
  if (!Number.isFinite(cost) || cost < 1 || cost > 100000) return res.status(400).json({ error: 'Cost must be a number of points ≥ 1.' });
  const reward = {
    id: require('./db').id('rew'), title: String(title).trim().slice(0, 60),
    description: String(description).trim().slice(0, 160),
    cost: Math.trunc(cost),
    stock: stock === null || stock === '' || stock === undefined ? null : Math.max(0, Math.trunc(Number(stock) || 0)),
    active: !!active, icon: String(icon).slice(0, 24),
  };
  store.data.rewards.push(reward);
  store.log('reward', { label: `Reward created · “${reward.title}”` });
  store.save();
  res.status(201).json({ reward });
});

app.patch('/api/rewards/:id', requireAuth, (req, res) => {
  const r = store.reward(req.params.id);
  if (!r) return res.status(404).json({ error: 'Reward not found.' });
  const { title, description, cost, stock, active, icon } = req.body || {};
  if (typeof title === 'string' && title.trim().length >= 2) r.title = title.trim().slice(0, 60);
  if (typeof description === 'string') r.description = description.trim().slice(0, 160);
  if (Number.isFinite(cost) && cost >= 1) r.cost = Math.trunc(cost);
  if (stock === null) r.stock = null;
  else if (Number.isFinite(stock)) r.stock = Math.max(0, Math.trunc(stock));
  if (typeof active === 'boolean') r.active = active;
  if (typeof icon === 'string') r.icon = icon.slice(0, 24);
  store.save();
  res.json({ reward: r });
});

app.delete('/api/rewards/:id', requireAuth, (req, res) => {
  const idx = store.data.rewards.findIndex((r) => r.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Reward not found.' });
  const [removed] = store.data.rewards.splice(idx, 1);
  store.log('reward', { label: `Reward removed · “${removed.title}”` });
  store.save();
  res.json({ ok: true });
});

/* ------------------------------ merchant: cards ----------------------------- */

app.get('/api/cards', requireAuth, (req, res) => {
  const cards = store.data.cards
    .map((k) => {
      const c = k.customerId ? store.customer(k.customerId) : null;
      return { ...k, customerName: c ? c.name : null, customerEmail: c ? c.email : null };
    })
    .sort((a, b) => b.registeredAt - a.registeredAt);
  res.json({ cards });
});

app.post('/api/cards', requireAuth, (req, res) => {
  const uidv = cardUid();
  const card = { uid: uidv, customerId: null, status: 'active', registeredAt: Date.now() };
  store.data.cards.push(card);
  store.log('card', { cardUid: uidv, label: `Tag ${uidv} registered` });
  store.save();
  res.status(201).json({ card });
});

app.post('/api/cards/:uid/assign', requireAuth, (req, res) => {
  const card = store.card(req.params.uid);
  if (!card) return res.status(404).json({ error: 'Tag not found.' });
  const c = store.customer((req.body || {}).customerId);
  if (!c) return res.status(404).json({ error: 'Member not found.' });
  card.customerId = c.id;
  store.log('card', { customerId: c.id, cardUid: card.uid, label: `Tag ${card.uid} linked to ${c.name}` });
  store.save();
  res.json({ card });
});

app.post('/api/cards/:uid/unlink', requireAuth, (req, res) => {
  const card = store.card(req.params.uid);
  if (!card) return res.status(404).json({ error: 'Tag not found.' });
  const prev = card.customerId;
  card.customerId = null;
  store.log('card', { cardUid: card.uid, label: `Tag ${card.uid} unlinked` });
  store.save();
  res.json({ card, previousCustomerId: prev });
});

app.post('/api/cards/:uid/toggle', requireAuth, (req, res) => {
  const card = store.card(req.params.uid);
  if (!card) return res.status(404).json({ error: 'Tag not found.' });
  card.status = card.status === 'void' ? 'active' : 'void';
  store.log('card', { cardUid: card.uid, label: `Tag ${card.uid} ${card.status === 'void' ? 'voided' : 'reactivated'}` });
  store.save();
  res.json({ card });
});

/* --------------------------- customer-facing flows -------------------------- */

app.post('/api/tap', (req, res) => {
  const result = store.tap((req.body || {}).uid);
  if (result.status === 'earned') store.save();
  res.json({
    ...result,
    settings: {
      pointsPerVisit: store.data.settings.pointsPerVisit,
      welcomeBonus: store.data.settings.welcomeBonus,
      cooldownHours: store.data.settings.cooldownHours,
    },
  });
});

app.post('/api/join', (req, res) => {
  const result = store.join((req.body || {}).uid, (req.body || {}).name, (req.body || {}).email);
  res.json({ ...result, welcomeBonus: store.data.settings.welcomeBonus });
});

app.get('/api/wallet/:uid', (req, res) => {
  const card = store.card(req.params.uid);
  if (!card) return res.status(404).json({ error: 'unknown_card' });
  if (card.status === 'void') return res.status(410).json({ error: 'void' });
  if (!card.customerId) return res.json({ state: 'unassigned', uid: card.uid });
  const c = store.customer(card.customerId);
  if (!c) return res.json({ state: 'unassigned', uid: card.uid });

  const activity = store.data.activity.filter((a) => a.customerId === c.id).slice(0, 12);
  const redemptions = store.data.redemptions.filter((r) => r.customerId === c.id).slice(0, 12);
  res.json({
    state: 'ok',
    uid: card.uid,
    customer: publicCustomer(store, c),
    rewards: store.data.rewards.filter((r) => r.active),
    activity,
    redemptions,
    settings: {
      pointsPerVisit: store.data.settings.pointsPerVisit,
      tiers: store.data.settings.tiers,
      businessName: store.data.settings.businessName,
      tagline: store.data.settings.tagline,
    },
  });
});

app.post('/api/redeem', (req, res) => {
  const b = req.body || {};
  const result = store.redeem({ uidv: b.uid, customerId: b.customerId, rewardId: b.rewardId });
  res.json(result);
});

/* ------------------------------- settings ---------------------------------- */

app.get('/api/settings', requireAuth, (req, res) => res.json({ settings: store.data.settings }));

app.patch('/api/settings', requireAuth, (req, res) => {
  const s = store.data.settings;
  const b = req.body || {};
  if (typeof b.businessName === 'string' && b.businessName.trim().length >= 2) s.businessName = b.businessName.trim().slice(0, 60);
  if (typeof b.tagline === 'string') s.tagline = b.tagline.trim().slice(0, 80);
  if (Number.isFinite(b.pointsPerVisit)) s.pointsPerVisit = Math.max(1, Math.min(1000, Math.trunc(b.pointsPerVisit)));
  if (Number.isFinite(b.welcomeBonus)) s.welcomeBonus = Math.max(0, Math.min(5000, Math.trunc(b.welcomeBonus)));
  if (Number.isFinite(b.cooldownHours)) s.cooldownHours = Math.max(0, Math.min(72, Math.trunc(b.cooldownHours)));
  if (Array.isArray(b.tiers) && b.tiers.length >= 1 && b.tiers.length <= 6) {
    const tiers = b.tiers
      .map((t) => ({
        name: String(t.name || '').trim().slice(0, 24) || 'Tier',
        minLifetime: Math.max(0, Math.trunc(Number(t.minLifetime) || 0)),
        perk: String(t.perk || '').trim().slice(0, 80),
        tone: String(t.tone || '#c9a24b').slice(0, 16),
      }))
      .sort((a, b2) => a.minLifetime - b2.minLifetime);
    tiers[0].minLifetime = 0;
    s.tiers = tiers;
  }
  store.save();
  res.json({ settings: s });
});

/* --------------------------------- pages ----------------------------------- */

app.use(express.static(PUBLIC_DIR, { extensions: ['html'], maxAge: '1h', index: 'index.html' }));

app.get(['/app', '/dashboard'], (req, res) => res.sendFile(path.join(PUBLIC_DIR, 'app.html')));
app.get('/tap/:uid', (req, res) => res.sendFile(path.join(PUBLIC_DIR, 'tap.html')));
app.get(['/wallet/:uid', '/card/:uid'], (req, res) => res.sendFile(path.join(PUBLIC_DIR, 'wallet.html')));

app.use((req, res) => res.status(404).sendFile(path.join(PUBLIC_DIR, '404.html')));

app.listen(PORT, '0.0.0.0', () => {
  console.log(`[taployal] ${store.data.settings.businessName} is live → http://0.0.0.0:${PORT}`);
});
