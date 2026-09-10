/* Taployal — landing page behaviour. */
'use strict';

/* nav background on scroll */
const nav = $('#nav');
const onScroll = () => nav.classList.toggle('scrolled', window.scrollY > 24);
window.addEventListener('scroll', onScroll, { passive: true });
onScroll();

/* seamless marquee: duplicate the track until it can loop 50 % */
const track = $('#marquee');
track.innerHTML += track.innerHTML;
track.innerHTML += track.innerHTML;

/* feature grid */
const FEATURES = [
  { icon: 'bolt',    title: 'Instant enrolment',    text: 'A first tap is all it takes. Name and email on one screen — the customer is a member before their order is ready.' },
  { icon: 'shield',  title: 'Fraud-safe cooldowns', text: 'One earning tap per visit window. Repeat tapping, tag sharing and time-travel all quietly neutralised.' },
  { icon: 'award',   title: 'Tier engine',          text: 'Member, Gold, Reserve — or your own ladder. Customers see exactly how far they are from the next unlock.' },
  { icon: 'scan',    title: 'Tag registry',         text: 'Every NFC sticker is tracked: linked member, status, live earn link. Void a lost tag in one click.' },
  { icon: 'trend',   title: 'Real-time analytics',  text: 'Taps, joins and redemptions stream into the dashboard the moment they happen on the shop floor.' },
  { icon: 'phone',   title: 'No app required',      text: 'The tag opens a web experience. No downloads, no accounts, nothing between your customer and their points.' },
];
$('#featureGrid').innerHTML = FEATURES.map((f, i) => `
  <div class="feature reveal" style="--d:${(i % 3) * 0.08}s">
    <span class="fic">${icon(f.icon)}</span>
    <h3>${escapeHtml(f.title)}</h3>
    <p>${escapeHtml(f.text)}</p>
  </div>`).join('');

/* live demo stats */
(async () => {
  const { ok, data } = await api('/api/public/stats');
  if (!ok) return;
  $$('.stats-band [data-stat]').forEach((el) => {
    const key = el.dataset.stat;
    countUp(el, data[key] || 0, { duration: 1400 });
  });
  if (data.businessName) $('#demoBiz').textContent = data.businessName;
})();

/* phone mock: gently tick the sample balance */
(() => {
  const amt = $('#phonePoints');
  let v = 785;
  setInterval(() => {
    v += 10;
    amt.textContent = fmtNum(v);
    amt.animate(
      [{ transform: 'translateY(-6px)', opacity: 0 }, { transform: 'none', opacity: 1 }],
      { duration: 450, easing: 'cubic-bezier(.22,1,.36,1)' }
    );
  }, 3600);
})();

/* simulate a real customer tap */
async function simulateTap() {
  const { ok, data } = await api('/api/public/sample-tap');
  if (!ok || !data.uid) { toast('No demo tag available', true); return; }
  window.location.href = `/tap/${encodeURIComponent(data.uid)}`;
}
$('#simTapBtn').addEventListener('click', simulateTap);
$('#simTapBtn2').addEventListener('click', simulateTap);

$('#year').textContent = new Date().getFullYear();
observeReveals();
