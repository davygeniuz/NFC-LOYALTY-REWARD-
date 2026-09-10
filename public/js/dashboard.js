/* Taployal — merchant dashboard. */
'use strict';

/* hydrate static [data-ic] slots */
$$('[data-ic]').forEach((el) => {
  el.outerHTML = icon(el.dataset.ic, el.dataset.cls || '');
});

const state = {
  me: null,
  stats: null,
  customers: [],
  rewards: [],
  cards: [],
  settings: null,
  view: 'overview',
  detailId: null,
};

/* ================================ auth ================================ */

async function boot() {
  const { me } = await tryMe();
  if (me) enterApp(me);
  else showLogin();
}

async function tryMe() {
  const res = await api('/api/auth/me');
  return { me: res.ok ? res.data : null };
}

function showLogin() {
  $('#authStage').hidden = false;
  $('#shell').hidden = true;
  setTimeout(() => $('#loginEmail').focus(), 60);
}

async function enterApp(me) {
  state.me = me;
  $('#authStage').hidden = true;
  $('#shell').hidden = false;
  $('#userName').textContent = me.name;
  $('#userBiz').textContent = me.business;
  $('#userAvatar').textContent = initials(me.name);
  await Promise.all([loadOverview(), loadCustomers(), loadRewards(), loadCards(), loadSettings()]);
  renderAll();
  startLive();
}

$('#fillDemo').addEventListener('click', () => {
  $('#loginEmail').value = 'demo@taployal.io';
  $('#loginPass').value = 'demo1234';
  $('#authError').classList.remove('show');
});

$('#loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = $('#loginBtn');
  btn.disabled = true; btn.textContent = 'Signing in…';
  const res = await api('/api/auth/login', {
    method: 'POST',
    body: { email: $('#loginEmail').value, password: $('#loginPass').value },
  });
  btn.disabled = false; btn.textContent = 'Sign in';
  if (!res.ok) {
    const err = $('#authError');
    err.textContent = res.data?.error || 'Sign in failed.';
    err.classList.add('show');
    err.animate([{ transform: 'translateX(-6px)' }, { transform: 'translateX(6px)' }, { transform: 'none' }], { duration: 260 });
    return;
  }
  enterApp(res.data);
});

$('#logoutBtn').addEventListener('click', async () => {
  await api('/api/auth/logout', { method: 'POST' });
  location.reload();
});

/* ================================ nav ================================ */

const VIEWS = [
  { id: 'overview', label: 'Overview', icon: 'dash', crumb: 'Today at a glance' },
  { id: 'members',  label: 'Members',  icon: 'users', crumb: 'Everyone in the programme' },
  { id: 'rewards',  label: 'Rewards',  icon: 'gift', crumb: 'What points can buy' },
  { id: 'tags',     label: 'NFC tags', icon: 'scan', crumb: 'Your physical earn points' },
  { id: 'settings', label: 'Settings', icon: 'gear', crumb: 'Programme rules & tiers' },
];

$('#sideNav').innerHTML = VIEWS.map((v) =>
  `<button class="side-link" data-view="${v.id}">${icon(v.icon)}${v.label}</button>`).join('');

