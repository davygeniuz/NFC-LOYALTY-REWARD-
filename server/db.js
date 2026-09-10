/**
 * Taployal — persistence layer.
 * A small, atomic JSON-file store. Zero external dependencies; writes are
 * flushed synchronously (tmp file + rename) so a crash never corrupts data.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DATA_DIR = process.env.TAPLOYAL_DATA_DIR
  ? path.resolve(process.env.TAPLOYAL_DATA_DIR)
  : path.join(__dirname, '..', 'data');
const DB_PATH = path.join(DATA_DIR, 'db.json');

const DAY = 24 * 60 * 60 * 1000;
const HOUR = 60 * 60 * 1000;

/* ---------------------------------- utils --------------------------------- */

const CARD_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // no I/L/O/0/1 — readable aloud

function cardUid() {
  let out = '';
  for (let i = 0; i < 5; i++) out += CARD_ALPHABET[crypto.randomInt(CARD_ALPHABET.length)];
  return `EMB-${out}`;
}

function id(prefix) {
  return `${prefix}_${crypto.randomBytes(6).toString('hex')}`;
}

function hashPassword(password, salt) {
  salt = salt || crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

function verifyPassword(password, stored) {
  const [salt, hash] = String(stored).split(':');
  if (!salt || !hash) return false;
  const test = crypto.scryptSync(password, salt, 64).toString('hex');
  return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(test, 'hex'));
}

function pick(arr) { return arr[crypto.randomInt(arr.length)]; }

/* ---------------------------------- seed ---------------------------------- */

