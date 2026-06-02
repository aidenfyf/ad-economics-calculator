/* ============================================================
   Ad Constraint Calculator — AI Agency Ad Economics
   One metric matters: Lifetime Gross Profit to CAC.
   Six levers move it. The engine finds the single lever whose
   move-to-target lifts LGP:CAC most — that's your constraint.
   Diagnosis + playbooks distilled from the profit-first
   growth-partner framework. Rule-based, math-only.
   ============================================================ */

// ---- Slider definitions ----
// `good` = healthy zone (glows green). `start` = generic placeholder (below target).
const SLIDERS = [
  { id: 'cpqbc',     label: 'CPQBC',        sub: 'Cost Per Qualified Booked Call', min: 50,  max: 1000, step: 5,  start: 450, fmt: 'usd', goal: 'Goal ≤ $350',  good: v => v <= 350 },
  { id: 'showRate',  label: 'Show Rate',    sub: '',                               min: 0,   max: 100,  step: 1,  start: 60,  fmt: 'pct', goal: 'Goal ≥ 70%',   good: v => v >= 70  },
  { id: 'closeRate', label: 'Close Rate',   sub: '',                               min: 0,   max: 100,  step: 1,  start: 15,  fmt: 'pct', goal: 'Goal ≥ 25%',   good: v => v >= 25  },
  { id: 'churnRate', label: 'Churn Rate',   sub: 'Monthly. Lower keeps clients',   min: 1,   max: 50,   step: 1,  start: 12,  fmt: 'pct', goal: 'Goal ≤ 10%',   good: v => v <= 10  },
  { id: 'cogs',      label: 'Monthly COGS', sub: 'Delivery Cost per client',       min: 0,   max: 3000, step: 10, start: 500, fmt: 'usd', goal: '',             good: () => false   },
  { id: 'calls',     label: 'Booked Calls', sub: 'Per month. Your volume lever',   min: 1,   max: 200,  step: 1,  start: 20,  fmt: 'num', goal: '',             good: () => false   },
];

const OFFER_KEYS = ['price', 'minTerm', 'upfront', 'targetRatio'];
const OFFER_START = { price: 3000, minTerm: 3, upfront: 40, targetRatio: 10 };

const DEFAULTS = {
  sliders: Object.fromEntries(SLIDERS.map(s => [s.id, s.start])),
  offer: { ...OFFER_START },
};

const STORE_KEY = 'aec_v3';

// ---------------- live state ----------------
let state = { ...DEFAULTS.sliders };
let OFFER = { ...DEFAULTS.offer };

// ---------------- persistence ----------------
function persist() {
  try { localStorage.setItem(STORE_KEY, JSON.stringify({ state, OFFER })); } catch (e) {}
}
function loadFromStorage() {
  try {
    const d = JSON.parse(localStorage.getItem(STORE_KEY) || 'null');
    if (d && d.state) state = { ...DEFAULTS.sliders, ...d.state };
    if (d && d.OFFER) OFFER = { ...DEFAULTS.offer, ...d.OFFER };
  } catch (e) {}
}
function loadFromUrl() {
  const p = new URLSearchParams(location.search);
  let used = false;
  SLIDERS.forEach(s => { if (p.has(s.id)) { const v = Number(p.get(s.id)); if (!isNaN(v)) { state[s.id] = clamp(s, v); used = true; } } });
  OFFER_KEYS.forEach(k => { if (p.has(k)) { const v = Number(p.get(k)); if (!isNaN(v) && v > 0) { OFFER[k] = v; used = true; } } });
  return used;
}
const clamp = (s, v) => Math.min(s.max, Math.max(s.min, v));

// ---------------- formatting ----------------
const usd  = n => '$' + Math.round(n).toLocaleString('en-US');
const pct  = n => n.toFixed(1) + '%';
const num1 = n => n.toFixed(1);
const x2   = n => n.toFixed(2) + 'x';
const ratio = n => n.toFixed(1) + ':1';
const fmtSlider = (s, v) => s.fmt === 'usd' ? usd(v) : s.fmt === 'pct' ? v + '%' : String(v);