function setView(id) {
  state.view = id;
  const v = VIEWS.find((x) => x.id === id);
  $$('#sideNav .side-link').forEach((b) => b.classList.toggle('active', b.dataset.view === id));
  $$('.view').forEach((s) => s.classList.toggle('active', s.id === `view-${id}`));
  $('#viewTitle').textContent = v.label;
  $('#viewCrumb').textContent = v.crumb;
  $('#sidebar').classList.remove('open');
  $('#scrim').classList.remove('on');
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

$('#sideNav').addEventListener('click', (e) => {
  const b = e.target.closest('[data-view]');
  if (b) setView(b.dataset.view);
});
$('#menuBtn').addEventListener('click', () => { $('#sidebar').classList.add('open'); $('#scrim').classList.add('on'); });
$('#scrim').addEventListener('click', () => { $('#sidebar').classList.remove('open'); $('#scrim').classList.remove('on'); });

/* ============================== live updates ============================= */

let liveTimer = null;
function startLive() {
  clearInterval(liveTimer);
  liveTimer = setInterval(async () => {
    await Promise.all([loadOverview(), loadCustomers(true)]);
    renderOverview();
    renderMembers();
  }, 20000);
}

/* ================================ data ================================ */

async function loadOverview() {
  const [stats, feed] = await Promise.all([api('/api/stats'), api('/api/activity?limit=14')]);
  if (stats.ok) state.stats = stats.data;
  if (feed.ok) state.feed = feed.data.activity;
}
async function loadCustomers(quiet) {
  const q = $('#memberSearch')?.value || '';
  const sort = $('#memberSort')?.value || 'recent';
  const res = await api(`/api/customers?sort=${sort}&q=${encodeURIComponent(q)}`);
  if (res.ok) state.customers = res.data.customers;
}
async function loadRewards() {
  const res = await api('/api/rewards');
  if (res.ok) state.rewards = res.data.rewards;
}
async function loadCards() {
  const res = await api('/api/cards');
  if (res.ok) state.cards = res.data.cards;
}
async function loadSettings() {
  const res = await api('/api/settings');
  if (res.ok) state.settings = res.data.settings;
}

function renderAll() {
  renderOverview(); renderMembers(); renderRewards(); renderTags(); renderSettings();
}

/* =============================== overview =============================== */

const TIER_TONES = ['#8b8577', '#c9a24b', '#7dd6b0', '#e0b7d4', '#9fb3a4', '#e07856'];

function renderOverview() {
  const s = state.stats;
  if (!s) return;

  const cards = [
    { label: 'Members', icon: 'users', val: s.members, sub: `+${s.joins30d} this month` },
    { label: 'Taps · 30d', icon: 'wave', val: s.taps30d, sub: `${(s.taps30d / 30).toFixed(1)} per day` },
    { label: 'Pts in circulation', icon: 'spark', val: s.pointsInCirculation, sub: 'unspent balance' },
    { label: 'Redeem · 30d', icon: 'gift', val: s.redeems30d, sub: 'rewards claimed' },
  ];
  $('#statGrid').innerHTML = cards.map((c, i) => `
    <div class="card stat-card">
      <div class="lbl">${icon(c.icon)}${c.label}</div>
      <div class="val" data-count="${c.val}">0</div>
      <div class="delta" style="color:var(--text-lo)">${escapeHtml(c.sub)}</div>
    </div>`).join('');
  // Animate the counters once; later live refreshes just settle silently.
  $$('#statGrid .val').forEach((el) => {
    const to = Number(el.dataset.count);
    if (state.seenStats) el.textContent = fmtNum(to);
    else countUp(el, to, { duration: 1200 });
  });
  state.seenStats = true;

  renderAreaChart(s.tapsByDay);
  renderDonut(s.tierCounts);
  renderTopMembers(s.topMembers);
  renderFeed();
}

function smoothPath(pts) {
  if (pts.length < 2) return '';
  let d = `M ${pts[0].x},${pts[0].y}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(pts.length - 1, i + 2)];
    const c1x = p1.x + (p2.x - p0.x) / 6, c1y = p1.y + (p2.y - p0.y) / 6;
    const c2x = p2.x - (p3.x - p1.x) / 6, c2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C ${c1x},${c1y} ${c2x},${c2y} ${p2.x},${p2.y}`;
  }
  return d;
}

