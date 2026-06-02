/* ============================================================
   Growth Constraint Modeler — AI Agency Ad Economics
   Live unit-economics model. Move a slider, watch every
   downstream metric recompute. Use it to find the single
   constraint that swings net profit hardest.
   ============================================================ */

// ---- Slider definitions (baseline values match the source model) ----
const SLIDERS = [
  { id: 'cpqbc',      label: 'CPQBC',        sub: 'Cost Per Qualified Booked Call', min: 50,  max: 1000, step: 5,  base: 370, fmt: 'usd' },
  { id: 'showRate',   label: 'Show Rate',    sub: '',                               min: 0,   max: 100,  step: 1,  base: 72,  fmt: 'pct' },
  { id: 'closeRate',  label: 'Close Rate',   sub: '',                               min: 0,   max: 100,  step: 1,  base: 17,  fmt: 'pct' },
  { id: 'churnRate',  label: 'Churn Rate',   sub: 'Monthly',                        min: 1,   max: 50,   step: 1,  base: 13,  fmt: 'pct' },
  { id: 'cogs',       label: 'Monthly COGS', sub: 'Delivery Cost per client',       min: 0,   max: 3000, step: 10, base: 500, fmt: 'usd' },
  { id: 'calls',      label: 'Booked Calls', sub: 'Per month',                      min: 1,   max: 200,  step: 1,  base: 30,  fmt: 'num' },
];

// ---- Offer / target inputs ----
const OFFER = { price: 3499, minTerm: 3, targetRatio: 10 };

const state = {};
SLIDERS.forEach(s => (state[s.id] = s.base));

// ---------------- formatting helpers ----------------
const usd  = n => '$' + Math.round(n).toLocaleString('en-US');
const pct  = n => (n).toFixed(1) + '%';
const num1 = n => (n).toFixed(1);
const x2   = n => n.toFixed(2) + 'x';

function fmtSlider(s, v) {
  if (s.fmt === 'usd') return usd(v);
  if (s.fmt === 'pct') return v + '%';
  return String(v);
}

// ---------------- build sliders ----------------
const sliderList = document.getElementById('sliderList');
SLIDERS.forEach(s => {
  const row = document.createElement('div');
  row.className = 'slider-row';
  row.innerHTML = `
    <div class="slider-top">
      <div class="slider-label">${s.label}${s.sub ? `<small>${s.sub}</small>` : ''}</div>
      <div class="slider-readout">
        <span class="slider-baseline">Baseline: ${fmtSlider(s, s.base)}</span>
        <span class="slider-value" id="val-${s.id}">${fmtSlider(s, s.base)}</span>
      </div>
    </div>
    <div class="range-wrap">
      <input type="range" id="sl-${s.id}" min="${s.min}" max="${s.max}" step="${s.step}" value="${s.base}" />
      <span class="baseline-tick" id="tick-${s.id}"></span>
    </div>`;
  sliderList.appendChild(row);

  const input = row.querySelector(`#sl-${s.id}`);
  const tick  = row.querySelector(`#tick-${s.id}`);
  // position baseline tick (account for 16px thumb inset)
  const basePct = (s.base - s.min) / (s.max - s.min);
  tick.style.left = `calc(8px + ${basePct} * (100% - 16px))`;

  input.addEventListener('input', () => {
    state[s.id] = Number(input.value);
    paintSlider(s);
    render();
  });
  paintSlider(s);
});

function paintSlider(s) {
  const input = document.getElementById('sl-' + s.id);
  const valEl = document.getElementById('val-' + s.id);
  const v = state[s.id];
  const fillPct = ((v - s.min) / (s.max - s.min)) * 100;
  input.style.setProperty('--fill', fillPct + '%');
  valEl.textContent = fmtSlider(s, v);
  valEl.classList.toggle('changed', v !== s.base);
}

// ---------------- offer inputs ----------------
const priceInput  = document.getElementById('priceInput');
const minTermInput = document.getElementById('minTermInput');
const targetInput = document.getElementById('targetRatioInput');
[ [priceInput, 'price'], [minTermInput, 'minTerm'], [targetInput, 'targetRatio'] ].forEach(([el, key]) => {
  el.addEventListener('input', () => {
    const v = Number(el.value);
    if (!isNaN(v) && v > 0) { OFFER[key] = v; render(); }
  });
});

// ---------------- reset ----------------
document.getElementById('resetBtn').addEventListener('click', () => {
  SLIDERS.forEach(s => {
    state[s.id] = s.base;
    document.getElementById('sl-' + s.id).value = s.base;
    paintSlider(s);
  });
  render();
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
  const lgp             = (price - cogs) * retention;   // lifetime gross profit
  const profitPerClient = lgp - cac;
  const grossMargin     = price > 0 ? (price - cogs) / price : 0;
  const profitMargin    = lifetimeRevenue > 0 ? profitPerClient / lifetimeRevenue : 0;
  const lgpCac          = isFinite(cac) && cac > 0 ? lgp / cac : 0;

  // price needed to hit target LGP:CAC  ->  (P - cogs)*retention = ratio*cac
  const recPrice = OFFER.targetRatio * cac / retention + cogs;

  return { cac, lgpCac, retention, dayOneRoas, lgp, profitPerClient, grossMargin,
           profitMargin, clients, adSpend, monthlyRevenue, monthlyCogs, netProfit,
           monthlyRoas, recPrice };
}

// ---------------- render ----------------
function render() {
  const r = compute();
  const set = (id, v) => (document.getElementById(id).textContent = v);

  // Calculated Economics
  set('cac', isFinite(r.cac) ? usd(r.cac) : '—');
  set('lgpCac', r.lgpCac > 0 ? r.lgpCac.toFixed(2) + ':1' : '—');
  set('retention', num1(r.retention) + ' mo');
  set('dayOneRoas', x2(r.dayOneRoas));
  set('lgp', usd(r.lgp));
  set('profitPerClient', usd(r.profitPerClient));
  set('grossMargin', pct(r.grossMargin * 100));
  set('profitMargin', pct(r.profitMargin * 100));

  // Monthly Revenue Projection
  set('newClients', num1(r.clients));
  set('adSpend', usd(r.adSpend));
  set('monthlyRevenue', usd(r.monthlyRevenue));
  set('monthlyCogs', usd(r.monthlyCogs));
  set('monthlyRoas', x2(r.monthlyRoas));
  set('callsTag', `${state.calls} booked calls/mo`);

  // Net profit tile (sign-aware coloring)
  const netEl = document.getElementById('netProfit');
  netEl.textContent = (r.netProfit < 0 ? '-$' : '$') + Math.abs(Math.round(r.netProfit)).toLocaleString('en-US');
  netEl.classList.toggle('neg', r.netProfit < 0);
  netEl.classList.toggle('pos', r.netProfit >= 0);
  const tile = document.getElementById('netProfitTile');
  tile.classList.toggle('is-neg', r.netProfit < 0);
  tile.classList.toggle('is-pos', r.netProfit >= 0);

  // Recommended price
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

  // Status bar
  const changed = SLIDERS.filter(s => state[s.id] !== s.base).length;
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

render();