// ============================================================
//  THE MODEL — computeFrom(state, offer) is pure so the engine
//  can run hypothetical scenarios on copies of the inputs.
// ============================================================
function computeFrom(st, of) {
  const show = st.showRate / 100, close = st.closeRate / 100, churn = st.churnRate / 100;
  const closeProb = show * close;
  const clients   = st.calls * closeProb;
  const adSpend   = st.calls * st.cpqbc;
  const cac       = closeProb > 0 ? st.cpqbc / closeProb : Infinity;
  const retention = 1 / churn;

  // AOV = upfront cash collected per new client = contract value × upfront%
  const contractValue = of.price * of.minTerm;
  const aov           = contractValue * (of.upfront / 100);
  const dayOneRoas    = isFinite(cac) && cac > 0 ? aov / cac : 0;

  const monthlyRevenue = clients * of.price;
  const monthlyCogs    = clients * st.cogs;
  const netProfit      = monthlyRevenue - monthlyCogs - adSpend;
  const monthlyRoas    = adSpend > 0 ? monthlyRevenue / adSpend : 0;

  const lifetimeRevenue = of.price * retention;
  const lgp             = (of.price - st.cogs) * retention;
  const profitPerClient = lgp - cac;
  const grossMargin     = of.price > 0 ? (of.price - st.cogs) / of.price : 0;
  const profitMargin    = lifetimeRevenue > 0 ? profitPerClient / lifetimeRevenue : 0;
  const lgpCac          = isFinite(cac) && cac > 0 ? lgp / cac : 0;
  const recPrice        = of.targetRatio * cac / retention + st.cogs;

  return { cac, lgpCac, retention, aov, dayOneRoas, lgp, profitPerClient, grossMargin,
           profitMargin, clients, adSpend, monthlyRevenue, monthlyCogs, netProfit,
           monthlyRoas, recPrice, contractValue };
}
const compute = () => computeFrom(state, OFFER);

// ============================================================
//  DIAGNOSIS ENGINE
//  Each lever has a target move (KPI benchmark or relative).
//  The binding constraint = the lever whose move lifts LGP:CAC
//  the most. "Always chase the next constraint."
// ============================================================
const round5 = n => Math.round(n / 5) * 5;

const LEVERS = [
  { key: 'cpqbc',     name: 'Acquisition Cost', side: 'Lower CAC',  label: 'CPQBC −25%',
    move: (st, of) => [{ ...st, cpqbc: Math.max(st.min ?? 50, round5(st.cpqbc * 0.75)) }, of] },
  { key: 'showRate',  name: 'Show Rate',        side: 'Lower CAC',  label: 'Show → 70%',
    move: (st, of) => [{ ...st, showRate: Math.max(st.showRate, 70) }, of] },
  { key: 'closeRate', name: 'Close Rate',       side: 'Lower CAC',  label: 'Close → 25%',
    move: (st, of) => [{ ...st, closeRate: Math.max(st.closeRate, 25) }, of] },
  { key: 'price',     name: 'Offer / Pricing',  side: 'Raise LTGP', label: 'Price +25%',
    move: (st, of) => [st, { ...of, price: Math.round(of.price * 1.25) }] },
  { key: 'cogs',      name: 'Delivery Margin',  side: 'Raise LTGP', label: 'COGS −25%',
    move: (st, of) => [{ ...st, cogs: Math.round(st.cogs * 0.75) }, of] },
  { key: 'churnRate', name: 'Retention / Churn',side: 'Raise LTGP', label: 'Churn → 10%',
    move: (st, of) => [{ ...st, churnRate: Math.min(st.churnRate, 10) }, of] },
];

function diagnose() {
  const base = compute().lgpCac;
  const rows = LEVERS.map(l => {
    const [st2, of2] = l.move(state, OFFER);
    const projected = computeFrom(st2, of2).lgpCac;
    return { key: l.key, name: l.name, side: l.side, label: l.label, projected, lift: projected - base };
  }).sort((a, b) => b.lift - a.lift);

  const top = rows[0];
  const healthy = base >= OFFER.targetRatio;
  const meaningful = top && top.lift > 0.05;

  let verdict;
  if (healthy || !meaningful) {
    verdict = { key: 'scale', name: 'Scalable Volume', healthy: true,
                next: meaningful ? top : null };
  } else {
    verdict = { key: top.key, name: top.name, healthy: false, top };
  }
  return { base, rows, verdict };
}