function renderAreaChart(days) {
  const W = 720, H = 240, P = { l: 34, r: 12, t: 16, b: 26 };
  const iw = W - P.l - P.r, ih = H - P.t - P.b;
  const max = Math.max(4, ...days.map((d) => d.taps));
  const x = (i) => P.l + (i / (days.length - 1)) * iw;
  const y = (v) => P.t + ih - (v / max) * ih;

  const taps = days.map((d, i) => ({ x: x(i), y: y(d.taps) }));
  const joins = days.map((d, i) => ({ x: x(i), y: y(Math.min(d.joins * 2.4, max)) })); // scaled for visibility, clamped

  const areaPath = `${smoothPath(taps)} L ${x(days.length - 1)},${P.t + ih} L ${x(0)},${P.t + ih} Z`;
  const grid = [0.25, 0.5, 0.75, 1].map((f) => {
    const gy = P.t + ih - f * ih;
    return `<line x1="${P.l}" y1="${gy}" x2="${W - P.r}" y2="${gy}" stroke="rgba(244,240,230,.06)" stroke-dasharray="2 5"/>`;
  }).join('');
  const labels = days.map((d, i) =>
    i % 5 === 0 ? `<text x="${x(i)}" y="${H - 8}" text-anchor="middle">${d.day.slice(5).replace('-', '/')}</text>` : '').join('');

  $('#chartBody').innerHTML = `
    <svg class="area-chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Taps over the last 30 days">
      <defs>
        <linearGradient id="ag" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#c9a24b" stop-opacity=".32"/>
          <stop offset="1" stop-color="#c9a24b" stop-opacity="0"/>
        </linearGradient>
      </defs>
      ${grid}${labels}
      <path d="${areaPath}" fill="url(#ag)"/>
      <path d="${smoothPath(joins)}" fill="none" stroke="rgba(125,214,176,.85)" stroke-width="1.6" stroke-dasharray="3 4"/>
      <path d="${smoothPath(taps)}" fill="none" stroke="#c9a24b" stroke-width="2.2" id="tapLine"/>
    </svg>`;

  const line = $('#tapLine');
  if (line) {
    const len = line.getTotalLength();
    line.style.strokeDasharray = len;
    line.style.strokeDashoffset = len;
    requestAnimationFrame(() => {
      line.style.transition = 'stroke-dashoffset 1.6s cubic-bezier(.22,1,.36,1)';
      line.style.strokeDashoffset = '0';
    });
  }
}

function renderDonut(tierCounts) {
  const entries = Object.entries(tierCounts);
  const total = entries.reduce((a, [, v]) => a + v, 0) || 1;
  const R = 52, C = 2 * Math.PI * R;
  let offset = 0;
  const rings = entries.map(([name, val], i) => {
    const frac = val / total;
    const el = `<circle cx="70" cy="70" r="${R}" fill="none" stroke="${TIER_TONES[i % TIER_TONES.length]}"
      stroke-width="16" stroke-dasharray="${(frac * C).toFixed(2)} ${C.toFixed(2)}"
      stroke-dashoffset="${(-offset * C).toFixed(2)}" transform="rotate(-90 70 70)" stroke-linecap="butt" opacity=".92"/>`;
    offset += frac;
    return el;
  }).join('');

  $('#donutBody').innerHTML = `
    <div class="donut-wrap">
      <svg width="140" height="140" viewBox="0 0 140 140">
        ${rings}
        <text x="70" y="66" text-anchor="middle" fill="#f4f0e6" font-size="22" font-weight="600" font-family="Fraunces,serif">${total}</text>
        <text x="70" y="84" text-anchor="middle" fill="rgba(244,240,230,.5)" font-size="9" letter-spacing="2">MEMBERS</text>
      </svg>
      <div class="donut-legend">
        ${entries.map(([name, val], i) => `
          <div class="row">
            <span class="swatch" style="background:${TIER_TONES[i % TIER_TONES.length]}"></span>
            <span>${escapeHtml(name)}</span>
            <span class="val">${val}</span>
          </div>`).join('')}
      </div>
    </div>`;
}

function renderTopMembers(list) {
  $('#topMembers').innerHTML = (list || []).map((c, i) => `
    <div class="feed-item" style="border-bottom:${i === list.length - 1 ? 0 : ''}">
      <span class="avatar sm ${avatarTone(c.id)}">${initials(c.name)}</span>
      <div class="feed-body"><span class="who">${escapeHtml(c.name)}</span>
        <span class="what">${escapeHtml(c.tier.name)} · ${c.visits} visits</span></div>
      <b style="color:var(--gold-300);font-variant-numeric:tabular-nums">${fmtNum(c.lifetimePoints)}</b>
    </div>`).join('');
}

