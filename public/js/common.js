/* Taployal — shared helpers: API client, icons, formatting, toasts. */
'use strict';

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

async function api(path, opts = {}) {
  const res = await fetch(path, {
    headers: { 'Content-Type': 'application/json' },
    ...opts,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  let data = null;
  try { data = await res.json(); } catch { /* non-json */ }
  return { ok: res.ok, status: res.status, data };
}

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

function fmtNum(n) { return Number(n || 0).toLocaleString('en-US'); }

function timeAgo(ts) {
  if (!ts) return 'never';
  const s = Math.max(1, Math.floor((Date.now() - ts) / 1000));
  if (s < 60) return 'just now';
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  const mo = Math.floor(d / 30);
  if (mo < 12) return `${mo}mo ago`;
  return new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function fmtDate(ts) {
  return new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function initials(name) {
  return String(name || '?').trim().split(/\s+/).slice(0, 2).map((p) => p[0]).join('').toUpperCase();
}

const AVATAR_TONES = ['', 'mint', 'sage', 'clay'];
function avatarTone(idOrName) {
  let h = 0;
  for (const ch of String(idOrName || '')) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return AVATAR_TONES[h % AVATAR_TONES.length];
}

/* ----------------------------------- icons ---------------------------------- */
/* Inline stroke icon set (24×24, currentColor). Usage: icon('wave', 'cls') */

const ICONS = {
  wave: '<path d="M7 15a4 4 0 0 1 0-6"/><path d="M10 17.5a7.5 7.5 0 0 1 0-11"/><path d="M13 20a11 11 0 0 1 0-16"/><circle cx="4" cy="12" r="1" fill="currentColor" stroke="none"/>',
  spark: '<path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M18.4 5.6l-2.1 2.1M7.7 16.3l-2.1 2.1"/>',
  dash: '<rect x="3" y="3" width="8" height="8" rx="2.5"/><rect x="13" y="3" width="8" height="5" rx="2"/><rect x="13" y="10" width="8" height="11" rx="2.5"/><rect x="3" y="13" width="8" height="8" rx="2.5"/>',
  users: '<circle cx="9" cy="8" r="3.2"/><path d="M3.5 19c.6-3 2.8-4.6 5.5-4.6S13.9 16 14.5 19"/><path d="M15.5 5.4a3.2 3.2 0 0 1 0 5.7M17.5 14.7c1.7.7 2.8 2 3 4.3"/>',
  gift: '<rect x="3.5" y="8" width="17" height="4" rx="1.5"/><path d="M5.5 12v6.5A1.5 1.5 0 0 0 7 20h10a1.5 1.5 0 0 0 1.5-1.5V12M12 8v12M12 8s-1-4.2-3.8-4.2a1.9 1.9 0 0 0-.4 3.8M12 8s1-4.2 3.8-4.2a1.9 1.9 0 0 1 .4 3.8"/>',
  card: '<rect x="2.5" y="5" width="19" height="14" rx="3"/><path d="M2.5 9.5h19M6 15h4"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M12 2.8v2.4M12 18.8v2.4M2.8 12h2.4M18.8 12h2.4M5 5l1.7 1.7M17.3 17.3 19 19M19 5l-1.7 1.7M6.7 17.3 5 19"/>',
  scan: '<path d="M3.5 7.5V5.5a2 2 0 0 1 2-2h2M14.5 3.5h2a2 2 0 0 1 2 2v2M20.5 14.5v2a2 2 0 0 1-2 2h-2M9.5 20.5h-2a2 2 0 0 1-2-2v-2M4 12h16"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  search: '<circle cx="11" cy="11" r="6.5"/><path d="m20.5 20.5-4.6-4.6"/>',
  leave: '<path d="M14 4h4.5A1.5 1.5 0 0 1 20 5.5v13a1.5 1.5 0 0 1-1.5 1.5H14M10 8l-4 4 4 4M6 12h10"/>',
  check: '<path d="m4.5 12.5 5 5 10-11"/>',
  x: '<path d="M6 6l12 12M18 6 6 18"/>',
  clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
  bolt: '<path d="M13 2.5 4.5 13.5H11l-.5 8L19 10.5h-6.5l.5-8Z"/>',
  shield: '<path d="M12 2.8 4.5 5.8v6c0 4.6 3.2 7.6 7.5 9.4 4.3-1.8 7.5-4.8 7.5-9.4v-6L12 2.8Z"/><path d="m8.8 12 2.2 2.2 4.2-4.4"/>',
  edit: '<path d="M4 20h4.5L20 8.5a2.1 2.1 0 0 0-3-3L5.5 17 4 20Z"/><path d="m14.5 8 2.5 2.5"/>',
  trash: '<path d="M4.5 7h15M9.5 7V5a1.5 1.5 0 0 1 1.5-1.5h2a1.5 1.5 0 0 1 1.5 1.5v2M6.5 7l1 12a1.6 1.6 0 0 0 1.6 1.5h5.8a1.6 1.6 0 0 0 1.6-1.5l1-12"/><path d="M10 11v6M14 11v6"/>',
  link: '<path d="M10 14a4.5 4.5 0 0 0 6.4.4l2.6-2.6a4.5 4.5 0 0 0-6.4-6.4l-1.4 1.4M14 10a4.5 4.5 0 0 0-6.4-.4L5 12.2a4.5 4.5 0 0 0 6.4 6.4l1.4-1.4"/>',
  copy: '<rect x="9" y="9" width="11.5" height="11.5" rx="2.5"/><path d="M5.5 15H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v.5"/>',
  external: '<path d="M14 4h6v6M20 4 11 13M9 5H6.5A2.5 2.5 0 0 0 4 7.5v10A2.5 2.5 0 0 0 6.5 20h10a2.5 2.5 0 0 0 2.5-2.5V15"/>',
  trend: '<path d="m3 17 6-6 4 4 8-8.5"/><path d="M15 6.5h6v6"/>',
  award: '<circle cx="12" cy="9" r="5.5"/><path d="m8.8 13.5-1.8 7 5-2.8 5 2.8-1.8-7"/>',
  star: '<path d="m12 3.5 2.6 5.4 5.9.8-4.3 4.1 1 5.9-5.2-2.8-5.2 2.8 1-5.9L3.5 9.7l5.9-.8L12 3.5Z"/>',
  menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
  phone: '<rect x="7" y="2.5" width="10" height="19" rx="3"/><path d="M11 18.5h2"/>',
  info: '<circle cx="12" cy="12" r="8.5"/><path d="M12 11v5"/><circle cx="12" cy="8" r=".8" fill="currentColor" stroke="none"/>',
  warn: '<path d="M12 3.5 2.5 20h19L12 3.5Z"/><path d="M12 9.5V14"/><circle cx="12" cy="17" r=".8" fill="currentColor" stroke="none"/>',
  chevR: '<path d="m9 6 6 6-6 6"/>',
  chevL: '<path d="m15 6-6 6 6 6"/>',
  arrows: '<path d="M7 4 3.5 7.5 7 11M3.5 7.5H17M17 13l3.5 3.5L17 20M20.5 16.5H7"/>',
  eye: '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z"/><circle cx="12" cy="12" r="3"/>',
  refresh: '<path d="M20 5v5h-5"/><path d="M4 19v-5h5"/><path d="M5.6 9a7 7 0 0 1 12.7-2L20 9M4 15l1.7 2A7 7 0 0 0 18.4 15"/>',
  wallet: '<path d="M3.5 7A2.5 2.5 0 0 1 6 4.5h11.5v3"/><path d="M3.5 7v10A2.5 2.5 0 0 0 6 19.5h13a1.5 1.5 0 0 0 1.5-1.5v-8A1.5 1.5 0 0 0 19 8.5H6A2.5 2.5 0 0 1 3.5 7Z"/><circle cx="16" cy="14" r="1.1" fill="currentColor" stroke="none"/>',
  tapCard: '<rect x="2.5" y="5.5" width="13" height="13" rx="3"/><path d="M19 9a4.5 4.5 0 0 1 0 6M16.7 7.3a7.5 7.5 0 0 1 0 9.4"/>',
  espresso: '<path d="M4.5 9.5h11V14a5 5 0 0 1-5 5h-1a5 5 0 0 1-5-5V9.5Z"/><path d="M15.5 10.5h1.6a2.4 2.4 0 0 1 0 4.8h-1.8M6.5 6.5c0-1.2 1-1.3 1-2.4M10 6.5c0-1.2 1-1.3 1-2.4"/>',
  pastry: '<path d="M12 5.5c-4.7 0-8.5 2.7-8.5 6.3 0 1.5 1 2.9 2.5 3.7v1.5a1.5 1.5 0 0 0 1.5 1.5h9a1.5 1.5 0 0 0 1.5-1.5v-1.5c1.5-.8 2.5-2.2 2.5-3.7 0-3.6-3.8-6.3-8.5-6.3Z"/><path d="M9 11.5v1M12 11v1.5M15 11.5v1"/>',
  latte: '<path d="M6 8.5h9l-1.2 9.6a2 2 0 0 1-2 1.9h-2.6a2 2 0 0 1-2-1.9L6 8.5Z"/><path d="M5.5 5.5h10M15 8.5l3.5-2M8 12.5h5"/>',
  beans: '<ellipse cx="9" cy="9.5" rx="4.5" ry="5.5" transform="rotate(-18 9 9.5)"/><path d="M7.5 5c2.6 2 3 6.8 1 9"/><ellipse cx="15.4" cy="14.6" rx="4.2" ry="5.2" transform="rotate(14 15.4 14.6)"/><path d="M13.8 10.4c2.4 1.9 2.8 6.3.8 8.4"/>',
  tote: '<path d="M5.5 8h13l-1 12h-11l-1-12Z"/><path d="M9 10.5V6.8a3 3 0 0 1 6 0v3.7"/>',
  cupping: '<path d="M4 11h16M5.5 11c0 4 2.9 7.5 6.5 7.5s6.5-3.5 6.5-7.5"/><path d="M12 18.5v2M8.5 21h7"/><path d="M12 4c-1.2-.8-1.2-1.7 0-2.5"/>',
  coldbrew: '<path d="M7 3.5h10l-1.3 15.2a2 2 0 0 1-2 1.8h-3.4a2 2 0 0 1-2-1.8L7 3.5Z"/><path d="M8.3 9.5h7.4M12 9.5l-.7 8"/>',
  ticket: '<path d="M3.5 9a1.5 1.5 0 0 1 0 6v3a1.5 1.5 0 0 0 1.5 1.5h14a1.5 1.5 0 0 0 1.5-1.5v-3a1.5 1.5 0 0 1 0-6V6A1.5 1.5 0 0 0 19 4.5H5A1.5 1.5 0 0 0 3.5 6v3Z"/><path d="M14 5v2M14 11v2M14 17v2"/>',
};

function icon(name, cls = '') {
  const path = ICONS[name] || ICONS.spark;
  return `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${path}</svg>`;
}

const BRAND_SVG = `<svg viewBox="0 0 24 24" fill="none" stroke="#221a08" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 15a4 4 0 0 1 0-6"/><path d="M10 17.5a7.5 7.5 0 0 1 0-11"/><path d="M13 20a11 11 0 0 1 0-16"/><circle cx="4" cy="12" r="1.2" fill="#221a08" stroke="none"/></svg>`;

/* ---------------------------------- toasts ---------------------------------- */

function ensureToastRoot() {
  let root = $('.toast-root');
  if (!root) { root = document.createElement('div'); root.className = 'toast-root'; document.body.appendChild(root); }
  return root;
}

function toast(msg, isErr = false) {
  const el = document.createElement('div');
  el.className = 'toast' + (isErr ? ' err' : '');
  el.innerHTML = `${icon(isErr ? 'warn' : 'check')}<span>${escapeHtml(msg)}</span>`;
  ensureToastRoot().appendChild(el);
  setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 350); }, 3200);
}

/* ------------------------------ count-up number ------------------------------ */

function countUp(el, to, { duration = 1100, prefix = '', suffix = '' } = {}) {
  const start = performance.now();
  const from = 0;
  function frame(now) {
    const t = Math.min(1, (now - start) / duration);
    const eased = 1 - Math.pow(1 - t, 3);
    el.textContent = prefix + fmtNum(Math.round(from + (to - from) * eased)) + suffix;
    if (t < 1) requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

/* -------------------------------- modal helper ------------------------------- */

function openModal(overlay) {
  overlay.classList.add('open');
  document.body.style.overflow = 'hidden';
}
function closeModal(overlay) {
  overlay.classList.remove('open');
  document.body.style.overflow = '';
  const first = overlay.querySelector('input, textarea');
  if (first) first.value = '';
}
function wireModal(overlay, onOpen) {
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay || e.target.closest('[data-close]')) closeModal(overlay);
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeModal(overlay); });
  return {
    open() { onOpen && onOpen(); openModal(overlay); },
    close: () => closeModal(overlay),
  };
}