// ---------------- bottleneck copy (math-driven, blunt) ----------------
function bottleneckText(key, r, top) {
  const cac = usd(r.cac), lgpcac = ratio(r.lgpCac), proj = top ? ratio(top.projected) : '';
  switch (key) {
    case 'cpqbc':     return `Your acquisition is too expensive. At ${usd(state.cpqbc)} per booked call, CAC sits at ${cac}. Cheaper qualified calls is your fastest lever: drop CPQBC and LGP:CAC moves ${lgpcac} to ${proj}.`;
    case 'showRate':  return `You pay for booked calls, then lose them before they happen. A ${state.showRate}% show rate inflates your real cost per live call. Lift show to 70% and LGP:CAC moves ${lgpcac} to ${proj}.`;
    case 'closeRate': return `Your ads work and calls show. The sales process is where the money leaks. A ${state.closeRate}% close rate keeps CAC at ${cac}. Get close to 25% and LGP:CAC moves ${lgpcac} to ${proj}.`;
    case 'price':     return `You are undercharging for the CAC you carry. At ${usd(OFFER.price)}/mo your LGP:CAC is ${lgpcac}. Raising price drops straight to lifetime profit. Push it 25% and LGP:CAC moves to ${proj}.`;
    case 'cogs':      return `Your back end leaks profit. It costs ${usd(state.cogs)}/mo to deliver, so margin is thin. Cut cost-to-fulfill without dropping quality and LGP:CAC moves ${lgpcac} to ${proj}.`;
    case 'churnRate': return `Acquisition may be fine, but clients leave too fast. ${state.churnRate}% monthly churn means only ${num1(r.retention)} months of lifetime. Get churn to 10% and LGP:CAC moves ${lgpcac} to ${proj}.`;
    case 'scale':     return `Your unit economics are already strong at ${lgpcac}, above your ${OFFER.targetRatio}:1 target. The constraint is no longer profit, it's volume. Scale spend without breaking conversion, and keep chasing the next constraint.`;
    default:          return '';
  }
}

