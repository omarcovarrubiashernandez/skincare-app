import { state } from './state.js';
import { fmtMoney, icons } from './utils.js';

let reportPeriod = 'week';

function getFilteredSales(period) {
  const now = new Date(), sales = state.sales;
  if (period === 'week') {
    const d = new Date(now); d.setDate(d.getDate() - 7);
    return sales.filter(s => s.date && new Date(s.date) >= d);
  }
  if (period === 'month') {
    const d = new Date(now); d.setMonth(d.getMonth() - 1);
    return sales.filter(s => s.date && new Date(s.date) >= d);
  }
  return sales;
}

export function renderReports() {
  const filtered = getFilteredSales(reportPeriod);
  const totalVentas = filtered.reduce((s, v) => s + (v.total || 0), 0);
  const totalGanancia = filtered.reduce((s, v) => s + (v.items || []).reduce((ss, i) => ss + ((i.price || 0) - (i.cost || 0)) * i.qty, 0), 0);

  const prodMap = {};
  for (const s of filtered) for (const i of (s.items || [])) {
    if (!prodMap[i.id]) prodMap[i.id] = { id: i.id, name: i.name, qty: 0, revenue: 0 };
    prodMap[i.id].qty += i.qty;
    prodMap[i.id].revenue += (i.price || 0) * i.qty;
  }
  const sorted = Object.values(prodMap).sort((a, b) => b.qty - a.qty);
  const top10 = sorted.slice(0, 10);
  const maxQty = top10[0]?.qty || 1;

  const soldIds = new Set(Object.keys(prodMap));
  const noMove = state.products.filter(p => !soldIds.has(p.id));

  return `
  <div class="section-title">Reportes</div>
  <div class="period-tabs">
    <button class="period-tab${reportPeriod === 'week' ? ' active' : ''}" onclick="window._rPeriod('week')">Esta semana</button>
    <button class="period-tab${reportPeriod === 'month' ? ' active' : ''}" onclick="window._rPeriod('month')">Este mes</button>
    <button class="period-tab${reportPeriod === 'all' ? ' active' : ''}" onclick="window._rPeriod('all')">Todo</button>
  </div>
  <div class="summary-grid" style="margin-bottom:20px;">
    <div class="summary-card" style="background:#daeadd;"><div class="summary-val" style="color:var(--success);">${fmtMoney(totalVentas)}</div><div class="summary-label">Ingresos</div></div>
    <div class="summary-card" style="background:#e8edd8;"><div class="summary-val" style="color:var(--olive);">${fmtMoney(totalGanancia)}</div><div class="summary-label">Ganancia</div></div>
    <div class="summary-card" style="background:#f5f0e8;border:1px solid var(--cream-mid);"><div class="summary-val" style="color:var(--text);">${filtered.length}</div><div class="summary-label">Ventas</div></div>
    <div class="summary-card" style="background:#f5f0e8;border:1px solid var(--cream-mid);"><div class="summary-val" style="color:var(--gold);">${noMove.length}</div><div class="summary-label">Sin movimiento</div></div>
  </div>
  <div style="font-family:'Playfair Display',serif;font-size:18px;margin-bottom:14px;color:var(--text);">Top 10 más vendidos</div>
  <div class="card" style="padding:16px;margin-bottom:20px;">
    ${top10.length === 0 ? `<div class="empty" style="padding:24px;">${icons.pkg}<p>Sin ventas en este período</p></div>` : ''}
    ${top10.map((p, i) => `<div class="bar-row"><div class="bar-label-row"><span class="bar-name"><span style="color:var(--gold);font-weight:700;margin-right:6px;">${i + 1}.</span>${p.name}</span><span class="bar-val">${p.qty} uds · ${fmtMoney(p.revenue)}</span></div><div class="bar-track"><div class="bar-fill" style="width:${Math.round((p.qty / maxQty) * 100)}%"></div></div></div>`).join('')}
  </div>
  <div style="font-family:'Playfair Display',serif;font-size:18px;margin-bottom:14px;color:var(--text);">Sin movimiento</div>
  ${noMove.length === 0 ? `<p style="font-size:13px;color:var(--text-light);margin-bottom:20px;">¡Todos tuvieron ventas!</p>` : ''}
  <div style="display:flex;flex-direction:column;gap:8px;margin-bottom:20px;">
    ${noMove.map(p => `<div class="card" style="display:flex;align-items:center;gap:12px;padding:12px;">
      <div style="width:44px;height:44px;border-radius:10px;overflow:hidden;background:var(--cream-dark);flex-shrink:0;display:flex;align-items:center;justify-content:center;">${p.image ? `<img src="${p.image}" style="width:100%;height:100%;object-fit:cover;">` : `${icons.pkg}`}</div>
      <div style="flex:1;"><div style="font-weight:600;font-size:14px;">${p.name}</div><div style="font-size:12px;color:var(--text-light);">Stock: ${p.stock || 0}</div></div>
      <span class="pill pill-warn">Sin ventas</span>
    </div>`).join('')}
  </div>`;
}

window._rPeriod = v => { reportPeriod = v; window._renderCurrentTab?.(); };