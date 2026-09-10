/* Taployal — the tap experience. Opening this URL *is* the physical tap. */
'use strict';

const uid = decodeURIComponent(location.pathname.split('/tap/')[1] || '').split('?')[0];

const STATES = ['loading', 'earned', 'cooldown', 'join', 'joined', 'error'];
function show(state) {
  STATES.forEach((s) => $(`#st-${s}`).classList.toggle('on', s === state));
}

function setBiz(name) {
  [1, 2, 3, 4].forEach((i) => { const el = $(`#bizName${i}`); if (el) el.textContent = name; });
}

(async function init() {
  // business name for the header mark (best effort)
  api('/api/bootstrap').then(({ ok, data }) => {
    if (ok) {
      setBiz(data.businessName);
      document.title = `Earning points… · ${data.businessName}`;
      $('#joinBonus').textContent = data.welcomeBonus;
    }
  });

  if (!uid) return fail('Nothing to read.', 'This link looks incomplete — try tapping the tag again.');

  // Let the emblem breathe for a beat so the moment feels physical.
  await new Promise((r) => setTimeout(r, 900));

  const res = await api('/api/tap', { method: 'POST', body: { uid } });
  const d = res.data || {};

  switch (d.status) {
    case 'earned': return renderEarned(d);
    case 'cooldown': return renderCooldown(d);
    case 'unassigned': return showJoin();
    case 'void': return fail('This tag was retired.', 'A team member voided this tag — grab a fresh one at the counter.');
    case 'unknown_card':
    default: return fail('This tag isn’t live.', 'It hasn’t been registered yet — ask a team member.');
  }
})();

function tierProgress(customer) {
  const { tier, nextTier, lifetimePoints } = customer;
  if (!nextTier) return { pct: 100, label: 'Top tier reached' };
  const span = nextTier.minLifetime - tier.minLifetime;
  const done = lifetimePoints - tier.minLifetime;
  return {
    pct: Math.max(4, Math.min(100, (done / span) * 100)),
    label: `${fmtNum(nextTier.minLifetime - lifetimePoints)} to ${nextTier.name}`,
  };
}

function renderEarned(d) {
  const c = d.customer;
  show('earned');
  $('#earnName').textContent = c.name.split(' ')[0];
  $('#earnPts').textContent = d.awarded;
  $('#earnWallet').href = `/wallet/${encodeURIComponent(uid)}`;
  countUp($('#earnBalance'), c.points);
  countUp($('#earnVisits'), c.visits);
  $('#earnTier').textContent = c.tier.name;

  const p = tierProgress(c);
  $('#tierNow').textContent = c.tier.name;
  $('#tierNextLabel').textContent = p.label;
  requestAnimationFrame(() => requestAnimationFrame(() => { $('#tierFill').style.width = `${p.pct}%`; }));

  if (d.tierUp) {
    $('#tierUpBanner').innerHTML = `
      <div style="margin-top:18px;padding:14px;border-radius:14px;background:rgba(125,214,176,.08);border:1px solid rgba(125,214,176,.35)">
        <b style="color:var(--mint)">${iconInline('award')} ${escapeHtml(d.tierUp.name)} unlocked</b>
        <div style="font-size:12.5px;color:var(--text-mid);margin-top:4px">${escapeHtml(d.tierUp.perk || '')}</div>
      </div>`;
  }
  confettiBurst({ y: 0.38 });
}

function renderCooldown(d) {
  const c = d.customer;
  show('cooldown');
  $('#coolName').textContent = c.name.split(' ')[0];
  $('#coolWallet').href = `/wallet/${encodeURIComponent(uid)}`;
  countUp($('#coolBalance'), c.points);
  countUp($('#coolVisits'), c.visits);
  $('#coolTier').textContent = c.tier.name;

  let remaining = d.waitMs || 0;
  const el = $('#coolTimer');
  const tick = () => {
    remaining -= 1000;
    el.textContent = fmtCountdown(remaining);
    if (remaining > 0) setTimeout(tick, 1000);
  };
  tick();
}

function showJoin() {
  show('join');
  setTimeout(() => $('#jName').focus(), 400);
}

$('#joinForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = $('#jBtn');
  btn.disabled = true; btn.textContent = 'Joining…';
  const res = await api('/api/join', {
    method: 'POST',
    body: { uid, name: $('#jName').value, email: $('#jEmail').value },
  });
  btn.disabled = false; btn.textContent = 'Join & claim points';
  const d = res.data || {};

  if (d.status === 'joined' || d.status === 'linked') {
    show('joined');
    $('#joinedTitle').textContent = d.status === 'joined' ? `Welcome, ${d.customer.name.split(' ')[0]}.` : 'Welcome back.';
    $('#joinedSub').textContent = d.status === 'joined'
      ? `${d.welcomeBonus} bonus points, already in your wallet.`
      : 'This tag is now linked to your existing membership.';
    countUp($('#joinedBalance'), d.customer.points);
    $('#joinedWallet').href = `/wallet/${encodeURIComponent(uid)}`;
    confettiBurst({ y: 0.4 });
  } else if (d.status === 'invalid') {
    toast(d.message || 'Check your details and try again', true);
  } else if (d.status === 'taken') {
    fail('Tag already claimed.', 'This tag belongs to someone else — grab a fresh one at the counter.');
  } else {
    fail('This tag isn’t live.', 'Ask a team member — they’ll sort it in a moment.');
  }
});

function fail(title, sub) {
  $('#errTitle').textContent = title;
  $('#errSub').textContent = sub;
  show('error');
}

function iconInline(name) {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" style="width:14px;height:14px;vertical-align:-2px">${ICONS[name] || ''}</svg>`;
}