// ---------------- playbooks (3-step fixes from the calls) ----------------
const PLAYBOOKS = {
  closeRate: [
    { what: 'Put your closer on a 30-day sales sprint.', how: 'Weekly 1:1 with a sales coach; they attend every coaching call and drill the script until it’s second nature.', out: 'Close rate climbs toward 25%.' },
    { what: 'Audit every closed-lost call.', how: 'Review recordings, tag the objection that killed each deal, then rebuild discovery → pitch → proof → objection-handling around the top two.', out: 'A tighter pitch that converts shown calls.' },
    { what: 'Work the pipeline, not just new calls.', how: 'Each week re-engage every on-the-fence prospect from the last 30 days.', out: 'Extra closes with zero extra ad spend.' },
  ],
  showRate: [
    { what: 'Treat every new booking as a hot lead.', how: 'Call within 10–15 minutes of booking; if no answer, SMS from an iPhone (blue message), then WhatsApp a short confirm.', out: 'Show rate climbs toward 65–70%.' },
    { what: 'Fix the booking-to-call window.', how: 'Redirect to a strong thank-you page that pre-nurtures, then run a calendar-invite + reminder sequence.', out: 'Fewer no-shows on the day.' },
    { what: 'Get explicit buy-in.', how: 'Send a “are you 100% good for [time]?” message and get a yes before the call.', out: 'Higher-intent calls that actually show.' },
  ],
  cpqbc: [
    { what: 'Rebuild the creative.', how: 'New scripts (you review), UGC from the client or team, and an ICP call-out opener in the first 10 seconds.', out: 'Lower cost per qualified booked call.' },
    { what: 'Test an early CTA.', how: 'Add a light CTA in the first 5–10 seconds of the creative, right after the hook.', out: 'Higher CTR, cheaper calls.' },
    { what: 'Tighten the call-out.', how: 'Get specific on who you target (niche + revenue + situation) until the addressable market is about 30 to 50k, no smaller.', out: 'More qualified, cheaper calls. (Benchmark: about $100 unsaturated, $250 to $300 saturated.)' },
  ],
  price: [
    { what: 'Raise the price.', how: 'Keep the exact same sales process, just state the higher number. If you can charge X you can usually charge 1.25 to 2x it.', out: 'LGP:CAC jumps with no change to ads, funnel, or offer.' },
    { what: 'Raise AOV via commitment.', how: 'Pitch a 3 to 4 month commitment collected (partly) upfront instead of month-to-month.', out: 'Day-one cash ROAS toward 2x, so CAC is recouped faster.' },
    { what: 'Roll it out properly.', how: 'Apply new pricing to new clients first; grandfather or stagger existing ones.', out: 'Higher margin without a churn spike.' },
  ],
  cogs: [
    { what: 'Restructure fulfillment.', how: 'List every fixed cost, average it per client (cost ÷ clients-at-capacity), and find the lever.', out: 'Cost-to-fulfill drops toward an 80% gross margin.' },
    { what: 'Cut cost without cutting quality.', how: 'Cheaper labor/tools/process for the same outcome. If you truly can’t reduce without dropping quality, that’s your signal to raise price instead.', out: 'Margin restored.' },
    { what: 'Watch the model.', how: 'Avoid variable (white-label %-of-retainer) costs that rise with price; keep COGS fixed so price increases drop to profit.', out: 'Margin that scales.' },
  ],
  churnRate: [
    { what: 'Engineer a fast first win.', how: 'Define a first-win milestone and drive every new client to it in the first weeks.', out: 'Churn toward 10% (ideal 5%).' },
    { what: 'Install health scoring + a weekly cadence.', how: 'Score accounts, run a weekly check-in, and catch at-risk clients before they leave.', out: 'Longer retention = higher LTV.' },
    { what: 'Then raise price.', how: 'Once retention improves, test a price increase. A small churn drop can let CAC double safely.', out: 'LGP compounds.' },
  ],
  scale: [
    { what: 'Scale ad spend in steps.', how: 'Increase budget incrementally; expect CAC to rise ~30% per doubling but profit still compounds.', out: 'More clients at still-healthy economics.' },
    { what: 'Protect conversion as you scale.', how: 'Watch show and close rates weekly; don’t let volume degrade call quality.', out: 'Economics hold as spend grows.' },
    { what: 'Chase the next constraint.', how: 'Re-run this diagnosis monthly; whatever lever is now worst, fix it.', out: 'Continuous compounding.' },
  ],
};

// ---------------- formula rows ----------------
function formulaRows(r) {
  return [
    ['CAC', 'CPQBC ÷ Show Rate ÷ Close Rate', isFinite(r.cac) ? usd(r.cac) : '—'],
    ['Avg. Retention', '1 ÷ Churn Rate', num1(r.retention) + ' mo'],
    ['Lifetime Value', 'Monthly Price × Retention', usd(OFFER.price * r.retention)],
    ['Lifetime COGS', 'Monthly COGS × Retention', usd(state.cogs * r.retention)],
    ['Lifetime Gross Profit', '(Price − COGS) × Retention', usd(r.lgp)],
    ['AOV (upfront cash)', 'Price × Contract Months × Upfront %', usd(r.aov)],
    ['Day-One Cash ROAS', 'AOV ÷ CAC', x2(r.dayOneRoas)],
    ['LGP : CAC', 'Lifetime Gross Profit ÷ CAC', ratio(r.lgpCac)],
    ['Recommended Price', '(Target × CAC ÷ Retention) + COGS', usd(r.recPrice)],
  ];
}

// ============================================================
//  BUILD UI
// ============================================================
const sliderList = document.getElementById('sliderList');
SLIDERS.forEach(s => {
  const row = document.createElement('div');
  row.className = 'slider-row';
  row.innerHTML = `
    <div class="slider-top">
      <div class="slider-label">${s.label}${s.sub ? `<small>${s.sub}</small>` : ''}</div>
      <span class="slider-value" id="val-${s.id}"></span>
    </div>
    <div class="range-wrap"><input type="range" id="sl-${s.id}" min="${s.min}" max="${s.max}" step="${s.step}" /></div>
    ${s.goal ? `<div class="slider-goal" id="goal-${s.id}">${s.goal}</div>` : ''}`;
  sliderList.appendChild(row);
  row.querySelector(`#sl-${s.id}`).addEventListener('input', e => {
    state[s.id] = Number(e.target.value); paintSlider(s); render(); persist();
  });
});

