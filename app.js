/* ============================================================
   Growth Constraint Modeler — AI Agency Ad Economics
   Live unit-economics model. Move a slider, watch every
   downstream metric recompute. Sliders glow green when a
   metric hits a healthy target — the amber ones are your
   constraints. Settings persist locally and via share links.
   ============================================================ */

// ---- Slider definitions ----
// `good` returns true when the metric is in a healthy zone (glows green).
// `goal` is the human-readable target shown under each slider.
const SLIDERS = [
  { id: 'cpqbc',     label: 'CPQBC',        sub: 'Cost Per Qualified Booked Call', min: 50,  max: 1000, step: 5,  base: 370, fmt: 'usd', goal: 'Goal ≤ $350',  good: v => v <= 350 },
  { id: 'showRate',  label: 'Show Rate',    sub: '',                               min: 0,   max: 100,  step: 1,  base: 72,  fmt: 'pct', goal: 'Goal ≥ 70%',   good: v => v >= 70  },
  { id: 'closeRate', label: 'Close Rate',   sub: '',                               min: 0,   max: 100,  step: 1,  base: 17,  fmt: 'pct', goal: 'Goal ≥ 18%',   good: v => v >= 18  },
  { id: 'churnRate', label: 'Churn Rate',   sub: 'Monthly — lower keeps clients',  min: 1,   max: 50,   step: 1,  base: 13,  fmt: 'pct', goal: 'Goal ≤ 10%',   good: v => v <= 10  },
  { id: 'cogs',      label: 'Monthly COGS', sub: 'Delivery Cost per client',       min: 0,   max: 3000, step: 10, base: 500, fmt: 'usd', goal: '',             good: () => false   },
  { id: 'calls',     label: 'Booked Calls', sub: 'Per month',                      min: 1,   max: 200,  step: 1,  base: 30,  fmt: 'num', goal: 'Goal > 30',    good: v => v > 30   },
];

const OFFER_KEYS = ['price', 'minTerm', 'targetRatio'];
const OFFER_DEFAULTS = { price: 3499, minTerm: 3, targetRatio: 10 };

// Demo defaults (factory reset target)
const DEMO = {
  sliders: Object.fromEntries(SLIDERS.map(s => [s.id, s.base])),
  offer: { ...OFFER_DEFAULTS },
};

const STORE_KEY = 'aec_v1';

// ---------------- live + baseline state ----------------
let state       = { ...DEMO.sliders };  // current slider values
let OFFER       = { ...DEMO.offer };     // current offer values
let baseSliders = { ...DEMO.sliders };  // personalized baseline
let baseOffer   = { ...DEMO.offer };

// ---------------- persistence ----------------
function persist() {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify({ state, OFFER, baseSliders, baseOffer }));
  } catch (e) { /* storage unavailable — fail silent */ }
}

function loadFromStorage() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return false;
    const d = JSON.parse(raw);
    if (d.state)       state       = { ...DEMO.sliders, ...d.state };
    if (d.OFFER)       OFFER       = { ...DEMO.offer, ...d.OFFER };
    if (d.baseSliders) baseSliders = { ...DEMO.sliders, ...d.baseSliders };
    if (d.baseOffer)   baseOffer   = { ...DEMO.offer, ...d.baseOffer };
    return true;
  } catch (e) { return false; }
}

// URL params override current state (for shared links)
function loadFromUrl() {
  const p = new URLSearchParams(location.search);
  let used = false;
  SLIDERS.forEach(s => {
    if (p.has(s.id)) { const v = Number(p.get(s.id)); if (!isNaN(v)) { state[s.id] = clamp(s, v); used = true; } }
  });
  OFFER_KEYS.forEach(k => {
    if (p.has(k)) { const v = Number(p.get(k)); if (!isNaN(v) && v > 0) { OFFER[k] = v; used = true; } }
  });
  return used;
}

function clamp(s, v) { return Math.min(s.max, Math.max(s.min, v)); }

// ---------------- formatting helpers ----------------
const usd  = n => '$' + Math.round(n).toLocaleString('en-US');
const pct  = n => n.toFixed(1) + '%';
const num1 = n => n.toFixed(1);
const x2   = n => n.toFixed(2) + 'x';
const fmtSlider = (s, v) => s.fmt === 'usd' ? usd(v) : s.fmt === 'pct' ? v + '%' : String(v);

