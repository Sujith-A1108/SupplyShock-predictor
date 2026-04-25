/* ═══════════════════════════════════════════════════════════════════════════
   ML INTELLIGENCE SUITE — frontend JS  (light-theme edition)
   renderMLPanel() is called directly from renderDashboard() in script.js
   ════════════════════════════════════════════════════════════════════════ */

let _mlShipments  = [];
let _mlMetrics    = {};

function renderMLPanel(shipments, mlMetrics) {
  _mlShipments  = shipments  || [];
  _mlMetrics    = mlMetrics  || {};

  const mlShips = _mlShipments.filter(s => s.mlPrediction);
  if (mlShips.length === 0) return;

  ['mlStatusBar','mlSection'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = '';
  });

  _renderMLStatusBar(mlShips);
  _renderMLKpiRow(mlShips);
  _renderMLCards(mlShips);
}

function _renderMLStatusBar(ships) {
  const statusText = document.getElementById('mlStatusText');
  const strip      = document.getElementById('mlMetricsStrip');
  if (!statusText || !strip) return;
  statusText.textContent = `ML Engine · ${ships.length} shipments scored`;
  const m = _mlMetrics;
  const chips = [
    { label:'DELAY ACC',    val: m.delay?.accuracy    ? (m.delay.accuracy*100).toFixed(1)+'%'    : '—', cls:_accClass(m.delay?.accuracy) },
    { label:'DELAY MAE',    val: m.delay?.delay_days_mae != null ? m.delay.delay_days_mae+'d'     : '—', cls:'mmc-val' },
    { label:'SHORTAGE ACC', val: m.shortage?.accuracy ? (m.shortage.accuracy*100).toFixed(1)+'%' : '—', cls:_accClass(m.shortage?.accuracy) },
    { label:'ROUTE R²',     val: m.route?.r2 != null  ? m.route.r2                               : '—', cls:_r2Class(m.route?.r2) },
    { label:'SUPPLIER ACC', val: m.supplier?.accuracy ? (m.supplier.accuracy*100).toFixed(1)+'%' : '—', cls:_accClass(m.supplier?.accuracy) },
  ];
  strip.innerHTML = chips.map(c =>
    `<div class="ml-metric-chip"><span class="mmc-label">${c.label}</span><span class="${c.cls}">${c.val}</span></div>`
  ).join('');
}

function _accClass(v){ if(!v) return 'mmc-val'; return v>=0.80?'mmc-good':v>=0.65?'mmc-warn':'mmc-bad'; }
function _r2Class(v) { if(!v) return 'mmc-val'; return v>=0.70?'mmc-good':v>=0.50?'mmc-warn':'mmc-bad'; }

function _renderMLKpiRow(ships) {
  const row = document.getElementById('mlKpiRow');
  if (!row) return;
  const n  = ships.length || 1;
  const highCount  = ships.filter(s => s.riskLabel === 'High').length;
  const medCount   = ships.filter(s => s.riskLabel === 'Medium').length;
  const avgDelay   = (ships.reduce((a,s)=>a+(s.mlPrediction.delay_probability||0),0)/n*100).toFixed(1);
  const highShort  = ships.filter(s => s.mlPrediction.shortage_risk === 'High').length;
  const avgRoute   = Math.round(ships.reduce((a,s)=>a+(s.mlPrediction.route_risk_score||0),0)/n);
  const avgRel     = Math.round(ships.reduce((a,s)=>a+(s.mlPrediction.reliability_score||0),0)/n);
  const totalImp   = ships.reduce((a,s)=>a+(s.mlImpact?.total_estimated_impact||0),0);

  row.innerHTML = `
    <div class="ml-kpi-card kpi-high">
      <div class="ml-kpi-icon">🔴</div><div class="ml-kpi-val">${highCount}</div>
      <div class="ml-kpi-label">High Risk Ships</div><div class="ml-kpi-sub">ML-scored</div>
    </div>
    <div class="ml-kpi-card kpi-medium">
      <div class="ml-kpi-icon">🟡</div><div class="ml-kpi-val">${medCount}</div>
      <div class="ml-kpi-label">Medium Risk Ships</div><div class="ml-kpi-sub">ML-scored</div>
    </div>
    <div class="ml-kpi-card kpi-delay">
      <div class="ml-kpi-icon">⏱</div><div class="ml-kpi-val">${avgDelay}%</div>
      <div class="ml-kpi-label">Avg Delay Prob</div><div class="ml-kpi-sub">across ${n} shipments</div>
    </div>
    <div class="ml-kpi-card kpi-shortage">
      <div class="ml-kpi-icon">📦</div><div class="ml-kpi-val">${highShort}</div>
      <div class="ml-kpi-label">High Shortage Risk</div><div class="ml-kpi-sub">shipments flagged</div>
    </div>
    <div class="ml-kpi-card kpi-route">
      <div class="ml-kpi-icon">🗺</div><div class="ml-kpi-val">${avgRoute}</div>
      <div class="ml-kpi-label">Avg Route Risk</div><div class="ml-kpi-sub">out of 100</div>
    </div>
    <div class="ml-kpi-card kpi-supplier">
      <div class="ml-kpi-icon">🏭</div><div class="ml-kpi-val">${avgRel}</div>
      <div class="ml-kpi-label">Avg Supplier Score</div><div class="ml-kpi-sub">out of 100</div>
    </div>
    <div class="ml-kpi-card kpi-impact">
      <div class="ml-kpi-icon">💰</div><div class="ml-kpi-val">$${_fmt(totalImp)}</div>
      <div class="ml-kpi-label">Total ML Impact Est.</div><div class="ml-kpi-sub">estimated exposure</div>
    </div>`;
}