const FEED_META = {
  tap:    { icon: 'wave', cls: 'tap' },
  redeem: { icon: 'gift', cls: 'redeem' },
  join:   { icon: 'star', cls: 'join' },
  adjust: { icon: 'arrows', cls: 'adjust' },
  reward: { icon: 'edit', cls: 'reward' },
  card:   { icon: 'scan', cls: 'card' },
};

function renderFeed() {
  const feed = state.feed || [];
  $('#feed').innerHTML = feed.length ? feed.map((a) => {
    const m = FEED_META[a.type] || FEED_META.tap;
    return `
      <div class="feed-item">
        <span class="feed-icon ${m.cls}">${icon(m.icon)}</span>
        <div class="feed-body">
          <span class="who">${escapeHtml(a.customerName || 'System')}</span>
          <span class="what">${escapeHtml(a.label)}</span>
        </div>
        <span class="feed-when">${timeAgo(a.ts)}</span>
      </div>`;
  }).join('') : `<div class="empty">No activity yet — taps will appear here the moment they happen.</div>`;
}

$('#refreshFeed').addEventListener('click', async () => { await loadOverview(); renderFeed(); toast('Feed refreshed'); });

/* =============================== members ================================ */

function tierPill(tier) {
  return `<span class="pill" style="color:${tier.tone};border-color:${tier.tone}55;background:${tier.tone}14">
    <span class="dot" style="background:${tier.tone}"></span>${escapeHtml(tier.name)}</span>`;
}

function renderMembers() {
  const t = $('#memberTable');
  const rows = state.customers.map((c) => `
    <tr data-id="${c.id}" style="cursor:pointer">
      <td><div class="member-cell">
        <span class="avatar ${avatarTone(c.id)}">${initials(c.name)}</span>
        <div class="who"><b>${escapeHtml(c.name)}</b><span>${escapeHtml(c.email)}</span></div>
      </div></td>
      <td>${tierPill(c.tier)}</td>
      <td class="num" style="color:var(--gold-300);font-weight:600">${fmtNum(c.points)}</td>
      <td class="num">${fmtNum(c.visits)}</td>
      <td class="num" style="color:var(--text-mid)">${fmtNum(c.lifetimePoints)}</td>
      <td style="color:var(--text-lo);white-space:nowrap">${timeAgo(c.lastTapAt)}</td>
      <td class="num"><span class="icon-btn" style="pointer-events:none">${icon('chevR')}</span></td>
    </tr>`).join('');
  t.innerHTML = `
    <thead><tr>
      <th>Member</th><th>Tier</th><th class="num">Balance</th><th class="num">Visits</th>
      <th class="num">Lifetime</th><th>Last tap</th><th></th>
    </tr></thead>
    <tbody>${rows || `<tr><td colspan="7"><div class="empty">No members match your search.</div></td></tr>`}</tbody>`;
}

let searchTimer;
$('#memberSearch').addEventListener('input', () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(async () => { await loadCustomers(); renderMembers(); }, 220);
});
$('#memberSort').addEventListener('change', async () => { await loadCustomers(); renderMembers(); });

$('#memberTable').addEventListener('click', (e) => {
  const tr = e.target.closest('tr[data-id]');
  if (tr) openMemberDetail(tr.dataset.id);
});

/* member creation */
const memberModal = wireModal($('#memberModal'), () => { $('#nmName').value = ''; $('#nmEmail').value = ''; });
$('#addMemberBtn').addEventListener('click', memberModal.open);
$('#nmCreate').addEventListener('click', async () => {
  const res = await api('/api/customers', {
    method: 'POST',
    body: { name: $('#nmName').value, email: $('#nmEmail').value, withTag: $('#nmTag').checked },
  });
  if (!res.ok) return toast(res.data?.error || 'Could not create member', true);
  memberModal.close();
  toast(`Welcome, ${res.data.customer.name.split(' ')[0]} — member created`);
  await Promise.all([loadCustomers(), loadOverview(), loadCards()]);
  renderAll();
});

/* member detail */
const detailModal = wireModal($('#detailModal'));