// ---------------- build sliders ----------------
const sliderList = document.getElementById('sliderList');
SLIDERS.forEach(s => {
  const row = document.createElement('div');
  row.className = 'slider-row';
  row.innerHTML = `
    <div class="slider-top">
      <div class="slider-label">${s.label}${s.sub ? `<small>${s.sub}</small>` : ''}</div>
      <div class="slider-readout">
        <span class="slider-baseline" id="base-${s.id}"></span>
        <span class="slider-value" id="val-${s.id}"></span>
      </div>
    </div>
    <div class="range-wrap">
      <input type="range" id="sl-${s.id}" min="${s.min}" max="${s.max}" step="${s.step}" />
      <span class="baseline-tick" id="tick-${s.id}"></span>
    </div>
    ${s.goal ? `<div class="slider-goal" id="goal-${s.id}">${s.goal}</div>` : ''}`;
  sliderList.appendChild(row);

  const input = row.querySelector(`#sl-${s.id}`);
  input.addEventListener('input', () => {
    state[s.id] = Number(input.value);
    paintSlider(s);
    render();
    persist();
  });
});

function positionTick(s) {
  const tick = document.getElementById('tick-' + s.id);
  const basePct = (baseSliders[s.id] - s.min) / (s.max - s.min);
  tick.style.left = `calc(8px + ${basePct} * (100% - 16px))`;
}

function paintSlider(s) {
  const input = document.getElementById('sl-' + s.id);
  const valEl = document.getElementById('val-' + s.id);
  const baseEl = document.getElementById('base-' + s.id);
  const v = state[s.id];

  input.value = v;
  const fillPct = ((v - s.min) / (s.max - s.min)) * 100;
  const healthy = s.good(v);
  input.style.setProperty('--fill', fillPct + '%');
  input.style.setProperty('--fill-color', healthy ? 'var(--pos)' : 'var(--accent)');

  baseEl.textContent = `Baseline: ${fmtSlider(s, baseSliders[s.id])}`;
  valEl.textContent = fmtSlider(s, v);
  valEl.classList.toggle('good', healthy);
  valEl.classList.toggle('changed', !healthy && v !== baseSliders[s.id]);

  const goalEl = document.getElementById('goal-' + s.id);
  if (goalEl) goalEl.classList.toggle('met', healthy);
}

function paintAllSliders() { SLIDERS.forEach(s => { positionTick(s); paintSlider(s); }); }

// ---------------- offer inputs ----------------
const offerEls = {
  price:       document.getElementById('priceInput'),
  minTerm:     document.getElementById('minTermInput'),
  targetRatio: document.getElementById('targetRatioInput'),
};
OFFER_KEYS.forEach(key => {
  offerEls[key].addEventListener('input', () => {
    const v = Number(offerEls[key].value);
    if (!isNaN(v) && v > 0) { OFFER[key] = v; render(); persist(); }
  });
});
function paintOffer() { OFFER_KEYS.forEach(k => (offerEls[k].value = OFFER[k])); }

// ---------------- buttons ----------------
document.getElementById('resetBtn').addEventListener('click', () => {
  state = { ...baseSliders };
  OFFER = { ...baseOffer };
  syncAll(); persist();
});

document.getElementById('defaultsBtn').addEventListener('click', () => {
  state = { ...DEMO.sliders };  OFFER = { ...DEMO.offer };
  baseSliders = { ...DEMO.sliders };  baseOffer = { ...DEMO.offer };
  syncAll(); persist();
  toast('Restored demo defaults');
});

document.getElementById('saveBaselineBtn').addEventListener('click', () => {
  baseSliders = { ...state };
  baseOffer = { ...OFFER };
  paintAllSliders(); render(); persist();
  toast('Saved as your baseline — this is now your starting point');
});

document.getElementById('shareBtn').addEventListener('click', async () => {
  const p = new URLSearchParams();
  SLIDERS.forEach(s => p.set(s.id, state[s.id]));
  OFFER_KEYS.forEach(k => p.set(k, OFFER[k]));
  const url = `${location.origin}${location.pathname}?${p.toString()}`;
  try {
    await navigator.clipboard.writeText(url);
    toast('Share link copied to clipboard');
  } catch (e) {
    prompt('Copy this share link:', url);
  }
});

