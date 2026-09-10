/* Taployal — the customer wallet. */
'use strict';

const uid = decodeURIComponent(
  (location.pathname.match(/\/(?:wallet|card)\/(.+)$/) || [])[1] || ''
).split('?')[0];

let wallet = null;

(async function init() {
  if (!uid) return showEmpty('Broken link.', 'The wallet link looks incomplete.');
  const res = await api(`/api/wallet/${encodeURIComponent(uid)}`);
  if (!res.ok) {
    return showEmpty('This tag isn’t live.', res.data?.error === 'void'
      ? 'This tag was retired — ask for a fresh one at the counter.'
      : 'It hasn’t been registered yet. Ask a team member.');
  }
  const d = res.data;
  if (d.state === 'unassigned') {
    $('#weAction').href = `/tap/${encodeURIComponent(uid)}`;
    return showEmpty('Nothing here yet.', 'This tag hasn’t been claimed — tap it to join and grab your welcome bonus.');
  }
  wallet = d;
  render();
})();

function showEmpty(title, sub) {
  $('#weTitle').textContent = title;
  $('#weSub').textContent = sub;
  $('#walletEmpty').hidden = false;
}

function tierProgress(c) {
  if (!c.nextTier) return { pct: 100, label: 'Highest tier — nicely done' };
  const span = c.nextTier.minLifetime - c.tier.minLifetime;
  const done = c.lifetimePoints - c.tier.minLifetime;
  return {
    pct: Math.max(3, Math.min(100, (done / span) * 100)),
    label: `${fmtNum(c.nextTier.minLifetime - c.lifetimePoints)} pts to ${c.nextTier.name}`,
  };
}

function render() {
  const { customer: c, rewards, activity, settings } = wallet;
  $('#walletWrap').hidden = false;
  document.title = `${c.name.split(' ')[0]}’s wallet · ${settings.businessName}`;

  $('#walletBiz').textContent = settings.businessName;
  $('#mcBiz').textContent = settings.businessName.toUpperCase();
  $('#mcSub').textContent = (wallet.settings.tagline || 'member wallet').toLowerCase();
  document.getElementById('walletTagline').textContent = 'member wallet';

  countUp($('#mcPoints'), c.points, { duration: 1300 });
  $('#mcName').textContent = c.name;
  $('#mcUid').textContent = uid;
  $('#mcTier').textContent = c.tier.name;
  $('#footPPV').textContent = settings.pointsPerVisit;

  const p = tierProgress(c);
  $('#pgNow').innerHTML = `<b>${escapeHtml(c.tier.name)}</b> · ${fmtNum(c.lifetimePoints)} lifetime`;
  $('#pgNext').textContent = p.label;
  requestAnimationFrame(() => requestAnimationFrame(() => { $('#pgFill').style.width = `${p.pct}%`; }));

  renderRewards(rewards, c.points);
  renderActivity(activity);

  $('#memberCard').animate(
    [{ transform: 'translateY(18px)', opacity: 0 }, { transform: 'none', opacity: 1 }],
    { duration: 700, easing: 'cubic-bezier(.22,1,.36,1)' }
  );
}

function renderRewards(rewards, balance) {
  const affordable = rewards.filter((r) => r.cost <= balance && (r.stock === null || r.stock > 0)).length;
  $('#rewardCount').textContent = affordable ? `${affordable} within reach` : '';
  $('#rewardList').innerHTML = rewards.length ? rewards.map((r) => {
    const outOfStock = r.stock !== null && r.stock <= 0;
    const afford = r.cost <= balance && !outOfStock;
    return `
      <div class="w-reward">
        <span class="reward-icon">${iconSafe(r.icon)}</span>
        <div class="info">
          <b>${escapeHtml(r.title)}</b>
          <span>${escapeHtml(r.description || '')}</span>
        </div>
        <span class="cost">${fmtNum(r.cost)}</span>
        <button class="redeem-btn" data-rid="${r.id}" ${afford ? '' : 'disabled'}>
          ${outOfStock ? 'Gone' : afford ? 'Redeem' : 'Not yet'}
        </button>
      </div>`;
  }).join('') : `<div class="empty">No rewards live right now — check back soon.</div>`;
}

function iconSafe(name) {
  const path = ICONS[name] || ICONS.gift;
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${path}</svg>`;
}

function renderActivity(activity) {
  $('#activityList').innerHTML = activity.length ? activity.map((a) => {
    const plus = a.pointsDelta > 0;
    const ico = a.type === 'redeem' ? 'gift' : a.type === 'join' ? 'star' : a.type === 'adjust' ? 'arrows' : 'wave';
    return `
      <div class="w-act">
        <span class="a-ic">${iconSafe(ico)}</span>
        <span class="a-tx">${escapeHtml(a.label)}</span>
        ${a.pointsDelta ? `<span class="a-pt ${plus ? 'plus' : 'minus'}">${plus ? '+' : ''}${fmtNum(a.pointsDelta)}</span>` : ''}
        <span class="a-when">${timeAgo(a.ts)}</span>
      </div>`;
  }).join('') : `<div class="empty">Your taps and redemptions will live here.</div>`;
}

/* ------------------------------- redemption ------------------------------- */

const redeemModal = wireModal($('#redeemModal'));
const voucherModal = wireModal($('#voucherModal'));
let pendingReward = null;

$('#rewardList').addEventListener('click', (e) => {
  const btn = e.target.closest('[data-rid]');
  if (!btn || btn.disabled) return;
  pendingReward = wallet.rewards.find((r) => r.id === btn.dataset.rid);
  if (!pendingReward) return;
  $('#rdText').textContent = `“${pendingReward.title}” costs ${fmtNum(pendingReward.cost)} points. You’ll have ${fmtNum(wallet.customer.points - pendingReward.cost)} left.`;
  redeemModal.open();
});

$('#rdGo').addEventListener('click', async () => {
  if (!pendingReward) return;
  redeemModal.close();
  const res = await api('/api/redeem', {
    method: 'POST',
    body: { uid, rewardId: pendingReward.id },
  });
  const d = res.data || {};
  if (d.status !== 'ok') {
    const msg = {
      insufficient: 'Not enough points yet — keep tapping.',
      out_of_stock: 'That one just sold out.',
      inactive: 'That reward is no longer live.',
    }[d.status] || 'Something went sideways — try again.';
    return toast(msg, true);
  }

  // refresh local state
  wallet.customer.points = d.balance;
  const r = wallet.rewards.find((x) => x.id === pendingReward.id);
  if (r && r.stock !== null) r.stock -= 1;
  $('#mcPoints').textContent = fmtNum(d.balance);
  renderRewards(wallet.rewards, d.balance);

  wallet.activity.unshift({
    ts: Date.now(), type: 'redeem', pointsDelta: -pendingReward.cost,
    label: `Redeemed “${pendingReward.title}” (−${fmtNum(pendingReward.cost)} pts)`,
  });
  renderActivity(wallet.activity.slice(0, 12));

  $('#vcSub').textContent = `“${d.redemption.title}” is paid for with points.`;
  $('#vcCode').textContent = d.redemption.code;
  $('#vcMeta').textContent = `${d.redemption.title} · ${fmtNum(d.redemption.cost)} pts`;
  countUp($('#vcBalance'), d.balance);
  voucherModal.open();
  confettiBurst({ y: 0.45 });
  pendingReward = null;
});