async function openMemberDetail(idv) {
  state.detailId = idv;
  const res = await api(`/api/customers/${idv}`);
  if (!res.ok) return toast('Could not load member', true);
  const { customer: c, tags, activity, redemptions } = res.data;

  $('#dmAvatar').textContent = initials(c.name);
  $('#dmAvatar').className = `avatar ${avatarTone(c.id)}`;
  $('#dmName').textContent = c.name;
  $('#dmEmail').textContent = c.email;

  $('#dmBody').innerHTML = `
    <div class="kv">
      <div><div class="k">Balance</div><div class="v" style="color:var(--gold-300)">${fmtNum(c.points)} pts</div></div>
      <div><div class="k">Lifetime</div><div class="v">${fmtNum(c.lifetimePoints)} pts</div></div>
      <div><div class="k">Visits</div><div class="v">${fmtNum(c.visits)}</div></div>
      <div><div class="k">Tier</div><div class="v">${tierPill(c.tier)}</div></div>
      <div><div class="k">Member since</div><div class="v" style="font-size:13.5px">${fmtDate(c.joinedAt)}</div></div>
      <div><div class="k">Last tap</div><div class="v" style="font-size:13.5px">${timeAgo(c.lastTapAt)}</div></div>
    </div>
    <div class="divider"></div>
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
      <span class="panel-title">Linked tags</span>
      ${tags[0] ? `<button class="btn btn-ghost btn-xs" id="dmCopy">${icon('copy')}Copy wallet link</button>` : ''}
    </div>
    <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:6px">
      ${tags.length ? tags.map((k) => `<span class="tag-mono">${k.uid}${k.status === 'void' ? ' · void' : ''}</span>`).join('') : '<span class="hint">No tags linked.</span>'}
    </div>
    ${tags[0] ? `<button class="btn btn-dark btn-sm btn-block" id="dmWallet" style="margin-top:8px">${icon('wallet', 'icon')}Open their wallet</button>` : ''}
    <div class="divider"></div>
    <span class="panel-title">Adjust balance</span>
    <div style="display:flex;gap:8px;margin-top:10px">
      <input class="input" id="adjAmt" type="number" placeholder="± points" style="width:130px" />
      <input class="input" id="adjReason" placeholder="Reason (e.g. goodwill)" style="flex:1" />
      <button class="btn btn-gold btn-sm" id="adjGo" style="align-self:center">Apply</button>
    </div>
    <div class="divider"></div>
    <span class="panel-title">Recent activity</span>
    <div style="margin-top:8px">
      ${activity.length ? activity.slice(0, 6).map((a) => {
        const m = FEED_META[a.type] || FEED_META.tap;
        return `<div class="feed-item"><span class="feed-icon ${m.cls}">${icon(m.icon)}</span>
          <div class="feed-body"><span class="what" style="white-space:normal">${escapeHtml(a.label)}</span></div>
          <span class="feed-when">${timeAgo(a.ts)}</span></div>`;
      }).join('') : '<p class="hint" style="margin:10px 0 4px">No activity yet.</p>'}
    </div>`;

  const first = tags[0];
  $('#dmCopy')?.addEventListener('click', async () => {
    await navigator.clipboard.writeText(`${location.origin}/wallet/${first.uid}`);
    toast('Wallet link copied');
  });
  $('#dmWallet')?.addEventListener('click', () => window.open(`/wallet/${first.uid}`, '_blank'));
  $('#adjGo').addEventListener('click', async () => {
    const amt = Number($('#adjAmt').value);
    if (!Number.isFinite(amt) || amt === 0) return toast('Enter a non-zero amount', true);
    const r2 = await api(`/api/customers/${c.id}`, {
      method: 'PATCH',
      body: { adjustPoints: Math.trunc(amt), reason: $('#adjReason').value },
    });
    if (!r2.ok) return toast(r2.data?.error || 'Adjustment failed', true);
    toast(`${amt > 0 ? '+' : ''}${amt} pts applied`);
    await Promise.all([loadCustomers(), loadOverview()]);
    renderMembers(); renderOverview();
    openMemberDetail(c.id);
  });

  detailModal.open();
}

/* =============================== rewards ================================ */