/* ------------------------------ reveal on scroll ----------------------------- */

function observeReveals() {
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); }
  }, { threshold: 0.12 });
  $$('.reveal').forEach((el, i) => {
    el.style.setProperty('--d', `${(i % 4) * 0.08}s`);
    io.observe(el);
  });
}

/* --------------------------------- confetti ---------------------------------- */

function confettiBurst(opts = {}) {
  const canvas = document.getElementById('confetti');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  canvas.width = innerWidth * dpr;
  canvas.height = innerHeight * dpr;
  const COLORS = ['#c9a24b', '#e8cc84', '#7dd6b0', '#f4f0e6', '#1e4d3b'];
  const cx = canvas.width / 2;
  const cy = canvas.height * (opts.y || 0.42);
  const parts = Array.from({ length: 130 }, () => {
    const a = Math.random() * Math.PI * 2;
    const v = (Math.random() * 0.8 + 0.5) * 11 * dpr;
    return {
      x: cx, y: cy,
      vx: Math.cos(a) * v,
      vy: Math.sin(a) * v - 5 * dpr,
      w: (Math.random() * 6 + 4) * dpr,
      h: (Math.random() * 3 + 2) * dpr,
      color: COLORS[(Math.random() * COLORS.length) | 0],
      rot: Math.random() * Math.PI,
      vr: (Math.random() - 0.5) * 0.3,
      life: 1,
      decay: 0.006 + Math.random() * 0.008,
      round: Math.random() > 0.6,
    };
  });
  let raf;
  function tick() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    let alive = false;
    for (const p of parts) {
      if (p.life <= 0) continue;
      alive = true;
      p.x += p.vx; p.y += p.vy;
      p.vy += 0.26 * dpr; p.vx *= 0.985;
      p.rot += p.vr; p.life -= p.decay;
      ctx.save();
      ctx.globalAlpha = Math.max(0, Math.min(1, p.life * 1.4));
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.fillStyle = p.color;
      if (p.round) { ctx.beginPath(); ctx.arc(0, 0, p.w / 2, 0, Math.PI * 2); ctx.fill(); }
      else ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
      ctx.restore();
    }
    if (alive) raf = requestAnimationFrame(tick);
    else { cancelAnimationFrame(raf); ctx.clearRect(0, 0, canvas.width, canvas.height); }
  }
  tick();
}

/* ------------------------------- time formatting ------------------------------ */

function fmtCountdown(ms) {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) return `${h}h ${String(m).padStart(2, '0')}m`;
  if (m > 0) return `${m}m ${String(s).padStart(2, '0')}s`;
  return `${s}s`;
}