function seed() {
  const now = Date.now();

  const settings = {
    businessName: 'Ember & Oak',
    tagline: 'Specialty Coffee Roasters',
    pointsPerVisit: 10,
    welcomeBonus: 25,
    cooldownHours: 4,           // one earning tap every 4h per customer
    currency: 'pts',
    tiers: [
      { name: 'Member',  minLifetime: 0,   perk: 'Earn points with every tap',        tone: '#8b8577' },
      { name: 'Gold',    minLifetime: 250, perk: 'Free size upgrade, every visit',    tone: '#c9a24b' },
      { name: 'Reserve', minLifetime: 600, perk: 'First pour of limited roasts',      tone: '#7dd6b0' },
    ],
  };

  const merchant = {
    name: 'Ava Merchant',
    email: 'demo@taployal.io',
    password: hashPassword('demo1234'), // demo credentials, surfaced on the login screen
  };

  const people = [
    ['Sofia Marchetti',  'sofia.marchetti@example.com',  212, 74],
    ['James Whitfield',  'james.whitfield@example.com',  188, 61],
    ['Priya Raghavan',   'priya.raghavan@example.com',   171, 58],
    ['Daniel Okafor',    'daniel.okafor@example.com',    154, 52],
    ['Lena Fischer',     'lena.fischer@example.com',     143, 47],
    ['Marcus Chen',      'marcus.chen@example.com',      128, 44],
    ['Amara Haddad',     'amara.haddad@example.com',     112, 38],
    ['Tomás Herrera',    'tomas.herrera@example.com',     96, 33],
    ['Ingrid Sørensen',  'ingrid.sorensen@example.com',   84, 29],
    ['Noah Delgado',     'noah.delgado@example.com',      71, 24],
    ['Yuki Tanaka',      'yuki.tanaka@example.com',       58, 21],
    ['Claire Dubois',    'claire.dubois@example.com',     45, 16],
    ['Omar El-Sayed',    'omar.elsayed@example.com',      36, 12],
    ['Grace Adeyemi',    'grace.adeyemi@example.com',     27,  9],
    ['Felix Novak',      'felix.novak@example.com',       15,  5],
    ['Hannah Lindqvist', 'hannah.lindqvist@example.com',   4,  2],
  ];

  const customers = [];
  const activity = [];

  people.forEach(([name, email, joinedDaysAgo, visits], idx) => {
    const c = {
      id: id('cus'),
      name,
      email,
      points: 0,
      lifetimePoints: 0,
      visits,
      joinedAt: now - joinedDaysAgo * DAY,
      lastTapAt: null,
      createdAt: now - joinedDaysAgo * DAY,
    };

    // Spread the customer's visits over the last min(45, joinedDaysAgo) days at café hours.
    const windowDays = Math.min(45, joinedDaysAgo);
    let taps = Math.min(visits, Math.max(2, Math.floor(windowDays * 0.8)));
    if (joinedDaysAgo < 6) taps = Math.min(visits, 3);
    for (let v = 0; v < taps; v++) {
      const dayOffset = Math.floor((v / taps) * windowDays) + crypto.randomInt(2) * 0;
      const hour = 7 + crypto.randomInt(10);
      const minute = crypto.randomInt(60);
      const d = new Date(now - dayOffset * DAY);
      d.setHours(hour, minute, 0, 0);
      // keep seeded taps older than the cooldown window so demo taps earn points
      const ts = Math.min(d.getTime(), now - (settings.cooldownHours + 1) * HOUR);
      activity.push({
        id: id('act'), ts, type: 'tap', customerId: c.id, cardUid: null,
        pointsDelta: settings.pointsPerVisit,
        label: `Earned ${settings.pointsPerVisit} pts · visit`,
        awarded: true,
      });
      if (!c.lastTapAt || ts > c.lastTapAt) c.lastTapAt = ts;
    }

    c.lifetimePoints = visits * settings.pointsPerVisit + settings.welcomeBonus;

    // Balance: most members spend a share of what they earn; some hoard.
    let spent = 0;
    const redeemedCount = crypto.randomInt(4) * (idx % 3 === 0 ? 1 : 0);
    for (let r = 0; r < redeemedCount; r++) {
      const cost = pick([60, 90, 120, 120, 220]);
      if (spent + cost > c.lifetimePoints - settings.welcomeBonus) break;
      spent += cost;
      const d = new Date(now - crypto.randomInt(Math.max(2, Math.min(30, joinedDaysAgo))) * DAY);
      d.setHours(8 + crypto.randomInt(9), crypto.randomInt(60), 0, 0);
      activity.push({
        id: id('act'), ts: Math.min(d.getTime(), now - HOUR), type: 'redeem',
        customerId: c.id, cardUid: null, pointsDelta: -cost,
        label: `Redeemed reward (−${cost} pts)`,
        awarded: true,
      });
    }
    // Spendable balance = everything ever earned − everything ever redeemed.
    c.points = Math.max(0, c.lifetimePoints - spent);

    activity.push({
      id: id('act'), ts: c.joinedAt, type: 'join', customerId: c.id, cardUid: null,
      pointsDelta: settings.welcomeBonus, label: `Joined · welcome bonus +${settings.welcomeBonus} pts`,
      awarded: true,
    });

    customers.push(c);
  });

  const rewards = [
    { id: id('rew'), title: 'Free Espresso',        description: 'Any single-origin shot, pulled your way.',            cost: 60,  stock: null, active: true, icon: 'espresso' },
    { id: id('rew'), title: 'Fresh Pastry',         description: 'Today’s bake — croissant, cardamom bun or tart.',     cost: 90,  stock: 24,   active: true, icon: 'pastry'   },
    { id: id('rew'), title: 'Signature Latte',      description: 'House espresso with silky steamed milk.',             cost: 120, stock: null, active: true, icon: 'latte'    },
    { id: id('rew'), title: 'House Beans · 250g',   description: 'A bag of the current rotation, roasted this week.',   cost: 220, stock: 12,   active: true, icon: 'beans'    },
    { id: id('rew'), title: 'Ember Tote',           description: 'Heavyweight canvas, screen-printed in house.',        cost: 300, stock: 8,    active: true, icon: 'tote'     },
    { id: id('rew'), title: 'Cupping for Two',      description: 'A private guided tasting with our head roaster.',     cost: 500, stock: 4,    active: true, icon: 'cupping'  },
    { id: id('rew'), title: 'Summer Cold Brew',     description: 'Seasonal special, back next summer.',                 cost: 110, stock: 0,    active: false, icon: 'coldbrew' },
  ];

  const cards = [];
  customers.forEach((c) => {
    const uidv = cardUid();
    cards.push({ uid: uidv, customerId: c.id, status: 'active', registeredAt: c.joinedAt });
    activity.forEach((a) => { if (a.customerId === c.id && a.cardUid === null) a.cardUid = uidv; });
  });
  // Spare, unregistered tags on the counter + one voided tag.
  for (let i = 0; i < 3; i++) cards.push({ uid: cardUid(), customerId: null, status: 'active', registeredAt: now - i * 5 * DAY - DAY });
  cards.push({ uid: cardUid(), customerId: null, status: 'void', registeredAt: now - 60 * DAY });

  // Two members tapped very recently — they demonstrate the cooldown state
  // and keep the live feed feeling alive.
  customers.slice(12, 14).forEach((c) => {
    const ts = now - HOUR - crypto.randomInt(90) * 60 * 1000;
    activity.push({
      id: id('act'), ts, type: 'tap', customerId: c.id, cardUid: null,
      pointsDelta: settings.pointsPerVisit,
      label: `Earned ${settings.pointsPerVisit} pts · visit ${c.visits}`,
      awarded: true,
    });
    c.lastTapAt = ts;
  });

  activity.sort((a, b) => b.ts - a.ts);

  return {
    version: 1,
    seededAt: now,
    settings,
    merchant,
    customers,
    cards,
    rewards,
    activity,
    redemptions: [],
  };
}