const REWARD_ICONS = ['espresso', 'latte', 'pastry', 'beans', 'tote', 'cupping', 'coldbrew', 'gift', 'ticket', 'star', 'spark', 'award', 'wallet', 'heart'];
ICONS.heart = '<path d="M12 20.5S3.5 15 3.5 9.3A4.6 4.6 0 0 1 12 6a4.6 4.6 0 0 1 8.5 3.3C20.5 15 12 20.5 12 20.5Z"/>';

function rewardIcon(name) { return icon(ICONS[name] ? name : 'gift'); }

function renderRewards() {
  const active = state.rewards.filter((r) => r.active).length;
  $('#rewardHint').textContent = `${active} of ${state.rewards.length} rewards visible in member wallets.`;
  $('#rewardGrid').innerHTML = state.rewards.map((r) => `
    <div class="card reward-card ${r.active ? '' : 'inactive'}" data-id="${r.id}">
      <div class="reward-top">
        <span class="reward-icon">${rewardIcon(r.icon)}</span>
        <span class="pill ${r.active ? 'pill-mint' : 'pill-plain'}">${r.active ? 'Live' : 'Hidden'}</span>
      </div>
      <h3>${escapeHtml(r.title)}</h3>
      <p class="desc">${escapeHtml(r.description || '—')}</p>
      <div class="reward-foot">
        <span class="reward-cost">${fmtNum(r.cost)}<small> PTS</small></span>
        <div style="display:flex;align-items:center;gap:4px">
          ${r.stock !== null ? `<span class="reward-stock">${r.stock} left</span>` : ''}
          <button class="icon-btn" data-edit title="Edit">${icon('edit')}</button>
          <button class="icon-btn" data-del title="Delete">${icon('trash')}</button>
        </div>
      </div>
    </div>`).join('') || `<div class="empty" style="grid-column:1/-1">No rewards yet — create your first one.</div>`;
}

let rwIconPick = 'espresso';
const rewardModal = wireModal($('#rewardModal'));
$('#addRewardBtn').addEventListener('click', () => openRewardModal(null));

function openRewardModal(r) {
  $('#rwTitle').textContent = r ? 'Edit reward' : 'New reward';
  $('#rwId').value = r?.id || '';
  $('#rwName').value = r?.title || '';
  $('#rwDesc').value = r?.description || '';
  $('#rwCost').value = r?.cost || '';
  $('#rwStock').value = r?.stock ?? '';
  $('#rwActive').checked = r ? r.active : true;
  rwIconPick = r?.icon || 'espresso';
  renderIconPick();
  rewardModal.open();
}

function renderIconPick() {
  $('#rwIcons').innerHTML = REWARD_ICONS.map((n) =>
    `<button type="button" data-icon="${n}" class="${n === rwIconPick ? 'sel' : ''}" title="${n}">${icon(n)}</button>`).join('');
}
$('#rwIcons').addEventListener('click', (e) => {
  const b = e.target.closest('[data-icon]');
  if (!b) return;
  rwIconPick = b.dataset.icon;
  renderIconPick();
});

$('#rwSave').addEventListener('click', async () => {
  const idv = $('#rwId').value;
  const body = {
    title: $('#rwName').value,
    description: $('#rwDesc').value,
    cost: Number($('#rwCost').value),
    stock: $('#rwStock').value === '' ? null : Number($('#rwStock').value),
    active: $('#rwActive').checked,
    icon: rwIconPick,
  };
  const res = await api(idv ? `/api/rewards/${idv}` : '/api/rewards', { method: idv ? 'PATCH' : 'POST', body });
  if (!res.ok) return toast(res.data?.error || 'Save failed', true);
  rewardModal.close();
  toast(idv ? 'Reward updated' : 'Reward created');
  await loadRewards(); renderRewards();
});

$('#rewardGrid').addEventListener('click', (e) => {
  const card = e.target.closest('.reward-card');
  if (!card) return;
  const r = state.rewards.find((x) => x.id === card.dataset.id);
  if (!r) return;
  if (e.target.closest('[data-del]')) {
    confirmModal.ask('Delete reward?', `“${r.title}” will disappear from every wallet. Points are unaffected.`, async () => {
      await api(`/api/rewards/${r.id}`, { method: 'DELETE' });
      toast('Reward removed');
      await loadRewards(); renderRewards();
    });
  } else if (e.target.closest('[data-edit]') || !e.target.closest('button')) {
    openRewardModal(r);
  }
});