// ---------------- THE MODEL ----------------
function compute() {
  const cpqbc = state.cpqbc;
  const show  = state.showRate / 100;
  const close = state.closeRate / 100;
  const churn = state.churnRate / 100;
  const cogs  = state.cogs;
  const calls = state.calls;
  const price = OFFER.price;

  const closeProb = show * close;                       // call -> client
  const clients   = calls * closeProb;                  // new clients / month
  const adSpend   = calls * cpqbc;                       // total ad spend / month
  const cac       = closeProb > 0 ? cpqbc / closeProb : Infinity;
  const retention = 1 / churn;                           // avg lifetime (months)

  const monthlyRevenue = clients * price;
  const monthlyCogs    = clients * cogs;
  const netProfit      = monthlyRevenue - monthlyCogs - adSpend;
  const monthlyRoas    = adSpend > 0 ? monthlyRevenue / adSpend : 0;
  const dayOneRoas     = isFinite(cac) && cac > 0 ? price / cac : 0;

  const lifetimeRevenue = price * retention;
  const lgp             = (price - cogs) * retention;
  const profitPerClient = lgp - cac;
  const grossMargin     = price > 0 ? (price - cogs) / price : 0;
  const profitMargin    = lifetimeRevenue > 0 ? profitPerClient / lifetimeRevenue : 0;
  const lgpCac          = isFinite(cac) && cac > 0 ? lgp / cac : 0;
  const recPrice        = OFFER.targetRatio * cac / retention + cogs;

  return { cac, lgpCac, retention, dayOneRoas, lgp, profitPerClient, grossMargin,
           profitMargin, clients, adSpend, monthlyRevenue, monthlyCogs, netProfit,
           monthlyRoas, recPrice };
}

// ---------------- render ----------------
function render() {
  const r = compute();
  const set = (id, v) => (document.getElementById(id).textContent = v);

  set('cac', isFinite(r.cac) ? usd(r.cac) : '—');
  set('lgpCac', r.lgpCac > 0 ? r.lgpCac.toFixed(2) + ':1' : '—');
  set('retention', num1(r.retention) + ' mo');
  set('dayOneRoas', x2(r.dayOneRoas));
  set('lgp', usd(r.lgp));
  set('profitPerClient', usd(r.profitPerClient));
  set('grossMargin', pct(r.grossMargin * 100));
  set('profitMargin', pct(r.profitMargin * 100));

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

  set('recPrice', isFinite(r.recPrice) ? usd(r.recPrice) : '—');
  set('targetLabel', `${(+OFFER.targetRatio).toFixed(0)}:1`);
  set('currentPriceLabel', `${usd(OFFER.price)}/mo (${OFFER.minTerm}-month min)`);
  const flag = document.getElementById('recFlag');
  if (r.lgpCac >= OFFER.targetRatio) {
    flag.textContent = '— Current pricing clears your target. Room to scale spend.';
    flag.classList.add('ok');
  } else {
    flag.textContent = '— Consider raising price or improving metrics';
    flag.classList.remove('ok');
  }

  const changed = SLIDERS.filter(s => state[s.id] !== baseSliders[s.id]).length;
  const bar = document.getElementById('statusBar');
  const txt = document.getElementById('statusText');
  if (changed === 0) {
    bar.classList.remove('modeling');
    txt.textContent = 'At baseline — adjust sliders to model scenarios';
  } else {
    bar.classList.add('modeling');
    txt.textContent = `Modeling scenario — ${changed} metric${changed > 1 ? 's' : ''} adjusted from baseline`;
  }
}

// ---------------- toast ----------------
let toastTimer;
function toast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2600);
}

// ---------------- sync everything to the DOM ----------------
function syncAll() { paintAllSliders(); paintOffer(); render(); }

// ---------------- boot ----------------
loadFromStorage();
const sharedLink = loadFromUrl();   // URL wins for current scenario
syncAll();
if (sharedLink) toast('Loaded a shared scenario');