function paintSlider(s) {
  const input = document.getElementById('sl-' + s.id);
  const valEl = document.getElementById('val-' + s.id);
  const v = state[s.id];
  input.value = v;
  const fillPct = ((v - s.min) / (s.max - s.min)) * 100;
  const healthy = s.good(v);
  input.style.setProperty('--fill', fillPct + '%');
  input.style.setProperty('--fill-color', healthy ? 'var(--pos)' : 'var(--accent)');
  valEl.textContent = fmtSlider(s, v);
  valEl.classList.toggle('good', healthy);
  const goalEl = document.getElementById('goal-' + s.id);
  if (goalEl) goalEl.classList.toggle('met', healthy);
}
const paintAllSliders = () => SLIDERS.forEach(paintSlider);

const offerEls = {
  price:       document.getElementById('priceInput'),
  minTerm:     document.getElementById('minTermInput'),
  upfront:     document.getElementById('upfrontInput'),
  targetRatio: document.getElementById('targetRatioInput'),
};
OFFER_KEYS.forEach(key => {
  offerEls[key].addEventListener('input', () => {
    const v = Number(offerEls[key].value);
    if (!isNaN(v) && v > 0) { OFFER[key] = v; render(); persist(); }
  });
});
const paintOffer = () => OFFER_KEYS.forEach(k => (offerEls[k].value = OFFER[k]));

// tabs
function activateTab(name) {
  const btn = document.querySelector(`.tab[data-tab="${name}"]`);
  if (!btn) return;
  document.querySelectorAll('.tab').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
  btn.classList.add('active');
  document.getElementById('panel-' + name).classList.add('active');
}
document.querySelectorAll('.tab').forEach(btn => {
  btn.addEventListener('click', () => activateTab(btn.dataset.tab));
});
if (location.hash) activateTab(location.hash.slice(1));

// buttons
document.getElementById('resetBtn').addEventListener('click', () => {
  state = { ...DEFAULTS.sliders }; OFFER = { ...DEFAULTS.offer };
  syncAll(); persist(); toast('Reset to default values');
});
document.getElementById('shareBtn').addEventListener('click', async () => {
  const p = new URLSearchParams();
  SLIDERS.forEach(s => p.set(s.id, state[s.id]));
  OFFER_KEYS.forEach(k => p.set(k, OFFER[k]));
  const url = `${location.origin}${location.pathname}?${p.toString()}`;
  try { await navigator.clipboard.writeText(url); toast('Share link copied to clipboard'); }
  catch (e) { prompt('Copy this share link:', url); }
});

// ============================================================
//  RENDER
// ============================================================
function render() {
  const r = compute();
  const set = (id, v) => (document.getElementById(id).textContent = v);

  // economics
  set('cac', isFinite(r.cac) ? usd(r.cac) : '—');
  set('lgpCac', r.lgpCac > 0 ? ratio(r.lgpCac) : '—');
  set('retention', num1(r.retention) + ' mo');
  set('dayOneRoas', x2(r.dayOneRoas));
  document.getElementById('cashRoasTile').classList.toggle('warn', r.dayOneRoas < 2);
  set('lgp', usd(r.lgp));
  set('profitPerClient', usd(r.profitPerClient));
  set('grossMargin', pct(r.grossMargin * 100));
  set('profitMargin', pct(r.profitMargin * 100));

  // projection
  set('newClients', num1(r.clients));
  set('adSpend', usd(r.adSpend));
  set('monthlyRevenue', usd(r.monthlyRevenue));
  set('monthlyCogs', usd(r.monthlyCogs));
  set('monthlyRoas', x2(r.monthlyRoas));
  set('callsTag', `${state.calls} booked calls/mo`);
  const netEl = document.getElementById('netProfit');
  netEl.textContent = (r.netProfit < 0 ? '-$' : '$') + Math.abs(Math.round(r.netProfit)).toLocaleString('en-US');
  netEl.classList.toggle('neg', r.netProfit < 0);
  netEl.classList.toggle('pos', r.netProfit >= 0);
  const tile = document.getElementById('netProfitTile');
  tile.classList.toggle('is-neg', r.netProfit < 0);
  tile.classList.toggle('is-pos', r.netProfit >= 0);

  // recommended price
  set('recPrice', isFinite(r.recPrice) ? usd(r.recPrice) : '—');
  set('targetLabel', `${(+OFFER.targetRatio).toFixed(0)}:1`);
  set('currentPriceLabel', `${usd(OFFER.price)}/mo (${OFFER.minTerm}-month contract)`);
  const flag = document.getElementById('recFlag');
  if (r.lgpCac >= OFFER.targetRatio) {
    flag.textContent = 'Your pricing clears your target. Room to scale spend.';
    flag.classList.add('ok');
  } else {
    flag.textContent = 'Consider raising price or improving metrics.';
    flag.classList.remove('ok');
  }

  renderDiagnosis(r);
}