/* confirm modal helper */
const cfOverlay = $('#confirmModal');
const cfCtl = wireModal(cfOverlay);
cfCtl.ask = (title, text, onYes) => {
  $('#cfTitle').textContent = title;
  $('#cfText').textContent = text;
  $('#cfYes').onclick = async () => { cfCtl.close(); await onYes(); };
  cfCtl.open();
};
const confirmModal = cfCtl;

/* ================================ tags ================================== */

function renderTags() {
  const t = $('#tagTable');
  const rows = state.cards.map((k) => `
    <tr>
      <td><span class="tag-mono">${k.uid}</span></td>
      <td>${k.customerName
        ? `<div class="member-cell" style="min-width:0"><div class="who"><b>${escapeHtml(k.customerName)}</b><span>${escapeHtml(k.customerEmail || '')}</span></div></div>`
        : '<span style="color:var(--text-lo)">Unassigned</span>'}</td>
      <td>${k.status === 'active' ? '<span class="pill pill-mint"><span class="dot"></span>Active</span>'
                                 : '<span class="pill pill-danger"><span class="dot"></span>Void</span>'}</td>
      <td style="color:var(--text-lo);white-space:nowrap">${timeAgo(k.registeredAt)}</td>
      <td class="num" style="white-space:nowrap">
        ${k.status === 'active' ? `<button class="btn btn-ghost btn-xs" data-test="${k.uid}">${icon('wave')}Test tap</button>` : ''}
        <button class="icon-btn" data-copylink="${k.uid}" title="Copy earn link">${icon('copy')}</button>
        <button class="icon-btn" data-assign="${k.uid}" title="Link member">${icon('link')}</button>
        <button class="icon-btn" data-toggle="${k.uid}" title="${k.status === 'active' ? 'Void tag' : 'Reactivate'}">${icon(k.status === 'active' ? 'x' : 'refresh')}</button>
      </td>
    </tr>`).join('');
  t.innerHTML = `
    <thead><tr><th>Tag UID</th><th>Linked member</th><th>Status</th><th>Registered</th><th class="num">Actions</th></tr></thead>
    <tbody>${rows || `<tr><td colspan="5"><div class="empty">No tags registered yet.</div></td></tr>`}</tbody>`;
}

$('#addTagBtn').addEventListener('click', async () => {
  const res = await api('/api/cards', { method: 'POST' });
  if (!res.ok) return toast('Could not register tag', true);
  toast(`Tag ${res.data.card.uid} registered`);
  await Promise.all([loadCards(), loadOverview()]);
  renderTags(); renderOverview();
});

$('#tagTable').addEventListener('click', async (e) => {
  const test = e.target.closest('[data-test]');
  const copy = e.target.closest('[data-copylink]');
  const assign = e.target.closest('[data-assign]');
  const toggle = e.target.closest('[data-toggle]');

  if (test) window.open(`/tap/${test.dataset.test}`, '_blank');
  if (copy) {
    await navigator.clipboard.writeText(`${location.origin}/tap/${copy.dataset.copylink}`);
    toast('Earn link copied — program it onto your NFC sticker');
  }
  if (assign) {
    const uidv = assign.dataset.assign;
    $('#amUid').textContent = uidv;
    const opts = state.customers.map((c) => `<option value="${c.id}">${escapeHtml(c.name)} · ${fmtNum(c.points)} pts</option>`).join('');
    $('#amMember').innerHTML = `<option value="">— Unassigned —</option>${opts}`;
    const card = state.cards.find((k) => k.uid === uidv);
    $('#amMember').value = card?.customerId || '';
    assignCtl.tag = uidv;
    assignCtl.open();
  }
  if (toggle) {
    await api(`/api/cards/${toggle.dataset.toggle}/toggle`, { method: 'POST' });
    await loadCards(); renderTags();
    toast('Tag status updated');
  }
});