function _fmt(n){ if(n>=1e6) return (n/1e6).toFixed(1)+'M'; if(n>=1e3) return (n/1e3).toFixed(0)+'K'; return String(n||0); }

function _renderMLCards(ships) {
  const grid = document.getElementById('mlCardsGrid');
  if (!grid) return;
  const order = {High:0,Medium:1,Low:2};
  const sorted = [...ships].sort((a,b)=>(order[a.riskLabel]??3)-(order[b.riskLabel]??3));

  grid.innerHTML = sorted.map(ship => {
    const ml  = ship.mlPrediction;
    const imp = ship.mlImpact;
    const delayPct   = Math.round((ml.delay_probability||0)*100);
    const shortageNum= {Low:18,Medium:55,High:92}[ml.shortage_risk]||18;
    const supplierPct= ml.reliability_score||50;
    const routeScore = ml.route_risk_score||0;
    const riskCls    = (ship.riskLabel||'Low').toLowerCase();
    const mlBadgeCls = (ml.ml_risk_label||'Low');

    const impactHtml = imp ? `
      <div class="ml-impact-row">
        <div><div class="ml-impact-label">Est. Financial Impact</div>
        <div class="ml-impact-val">$${_fmt(imp.total_estimated_impact)}</div></div>
        <span class="ml-impact-sev sev-${(imp.impact_severity||'').toLowerCase()}">${imp.impact_severity||'—'}</span>
      </div>` : '';

    return `
      <div class="ml-card ml-card-${riskCls}">
        <div class="ml-card-header">
          <div class="ml-card-title-wrap">
            <div class="ml-card-ship">${ship.name||ship.shipId}</div>
            <div class="ml-card-route">${ship.origin||''} → ${ship.destination||''}</div>
          </div>
          <div class="ml-card-header-right">
            <span class="ml-risk-badge ${mlBadgeCls}">${mlBadgeCls}</span>
            <button class="ml-locate-btn" onclick="flyToShip('${ship.shipId}')" title="Show on map">📍 Map</button>
          </div>
        </div>
        <div class="ml-card-body">
          <div class="ml-gauge-row">
            <div class="ml-gauge">
              <span class="ml-gauge-name">Delay Prob</span>
              <div class="ml-gauge-bar"><div class="ml-gauge-fill delay" style="width:${delayPct}%"></div></div>
              <span class="ml-gauge-num">${delayPct}%</span>
            </div>
            <div class="ml-gauge">
              <span class="ml-gauge-name">Shortage</span>
              <div class="ml-gauge-bar"><div class="ml-gauge-fill shortage" style="width:${shortageNum}%"></div></div>
              <span class="ml-gauge-num">${ml.shortage_risk}</span>
            </div>
            <div class="ml-gauge">
              <span class="ml-gauge-name">Route Risk</span>
              <div class="ml-gauge-bar"><div class="ml-gauge-fill route" style="width:${routeScore}%"></div></div>
              <span class="ml-gauge-num">${routeScore}/100</span>
            </div>
            <div class="ml-gauge">
              <span class="ml-gauge-name">Supplier</span>
              <div class="ml-gauge-bar"><div class="ml-gauge-fill supplier" style="width:${supplierPct}%"></div></div>
              <span class="ml-gauge-num">${supplierPct}/100</span>
            </div>
          </div>
          <div class="ml-tags">
            <span class="ml-tag">🕒 +${ml.predicted_delay_days??0}d predicted</span>
            <span class="ml-tag ${_tagCls(ml.shortage_risk)}">📦 ${ml.shortage_risk} shortage</span>
            <span class="ml-tag ${_tagCls(ml.route_risk_label)}">🗺 ${ml.route_risk_label||'—'} route</span>
            <span class="ml-tag ${_tagCls(ml.supplier_risk_tier)}">🏭 ${ml.supplier_risk_tier||'—'} supplier</span>
            <span class="ml-tag">📅 ${ml.predicted_stock_cover_days??'?'}d stock cover</span>
          </div>
          ${impactHtml}
        </div>
      </div>`;
  }).join('');
}

function _tagCls(l){ return l==='High'?'tag-high':l==='Medium'?'tag-medium':'tag-low'; }



