import { state } from './state.js';
import { fmtMoney, toast, showModal, icons, EXPENSE_CATS } from './utils.js';
import { addItem, deleteItem } from './firebase.js';

// ══════════════════════════════════════════
// FINANZAS
// ══════════════════════════════════════════
let finPeriod = 'month';

// Refresca solo la pestaña Finanzas. Mismo patrón que _refreshQuoteTab
// en cotizar.js: evita depender de currentTab/renderTab de main.js
// (import circular) para cambios que solo afectan esta vista local.
function _refreshFinanceTab() {
  const c = document.getElementById('mainContent');
  if (!c) return;
  c.innerHTML = renderFinances();
}

export function renderFinances() {
  const now = new Date();
  let filtSales = state.sales, filtExp = state.expenses, filtCredit = state.creditSales, filtPagos = state.pagosLibres;

  if (finPeriod === 'week') {
    const d = new Date(now); d.setDate(d.getDate() - 7);
    filtSales = filtSales.filter(s => s.date && new Date(s.date) >= d);
    filtExp = filtExp.filter(e => e.date && new Date(e.date) >= d);
    filtCredit = filtCredit.filter(c => c.date && new Date(c.date) >= d);
    filtPagos = filtPagos.filter(p => p.date && new Date(p.date) >= d);
  } else if (finPeriod === 'month') {
    const d = new Date(now); d.setMonth(d.getMonth() - 1);
    filtSales = filtSales.filter(s => s.date && new Date(s.date) >= d);
    filtExp = filtExp.filter(e => e.date && new Date(e.date) >= d);
    filtCredit = filtCredit.filter(c => c.date && new Date(c.date) >= d);
    filtPagos = filtPagos.filter(p => p.date && new Date(p.date) >= d);
  }

  // 1. CÁLCULO DE INGRESOS Y EGRESOS REALES
  const ingresosVentas = filtSales.reduce((s, v) => s + (v.total || 0), 0);
  const ingresosPagosLibres = filtPagos.reduce((s, p) => s + (p.amount || 0), 0);
  const totalIngresos = ingresosVentas + ingresosPagosLibres;

  const costoProductosVendidos = filtSales.reduce((s, v) => s + (v.items || []).reduce((ss, i) => ss + ((i.cost || 0) * (i.qty || 0)), 0), 0);
  const gastosOperativos = filtExp.reduce((s, e) => s + (e.amount || 0), 0);
  const totalEgresos = costoProductosVendidos + gastosOperativos;

  const gananciaNeta = totalIngresos - totalEgresos;
  const margenNeta = totalIngresos > 0 ? Math.round((gananciaNeta / totalIngresos) * 100) : 0;

  // Valor total del inventario en almacén
  const valorInventarioVenta = state.products.reduce((s, p) => s + ((p.price || 0) * (p.stock || 0)), 0);
  const valorInventarioCosto = state.products.reduce((s, p) => s + ((p.cost || 0) * (p.stock || 0)), 0);
  const gananciaInventarioPendiente = valorInventarioVenta - valorInventarioCosto;

  // 2. RENTABILIDAD POR PRODUCTO Y CATEGORÍA
  const prodProfitMap = {};
  const catProfitMap = {};

  filtSales.forEach(s => {
    (s.items || []).forEach(i => {
      const revenue = (i.price || 0) * (i.qty || 0);
      const cost = (i.cost || 0) * (i.qty || 0);
      const profit = revenue - cost;
      const cat = i.category || 'Otros';

      if (!prodProfitMap[i.id]) prodProfitMap[i.id] = { name: i.name, qty: 0, revenue: 0, cost: 0, profit: 0 };
      prodProfitMap[i.id].qty += (i.qty || 0);
      prodProfitMap[i.id].revenue += revenue;
      prodProfitMap[i.id].cost += cost;
      prodProfitMap[i.id].profit += profit;

      if (!catProfitMap[cat]) catProfitMap[cat] = { revenue: 0, profit: 0, qty: 0 };
      catProfitMap[cat].revenue += revenue;
      catProfitMap[cat].profit += profit;
      catProfitMap[cat].qty += (i.qty || 0);
    });
  });

  const sortedProdProfit = Object.values(prodProfitMap).sort((a, b) => b.profit - a.profit);
  const sortedCatProfit = Object.entries(catProfitMap).map(([cat, d]) => ({ category: cat, ...d })).sort((a, b) => b.profit - a.profit);

  // 3. MOVIMIENTOS DE DINERO DEL PERIODO (LIBRO DIARIO)
  const movimientos = [];
  filtSales.forEach(s => movimientos.push({ type: 'ingreso', concept: `Venta - ${s.client || 'Cliente'}`, category: 'Ventas Directas', amount: s.total || 0, date: s.date }));
  filtPagos.forEach(p => movimientos.push({ type: 'ingreso', concept: `Pago recibido - ${p.person}`, category: 'Pagos Libres', amount: p.amount || 0, date: p.date }));
  filtExp.forEach(e => movimientos.push({ type: 'egreso', concept: e.concept || 'Gasto', category: e.category || 'General', amount: e.amount || 0, date: e.date }));

  movimientos.sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));

  setTimeout(() => renderFinanceCharts(totalIngresos, costoProductosVendidos, gastosOperativos, gananciaNeta, sortedCatProfit), 100);

  return `
  <div class="section-title">Centro de Control Financiero</div>

  <div class="period-tabs">
    <button class="period-tab${finPeriod === 'week' ? ' active' : ''}" onclick="window._fPeriod('week')">Esta semana</button>
    <button class="period-tab${finPeriod === 'month' ? ' active' : ''}" onclick="window._fPeriod('month')">Este mes</button>
    <button class="period-tab${finPeriod === 'all' ? ' active' : ''}" onclick="window._fPeriod('all')">Histórico Todo</button>
  </div>

  <div class="summary-grid">
    <div class="summary-card" style="background:#daeadd;">
      <div class="summary-val" style="color:var(--success);">${fmtMoney(totalIngresos)}</div>
      <div class="summary-label">Ingresos Reales</div>
    </div>
    <div class="summary-card" style="background:#f0dada;">
      <div class="summary-val" style="color:var(--danger);">${fmtMoney(totalEgresos)}</div>
      <div class="summary-label">Costo Prod. + Gastos</div>
    </div>
    <div class="summary-card" style="background:${gananciaNeta >= 0 ? '#e8edd8' : '#f0dada'};">
      <div class="summary-val" style="color:${gananciaNeta >= 0 ? 'var(--olive)' : 'var(--danger)'};">${fmtMoney(gananciaNeta)}</div>
      <div class="summary-label">Ganancia Neta Limpia</div>
    </div>
    <div class="summary-card" style="background:#f5f0e8;border:1px solid var(--cream-mid);">
      <div class="summary-val" style="color:var(--gold);">${margenNeta}%</div>
      <div class="summary-label">Margen Libre</div>
    </div>
  </div>

  <div class="card" style="padding:16px;margin-bottom:20px;background:var(--cream-dark);">
    <div style="font-size:12px;font-weight:700;letter-spacing:.5px;text-transform:uppercase;color:var(--text-light);margin-bottom:8px;">Inventario Actual en Almacén</div>
    <div class="three-col">
      <div>
        <div style="font-size:11px;color:var(--text-mid);">Valor de Venta</div>
        <div style="font-family:'Playfair Display',serif;font-size:18px;font-weight:700;color:var(--olive);">${fmtMoney(valorInventarioVenta)}</div>
      </div>
      <div>
        <div style="font-size:11px;color:var(--text-mid);">Costo Invertido</div>
        <div style="font-family:'Playfair Display',serif;font-size:18px;font-weight:700;color:var(--text-mid);">${fmtMoney(valorInventarioCosto)}</div>
      </div>
      <div>
        <div style="font-size:11px;color:var(--text-mid);">Ganancia Proyectada Al Vender</div>
        <div style="font-family:'Playfair Display',serif;font-size:18px;font-weight:700;color:var(--gold);">${fmtMoney(gananciaInventarioPendiente)}</div>
      </div>
    </div>
  </div>

  <div class="card" style="padding:16px;margin-bottom:20px;">
    <div style="font-family:'Playfair Display',serif;font-size:18px;margin-bottom:14px;">Análisis Gráfico de Resultados</div>
    <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(280px, 1fr));gap:20px;">
      <div>
        <div style="font-size:12px;font-weight:600;color:var(--text-light);text-align:center;margin-bottom:8px;">Desglose del Dinero (Ingresos vs Egresos)</div>
        <div style="max-width:240px;margin:0 auto;"><canvas id="finChartPie"></canvas></div>
      </div>
      <div>
        <div style="font-size:12px;font-weight:600;color:var(--text-light);text-align:center;margin-bottom:8px;">Ganancia por Categoría ($)</div>
        <div><canvas id="finChartBar"></canvas></div>
      </div>
    </div>
  </div>

  <div class="card" style="padding:16px;margin-bottom:20px;">
    <div style="font-family:'Playfair Display',serif;font-size:18px;margin-bottom:12px;">Top Productos Más Rentables (Mayor Ganancia)</div>
    <div class="table-responsive">
      <table class="fin-table">
        <thead>
          <tr>
            <th>Producto</th>
            <th>Uds Vendidas</th>
            <th>Ingreso Total</th>
            <th>Costo Total</th>
            <th>Ganancia Limpia</th>
          </tr>
        </thead>
        <tbody>
          ${sortedProdProfit.length === 0 ? '<tr><td colspan="5" style="text-align:center;color:var(--text-light);">Sin datos en el periodo elegido</td></tr>' : ''}
          ${sortedProdProfit.slice(0, 10).map(p => `
            <tr>
              <td style="font-weight:600;">${p.name}</td>
              <td>${p.qty}</td>
              <td>${fmtMoney(p.revenue)}</td>
              <td style="color:var(--danger);">${fmtMoney(p.cost)}</td>
              <td style="color:var(--success);font-weight:700;">${fmtMoney(p.profit)}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  </div>

  <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
    <div style="font-family:'Playfair Display',serif;font-size:18px;color:var(--text);">Registro de Gastos Operativos e Insumos</div>
    <button class="btn btn-primary btn-sm" onclick="openExpenseModal()">+ Registrar Gasto</button>
  </div>

  <div style="margin-bottom:24px;">
    ${filtExp.length === 0 ? `<div class="empty">${icons.pkg}<p>Sin gastos registrados en este periodo.</p></div>` : ''}
    ${filtExp.map(e => `
    <div class="card" style="padding:12px 14px;margin-bottom:8px;display:flex;justify-content:space-between;align-items:center;">
      <div>
        <div style="font-weight:600;font-size:14px;">${e.concept}</div>
        <div style="font-size:11px;color:var(--text-light);">${e.category} · ${e.date ? new Date(e.date).toLocaleDateString('es-MX') : ''}</div>
        ${e.description ? `<div style="font-size:11px;color:var(--text-mid);">${e.description}</div>` : ''}
      </div>
      <div style="display:flex;align-items:center;gap:10px;">
        <span style="font-family:'Playfair Display',serif;font-size:16px;color:var(--danger);font-weight:700;">-${fmtMoney(e.amount)}</span>
        <button class="icon-btn" onclick="deleteExpense('${e.id}')" style="background:#f0dada;">${icons.trash}</button>
      </div>
    </div>`).join('')}
  </div>

  <div style="font-family:'Playfair Display',serif;font-size:18px;margin-bottom:12px;color:var(--text);">Libro Diario de Entradas y Salidas</div>
  <div class="card" style="padding:16px;">
    <div class="table-responsive">
      <table class="fin-table">
        <thead>
          <tr>
            <th>Fecha</th>
            <th>Concepto / Cliente</th>
            <th>Tipo</th>
            <th>Categoría</th>
            <th>Monto</th>
          </tr>
        </thead>
        <tbody>
          ${movimientos.length === 0 ? '<tr><td colspan="5" style="text-align:center;">Sin movimientos de dinero registrados</td></tr>' : ''}
          ${movimientos.map(m => `
            <tr>
              <td style="font-size:11px;color:var(--text-light);">${m.date ? new Date(m.date).toLocaleDateString('es-MX') : ''}</td>
              <td style="font-weight:600;">${m.concept}</td>
              <td><span class="pill ${m.type === 'ingreso' ? 'pill-ok' : 'pill-low'}">${m.type.toUpperCase()}</span></td>
              <td style="font-size:12px;">${m.category}</td>
              <td style="font-weight:700;color:${m.type === 'ingreso' ? 'var(--success)' : 'var(--danger)'};">
                ${m.type === 'ingreso' ? '+' : '-'}${fmtMoney(m.amount)}
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  </div>`;
}

function renderFinanceCharts(ingresos, costos, gastos, ganancia, catData) {
  try {
    const ctxPie = document.getElementById('finChartPie')?.getContext('2d');
    const ctxBar = document.getElementById('finChartBar')?.getContext('2d');

    if (ctxPie) {
      new Chart(ctxPie, {
        type: 'doughnut',
        data: {
          labels: ['Costo Productos', 'Gastos Insumos', 'Ganancia Neta'],
          datasets: [{
            data: [costos, gastos, Math.max(0, ganancia)],
            backgroundColor: ['#b8c4a0', '#e09898', '#4a5240']
          }]
        },
        options: { responsive: true, plugins: { legend: { position: 'bottom' } } }
      });
    }

    if (ctxBar) {
      new Chart(ctxBar, {
        type: 'bar',
        data: {
          labels: catData.map(c => c.category),
          datasets: [{
            label: 'Ganancia ($)',
            data: catData.map(c => c.profit),
            backgroundColor: '#b8955a'
          }]
        },
        options: { responsive: true, scales: { y: { beginAtZero: true } } }
      });
    }
  } catch (e) {
    console.log('Chart error:', e);
  }
}

window._fPeriod = v => { finPeriod = v; _refreshFinanceTab(); };

window.openExpenseModal = function() {
  showModal('modalExpense', `
    <div class="modal-header"><div class="modal-title">Registrar Gasto u Operación</div><button class="modal-close" onclick="closeModal('modalExpense')">×</button></div>
    <div class="field"><label>Concepto del gasto</label><input id="eConcept" placeholder="Ej: Pago Tarjeta Crédito (Coreano), Envío WhatsApp..."></div>
    <div class="field"><label>Monto $</label><input id="eAmount" type="number" placeholder="0"></div>
    <div class="field"><label>Categoría</label><select id="eCat">${EXPENSE_CATS.map(c => `<option>${c}</option>`).join('')}</select></div>
    <div class="field"><label>Descripción (Detalles)</label><textarea id="eDesc" rows="3" placeholder="Detalles de la compra, proveedor, etc..."></textarea></div>
    <button class="btn btn-primary btn-full" onclick="saveExpense()">Guardar Gasto</button>
  `);
};

window.saveExpense = async function() {
  const concept = document.getElementById('eConcept').value.trim();
  const amount = +document.getElementById('eAmount').value;
  if (!concept || !amount) { toast('Completa los campos', 'err'); return; }
  const desc = document.getElementById('eDesc')?.value.trim() || '';
  await addItem('expenses', { concept, amount, category: document.getElementById('eCat').value, description: desc, date: new Date().toISOString() });
  toast('Gasto registrado ✓');
  closeModal('modalExpense');
};

window.deleteExpense = async function(id) {
  if (!confirm('¿Eliminar este gasto?')) return;
  await deleteItem('expenses', id);
  toast('Gasto eliminado');
};