const assignCtl = wireModal($('#assignModal'));
$('#amSave').addEventListener('click', async () => {
  const target = $('#amMember').value;
  if (target) {
    await api(`/api/cards/${assignCtl.tag}/assign`, { method: 'POST', body: { customerId: target } });
    toast('Tag linked');
  } else {
    await api(`/api/cards/${assignCtl.tag}/unlink`, { method: 'POST' });
    toast('Tag unlinked');
  }
  assignCtl.close();
  await loadCards(); renderTags();
});

/* =============================== settings =============================== */

function renderSettings() {
  const s = state.settings;
  if (!s) return;
  $('#setBiz').value = s.businessName;
  $('#setTagline').value = s.tagline || '';
  $('#setPPV').value = s.pointsPerVisit;
  $('#setBonus').value = s.welcomeBonus;
  $('#setCooldown').value = s.cooldownHours;
  renderTierRows();
}

function renderTierRows() {
  const tiers = state.settings?.tiers || [];
  $('#tierRows').innerHTML = tiers.map((t, i) => `
    <div class="tier-row" data-i="${i}">
      <input class="input" data-f="name" value="${escapeHtml(t.name)}" placeholder="Tier name" ${i === 0 ? '' : ''} />
      <input class="input" data-f="minLifetime" type="number" min="0" value="${t.minLifetime}" ${i === 0 ? 'disabled title="First tier always starts at 0"' : ''} />
      <input class="input" data-f="perk" value="${escapeHtml(t.perk || '')}" placeholder="Headline perk" />
      ${tiers.length > 1 && i > 0 ? `<button class="icon-btn" data-del-tier="${i}" title="Remove tier">${icon('trash')}</button>` : '<span></span>'}
    </div>`).join('');
}

$('#addTierBtn').addEventListener('click', () => {
  const tiers = collectTiers();
  if (tiers.length >= 6) return toast('Six tiers is plenty', true);
  const last = tiers[tiers.length - 1];
  tiers.push({ name: 'New tier', minLifetime: (last?.minLifetime || 0) + 250, perk: '', tone: TIER_TONES[tiers.length % TIER_TONES.length] });
  state.settings.tiers = tiers;
  renderTierRows();
});

$('#tierRows').addEventListener('click', (e) => {
  const del = e.target.closest('[data-del-tier]');
  if (!del) return;
  const tiers = collectTiers();
  tiers.splice(Number(del.dataset.delTier), 1);
  state.settings.tiers = tiers;
  renderTierRows();
});

function collectTiers() {
  return $$('#tierRows .tier-row').map((row, i) => {
    const tone = state.settings.tiers[i]?.tone || TIER_TONES[i % TIER_TONES.length];
    return {
      name: row.querySelector('[data-f="name"]').value,
      minLifetime: Number(row.querySelector('[data-f="minLifetime"]').value) || 0,
      perk: row.querySelector('[data-f="perk"]').value,
      tone,
    };
  });
}

$('#saveSettings').addEventListener('click', async () => {
  const res = await api('/api/settings', {
    method: 'PATCH',
    body: {
      businessName: $('#setBiz').value,
      tagline: $('#setTagline').value,
      pointsPerVisit: Number($('#setPPV').value),
      welcomeBonus: Number($('#setBonus').value),
      cooldownHours: Number($('#setCooldown').value),
      tiers: collectTiers(),
    },
  });
  if (!res.ok) return toast('Save failed', true);
  state.settings = res.data.settings;
  $('#userBiz').textContent = res.data.settings.businessName;
  toast('Programme updated');
  await loadOverview(); renderOverview();
});

/* ============================ simulate tap ============================= */

async function simulateTap() {
  const { ok, data } = await api('/api/public/sample-tap');
  if (!ok || !data.uid) return toast('No live tag available', true);
  window.open(`/tap/${encodeURIComponent(data.uid)}`, '_blank');
}
$('#simTap').addEventListener('click', simulateTap);
$('#topSimTap').addEventListener('click', simulateTap);

/* ================================ go ================================== */

setView('overview');
boot();
