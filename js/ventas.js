import { state } from './state.js';
import { fmtMoney, icons } from './utils.js';
import { updateItem, deleteItem } from './firebase.js';
import { toast } from './utils.js';

export function renderSales() {
  const today = new Date().toDateString();
  const todaySales = state.sales.filter(s => s.date && new Date(s.date).toDateString() === today);
  const todayTotal = todaySales.reduce((s, v) => s + (v.total || 0), 0);
  const todayProfit = todaySales.reduce((s, v) => s + (v.items || []).reduce((ss, i) => ss + ((i.price || 0) - (i.cost || 0)) * i.qty, 0), 0);
  const totalIngresos = state.sales.reduce((s, v) => s + (v.total || 0), 0);

  return `
  <div class="section-title">Ventas</div>
  <div class="summary-grid">
    <div class="summary-card" style="background:#daeadd;"><div class="summary-val" style="color:var(--success);">${fmtMoney(todayTotal)}</div><div class="summary-label">Ventas hoy</div></div>
    <div class="summary-card" style="background:#e8edd8;"><div class="summary-val" style="color:var(--olive);">${fmtMoney(todayProfit)}</div><div class="summary-label">Ganancia hoy</div></div>
    <div class="summary-card" style="background:#f5f0e8;border:1px solid var(--cream-mid);"><div class="summary-val" style="color:var(--text);">${state.sales.length}</div><div class="summary-label">Total ventas</div></div>
    <div class="summary-card" style="background:#f5f0e8;border:1px solid var(--cream-mid);"><div class="summary-val" style="color:var(--gold);">${fmtMoney(totalIngresos)}</div><div class="summary-label">Ingreso total</div></div>
  </div>
  <div style="font-family:'Playfair Display',serif;font-size:18px;margin-bottom:12px;color:var(--text);">Historial</div>
  ${state.sales.length === 0 ? `<div class="empty">${icons.check}<p>Sin ventas aún.</p></div>` : ''}
  ${state.sales.slice(0, 40).map(s => `
  <div class="card" style="padding:14px;margin-bottom:10px;">
    <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:6px;">
      <span style="font-weight:600;font-size:15px;">${s.client || 'Cliente'}</span>
      <div style="display:flex;align-items:center;gap:6px;">
        ${s.priceMode ? `<span style="font-size:10px;font-weight:700;padding:2px 7px;border-radius:20px;${s.priceMode === 'mayoreo' ? 'background:#f0ead8;color:#7a6230;' : 'background:#daeadd;color:var(--success);'}">${s.priceMode === 'mayoreo' ? 'May' : 'Men'}</span>` : ''}
        <span style="font-size:11px;color:var(--text-light);">${s.date ? new Date(s.date).toLocaleDateString('es-MX') : ''}</span>
      </div>
    </div>
    <div style="font-size:12px;color:var(--text-light);margin-bottom:8px;">${(s.items || []).map(i => `${i.name} ×${i.qty}`).join(', ')}</div>
    <div style="display:flex;justify-content:space-between;align-items:center;">
      <span style="font-family:'Playfair Display',serif;font-size:20px;color:var(--olive);">${fmtMoney(s.total)}</span>
      <div style="display:flex;align-items:center;gap:8px;">
        <span style="font-size:13px;color:var(--success);font-weight:500;">+${fmtMoney((s.items || []).reduce((ss, i) => ss + ((i.price || 0) - (i.cost || 0)) * i.qty, 0))}</span>
        <button class="icon-btn" onclick="deleteSale('${s.id}')" style="background:#f0dada;">${icons.trash}</button>
      </div>
    </div>
  </div>`).join('')}`;
}

window.deleteSale = async function(id) {
  const s = state.sales.find(x => x.id === id);
  if (!s) return;
  if (!confirm(`¿Eliminar venta de ${s.client || 'Cliente'}?`)) return;
  const restore = confirm('¿Regresar los productos al stock?\n\nOK = SÍ restaurar\nCancelar = No restaurar');
  if (restore) {
    for (const item of (s.items || [])) {
      const p = state.products.find(x => x.id === item.id);
      if (p) await updateItem('products', p.id, { stock: (p.stock || 0) + (item.qty || 0) });
    }
    toast('Venta eliminada · Stock restaurado ✓');
  } else toast('Venta eliminada');
  await deleteItem('sales', id);
};