/* ---------------------------------- store --------------------------------- */

class Store {
  constructor() {
    this.data = null;
  }

  load() {
    try {
      const raw = fs.readFileSync(DB_PATH, 'utf8');
      this.data = JSON.parse(raw);
      if (!this.data || this.data.version !== 1) throw new Error('stale schema');
    } catch {
      this.data = seed();
      this.save();
      console.log(`[taployal] seeded demo database → ${DB_PATH}`);
    }
    return this.data;
  }

  save() {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    const tmp = DB_PATH + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(this.data));
    fs.renameSync(tmp, DB_PATH);
  }

  /* ------------------------------ domain logic ----------------------------- */

  tierFor(lifetimePoints) {
    const tiers = [...this.data.settings.tiers].sort((a, b) => a.minLifetime - b.minLifetime);
    let current = tiers[0], next = null;
    for (const t of tiers) {
      if (lifetimePoints >= t.minLifetime) current = t;
      else if (!next) next = t;
    }
    const idx = tiers.indexOf(current);
    next = tiers[idx + 1] || null;
    return { current, next, index: idx, tiers };
  }

  customer(idv) { return this.data.customers.find((c) => c.id === idv) || null; }
  customerByEmail(email) {
    const e = String(email || '').trim().toLowerCase();
    return this.data.customers.find((c) => c.email.toLowerCase() === e) || null;
  }
  card(uidv) { return this.data.cards.find((c) => c.uid === String(uidv || '').toUpperCase()) || null; }
  reward(idv) { return this.data.rewards.find((r) => r.id === idv) || null; }

  log(type, { customerId = null, cardUid = null, pointsDelta = 0, label = '', awarded = true }) {
    const entry = { id: id('act'), ts: Date.now(), type, customerId, cardUid, pointsDelta, label, awarded };
    this.data.activity.unshift(entry);
    if (this.data.activity.length > 5000) this.data.activity.length = 5000;
    return entry;
  }

  /**
   * An NFC tap. Mirrors the physical world: opening the tag URL *is* the tap.
   * Returns a discriminated union the UI renders as distinct states.
   */
  tap(uidv) {
    const card = this.card(uidv);
    if (!card) return { status: 'unknown_card' };
    if (card.status === 'void') return { status: 'void' };
    if (!card.customerId) return { status: 'unassigned', uid: card.uid };

    const c = this.customer(card.customerId);
    if (!c) return { status: 'unassigned', uid: card.uid };

    const s = this.data.settings;
    const now = Date.now();
    const cooldownMs = s.cooldownHours * HOUR;
    const sinceLast = c.lastTapAt ? now - c.lastTapAt : Infinity;

    if (sinceLast < cooldownMs) {
      const nextAt = c.lastTapAt + cooldownMs;
      return {
        status: 'cooldown', customer: publicCustomer(this, c), nextAt,
        waitMs: nextAt - now,
      };
    }

    const before = this.tierFor(c.lifetimePoints);
    c.visits += 1;
    c.points += s.pointsPerVisit;
    c.lifetimePoints += s.pointsPerVisit;
    c.lastTapAt = now;
    const after = this.tierFor(c.lifetimePoints);

    this.log('tap', {
      customerId: c.id, cardUid: card.uid, pointsDelta: s.pointsPerVisit,
      label: `Earned ${s.pointsPerVisit} pts · visit ${c.visits}`,
    });

    return {
      status: 'earned',
      customer: publicCustomer(this, c),
      awarded: s.pointsPerVisit,
      tierUp: after.index > before.index ? after.current : null,
    };
  }

  join(uidv, name, email) {
    const card = this.card(uidv);
    if (!card) return { status: 'unknown_card' };
    if (card.status === 'void') return { status: 'void' };

    const s = this.data.settings;
    const cleanName = String(name || '').trim().slice(0, 60);
    const cleanEmail = String(email || '').trim().toLowerCase();
    if (cleanName.length < 2) return { status: 'invalid', message: 'Please enter your name.' };
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(cleanEmail)) return { status: 'invalid', message: 'That email doesn’t look right.' };

    let c = this.customerByEmail(cleanEmail);
    let welcomeGranted = false;

    if (c) {
      // Returning member claiming a replacement tag.
      if (this.data.cards.some((k) => k.customerId === c.id && k.uid === card.uid)) {
        return { status: 'already_yours', customer: publicCustomer(this, c) };
      }
      if (card.customerId && card.customerId !== c.id) return { status: 'taken' };
      card.customerId = c.id;
      this.log('join', { customerId: c.id, cardUid: card.uid, label: 'Linked a new tag · welcome back' });
    } else {
      if (card.customerId) return { status: 'taken' };
      c = {
        id: id('cus'), name: cleanName, email: cleanEmail,
        points: s.welcomeBonus, lifetimePoints: s.welcomeBonus, visits: 0,
        joinedAt: Date.now(), lastTapAt: null, createdAt: Date.now(),
      };
      card.customerId = c.id;
      this.data.customers.push(c);
      welcomeGranted = true;
      this.log('join', {
        customerId: c.id, cardUid: card.uid, pointsDelta: s.welcomeBonus,
        label: `Joined · welcome bonus +${s.welcomeBonus} pts`,
      });
    }

    this.save();
    return { status: welcomeGranted ? 'joined' : 'linked', customer: publicCustomer(this, c), welcomeBonus: welcomeGranted ? s.welcomeBonus : 0 };
  }

  redeem({ uidv = null, customerId = null, rewardId }) {
    const reward = this.reward(rewardId);
    if (!reward) return { status: 'not_found' };
    if (!reward.active) return { status: 'inactive' };
    if (reward.stock !== null && reward.stock <= 0) return { status: 'out_of_stock' };

    let c = null;
    if (uidv) {
      const card = this.card(uidv);
      if (card && card.customerId) c = this.customer(card.customerId);
    } else if (customerId) {
      c = this.customer(customerId);
    }
    if (!c) return { status: 'unknown_customer' };
    if (c.points < reward.cost) return { status: 'insufficient', balance: c.points };

    c.points -= reward.cost;
    if (reward.stock !== null) reward.stock -= 1;
    const code = `EMB-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
    const redemption = {
      id: id('red'), ts: Date.now(), code, customerId: c.id, rewardId: reward.id,
      title: reward.title, cost: reward.cost, state: 'ready',
    };
    this.data.redemptions.unshift(redemption);
    this.log('redeem', {
      customerId: c.id, pointsDelta: -reward.cost, label: `Redeemed “${reward.title}” (−${reward.cost} pts)`,
    });
    this.save();
    return { status: 'ok', redemption, balance: c.points };
  }

  stats() {
    const now = Date.now();
    const d30 = now - 30 * DAY;
    const act = this.data.activity;
    const taps30 = act.filter((a) => a.type === 'tap' && a.ts >= d30);
    const joins30 = act.filter((a) => a.type === 'join' && a.ts >= d30);
    const redeems30 = act.filter((a) => a.type === 'redeem' && a.ts >= d30);

    const tapsByDay = [];
    for (let i = 29; i >= 0; i--) {
      const dayStart = new Date(now - i * DAY); dayStart.setHours(0, 0, 0, 0);
      const dayEnd = dayStart.getTime() + DAY;
      const taps = act.filter((a) => a.type === 'tap' && a.ts >= dayStart.getTime() && a.ts < dayEnd).length;
      const joins = act.filter((a) => a.type === 'join' && a.ts >= dayStart.getTime() && a.ts < dayEnd).length;
      tapsByDay.push({ day: dayStart.toISOString().slice(0, 10), taps, joins });
    }

    const tierCounts = {};
    for (const t of this.data.settings.tiers) tierCounts[t.name] = 0;
    for (const c of this.data.customers) tierCounts[this.tierFor(c.lifetimePoints).current.name]++;

    return {
      members: this.data.customers.length,
      pointsInCirculation: this.data.customers.reduce((s, c) => s + c.points, 0),
      taps30d: taps30.length,
      joins30d: joins30.length,
      redeems30d: redeems30.length,
      activeTags: this.data.cards.filter((k) => k.status === 'active').length,
      tapsByDay,
      tierCounts,
      topMembers: [...this.data.customers]
        .sort((a, b) => b.lifetimePoints - a.lifetimePoints).slice(0, 5)
        .map((c) => publicCustomer(this, c)),
    };
  }
}

function publicCustomer(store, c) {
  const t = store.tierFor(c.lifetimePoints);
  return {
    id: c.id, name: c.name, email: c.email,
    points: c.points, lifetimePoints: c.lifetimePoints, visits: c.visits,
    joinedAt: c.joinedAt, lastTapAt: c.lastTapAt,
    tier: t.current, nextTier: t.next,
  };
}

module.exports = { Store, publicCustomer, cardUid, verifyPassword, hashPassword, id };