function renderDiagnosis(r) {
  const d = diagnose();
  const v = d.verdict;
  const card = document.getElementById('diagnosisCard');
  const focusKey = v.healthy ? (v.next ? v.next.key : 'scale') : v.key;
  const topRow = v.healthy ? v.next : v.top;

  // headline
  document.getElementById('diagEyebrow').textContent =
    v.healthy ? 'Healthy economics. Scale, and chase next' : 'Your biggest constraint';
  document.getElementById('diagName').textContent = v.name;
  card.classList.toggle('is-healthy', v.healthy);

  document.getElementById('diagBottleneck').textContent = bottleneckText(v.key, r, topRow);

  // impact chips
  const impact = document.getElementById('diagImpact');
  const chips = [
    ['LGP:CAC now', ratio(d.base)],
    ['Target', `${(+OFFER.targetRatio).toFixed(0)}:1`],
    ['Day-one cash ROAS', x2(r.dayOneRoas) + (r.dayOneRoas < 2 ? ' (target 2x)' : '')],
  ];
  if (topRow) chips.splice(1, 0, [`If you fix ${topRow.name}`, `${ratio(topRow.projected)} (+${topRow.lift.toFixed(1)})`]);
  impact.innerHTML = chips.map(([k, val]) =>
    `<div class="chip"><span class="chip-k">${k}</span><span class="chip-v">${val}</span></div>`).join('');

  // scenarios table
  const tbl = document.getElementById('scenarioTable');
  const maxLift = Math.max(0.0001, ...d.rows.map(x => x.lift));
  tbl.innerHTML = d.rows.map((row, i) => {
    const isTop = i === 0 && row.lift > 0.05;
    const w = Math.max(0, (row.lift / maxLift) * 100);
    return `<div class="scn-row${isTop ? ' top' : ''}">
      <span class="scn-side">${row.side}</span>
      <span class="scn-label">${row.label}</span>
      <span class="scn-bar"><span class="scn-fill" style="width:${w}%"></span></span>
      <span class="scn-result">${ratio(row.projected)}</span>
      <span class="scn-lift">${row.lift > 0.05 ? '+' + row.lift.toFixed(1) : '—'}</span>
    </div>`;
  }).join('');

  // action plan
  document.getElementById('actionName').textContent = v.name;
  const steps = PLAYBOOKS[focusKey] || PLAYBOOKS.scale;
  document.getElementById('actionSteps').innerHTML = steps.map((s, i) => `
    <div class="step">
      <div class="step-n">${i + 1}</div>
      <div class="step-body">
        <div class="step-what">${s.what}</div>
        <div class="step-line"><span>How</span> ${s.how}</div>
        <div class="step-line out"><span>Outcome</span> ${s.out}</div>
      </div>
    </div>`).join('');

  // formula
  document.getElementById('formulaList').innerHTML = formulaRows(r).map(([label, f, val]) => `
    <div class="frm-row">
      <span class="frm-label">${label}</span>
      <span class="frm-eq">${f}</span>
      <span class="frm-val">${val}</span>
    </div>`).join('');
}

// ---------------- toast ----------------
let toastTimer;
function toast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg; el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2600);
}

// ---------------- boot ----------------
function syncAll() { paintAllSliders(); paintOffer(); render(); }
loadFromStorage();
const sharedLink = loadFromUrl();
syncAll();
if (sharedLink) toast('Loaded a shared scenario');
