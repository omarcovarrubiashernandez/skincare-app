// ══════════════════════════════════════════
// MAIN — punto de entrada de la app
// Importa todos los módulos, arranca los listeners
// de Firestore y define renderTab()/setTab() globales.
// ══════════════════════════════════════════

window.onerror = function(msg, src, line, col, err) {
  const c = document.getElementById('mainContent');
  if (c) c.innerHTML = '<div style="padding:20px;color:red;font-size:13px;font-family:monospace;word-break:break-all;"><b>JS Error:</b><br>' + msg + '<br>Line: ' + line + '<br>' + (err && err.stack ? err.stack : '') + '</div>';
};

import { state, lowStockThreshold } from './state.js';
import { fmtMoney, toast, showModal, icons } from './utils.js';
import { db, addItem, deleteItem, listenCol } from './firebase.js';

import { renderInventory, renderInvList } from './inventario.js';
import { renderQuote, renderQuoteGrid, cartItems } from './cotizar.js';
import { renderSales } from './ventas.js';
import { renderReports } from './reportes.js';
import { renderFinances } from './finanzas.js';
import { renderCatalog } from './catalogo.js';
import { renderCreditSales } from './abonos.js';

// ── TABS ──────────────────────────────────
let currentTab = 0;

window.setTab = function(i) {
  currentTab = i;
  document.querySelectorAll('.nav-item').forEach((b, j) => b.classList.toggle('active', i === j));
  document.querySelectorAll('.mobile-nav-btn').forEach(b => {
    const id = +b.id.replace('mnav', '');
    b.classList.toggle('active', i === id);
  });
  renderTab();
};

function renderTab() {
  try {
    const c = document.getElementById('mainContent');
    if (!c) return;
    if (currentTab === 0) { if (!document.getElementById('invList')) { c.innerHTML = renderInventory(); } renderInvList(); }
    else if (currentTab === 1) { if (!document.getElementById('quoteGrid')) c.innerHTML = renderQuote(); renderQuoteGrid(); }
    else if (currentTab === 2) c.innerHTML = renderSales();
    else if (currentTab === 3) c.innerHTML = renderReports();
    else if (currentTab === 4) c.innerHTML = renderFinances();
    else if (currentTab === 5) c.innerHTML = renderCatalog();
    else if (currentTab === 6) c.innerHTML = renderCreditSales();
    bindEvents();
  } catch (err) {
    const c = document.getElementById('mainContent');
    if (c) c.innerHTML = '<div style="padding:24px;color:red;font-family:monospace;font-size:13px;word-break:break-all;"><b>Error en tab ' + currentTab + ':</b><br>' + err.message + '<br><br>' + (err.stack || '') + '</div>';
    console.error('renderTab error:', err);
  }
}
function bindEvents() {}

// reportes.js usa este hook genérico para refrescar la pestaña actual
// tras cambiar de período, sin depender de un import circular a main.js.
window._renderCurrentTab = renderTab;

// ── STATS DEL HEADER ──────────────────────
function updateStats() {
  const setAll = (id, val) => document.querySelectorAll('#' + id).forEach(el => el.textContent = val);
  setAll('statProducts', state.products.length);
  const low = state.products.filter(p => (p.stock || 0) <= lowStockThreshold).length;
  setAll('statLow', low);
  const today = new Date().toDateString();
  setAll('statToday', state.sales.filter(s => s.date && new Date(s.date).toDateString() === today).length);
}

// ── SALDO EN CUENTA ───────────────────────
function updateSaldoDisplay() {
  const totalVentas = state.sales.reduce((s, v) => s + (v.total || 0), 0);
  const totalGastos = state.expenses.reduce((s, e) => s + (e.amount || 0), 0);
  const totalDepositos = state.deposits.reduce((s, d) => s + (d.amount || 0), 0);
  const totalPagosLibres = state.pagosLibres.reduce((s, p) => s + (p.amount || 0), 0);
  const totalAbonosParciales = state.creditSales.filter(c => c.status !== 'pagado').reduce((s, c) => s + (c.pagado || 0), 0);
  const saldo = state.saldoBase + totalVentas + totalDepositos + totalPagosLibres + totalAbonosParciales - totalGastos;
  document.querySelectorAll('#headerSaldo').forEach(el => el.textContent = fmtMoney(saldo));
}

window.openSaldoModal = function() {
  const totalVentas = state.sales.reduce((s, v) => s + (v.total || 0), 0);
  const totalGastos = state.expenses.reduce((s, e) => s + (e.amount || 0), 0);
  const totalDepositos = state.deposits.reduce((s, d) => s + (d.amount || 0), 0);
  const totalPagosLibres = state.pagosLibres.reduce((s, p) => s + (p.amount || 0), 0);
  const totalAbonosParciales = state.creditSales.filter(c => c.status !== 'pagado').reduce((s, c) => s + (c.pagado || 0), 0);
  const saldoActual = state.saldoBase + totalVentas + totalDepositos + totalPagosLibres + totalAbonosParciales - totalGastos;
  showModal('modalSaldo', `
    <div class="modal-header">
      <div class="modal-title">Saldo en cuenta</div>
      <button class="modal-close" onclick="closeModal('modalSaldo')">×</button>
    </div>
    <div style="background:var(--cream-dark);border-radius:var(--radius-sm);padding:14px;margin-bottom:16px;">
      <div style="font-size:11px;font-weight:600;letter-spacing:.5px;text-transform:uppercase;color:var(--text-light);margin-bottom:4px;">Saldo actual</div>
      <div style="font-family:'Playfair Display',serif;font-size:28px;color:var(--olive);">${fmtMoney(saldoActual)}</div>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:16px;">
      <div style="background:#daeadd;border-radius:10px;padding:10px;text-align:center;">
        <div style="font-size:10px;color:var(--text-light);text-transform:uppercase;letter-spacing:.5px;margin-bottom:3px;">+ Ventas</div>
        <div style="font-weight:600;color:var(--success);font-size:14px;">${fmtMoney(totalVentas)}</div>
      </div>
      <div style="background:#f0dada;border-radius:10px;padding:10px;text-align:center;">
        <div style="font-size:10px;color:var(--text-light);text-transform:uppercase;letter-spacing:.5px;margin-bottom:3px;">− Gastos</div>
        <div style="font-weight:600;color:var(--danger);font-size:14px;">${fmtMoney(totalGastos)}</div>
      </div>
      <div style="background:#e0eaf5;border-radius:10px;padding:10px;text-align:center;">
        <div style="font-size:10px;color:var(--text-light);text-transform:uppercase;letter-spacing:.5px;margin-bottom:3px;">+ Depósitos propios</div>
        <div style="font-weight:600;color:#3a5080;font-size:14px;">${fmtMoney(totalDepositos)}</div>
      </div>
      <div style="background:#daeadd;border-radius:10px;padding:10px;text-align:center;">
        <div style="font-size:10px;color:var(--text-light);text-transform:uppercase;letter-spacing:.5px;margin-bottom:3px;">+ Pagos recibidos</div>
        <div style="font-weight:600;color:var(--success);font-size:14px;">${fmtMoney(totalPagosLibres)}</div>
      </div>
      <div style="background:#f0ead8;border-radius:10px;padding:10px;text-align:center;">
        <div style="font-size:10px;color:var(--text-light);text-transform:uppercase;letter-spacing:.5px;margin-bottom:3px;">+ Abonos parciales</div>
        <div style="font-weight:600;color:#7a6230;font-size:14px;">${fmtMoney(totalAbonosParciales)}</div>
      </div>
      <div style="background:var(--white);border-radius:10px;padding:10px;text-align:center;border:1px solid var(--cream-mid);">
        <div style="font-size:10px;color:var(--text-light);text-transform:uppercase;letter-spacing:.5px;margin-bottom:3px;">Base inicial</div>
        <div style="font-weight:600;color:var(--text);font-size:14px;">${fmtMoney(state.saldoBase)}</div>
      </div>
    </div>
    <div class="field">
      <label>Saldo inicial / base $</label>
      <input id="saldoBaseInput" type="number" placeholder="0" value="${state.saldoBase}">
      <div style="font-size:11px;color:var(--text-light);margin-top:4px;">Dinero que ya tenías antes de usar la app</div>
    </div>
    <div class="divider"></div>
    <div style="font-weight:600;font-size:13px;margin-bottom:10px;color:var(--text);">Agregar depósito propio</div>
    <div class="two-col">
      <div class="field"><label>Monto $</label><input id="depositAmount" type="number" placeholder="0"></div>
      <div class="field"><label>Concepto</label><input id="depositConcept" placeholder="Ej: Inversión personal"></div>
    </div>
    <div style="display:flex;gap:10px;">
      <button class="btn btn-outline btn-full" onclick="saveDeposit()">+ Registrar depósito</button>
      <button class="btn btn-primary btn-full" onclick="saveSaldoBase()">Guardar base</button>
    </div>
    ${state.deposits.length > 0 ? `
    <div class="divider"></div>
    <div style="font-size:12px;color:var(--text-light);margin-bottom:8px;font-weight:600;">Depósitos registrados</div>
    ${state.deposits.slice(0, 5).map(d => `
    <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid var(--cream-mid);">
      <div>
        <div style="font-size:13px;font-weight:500;">${d.concept || 'Depósito'}</div>
        <div style="font-size:11px;color:var(--text-light);">${d.date ? new Date(d.date).toLocaleDateString('es-MX') : ''}</div>
      </div>
      <div style="display:flex;align-items:center;gap:8px;">
        <span style="font-weight:700;color:#3a5080;">${fmtMoney(d.amount)}</span>
        <button onclick="deleteDeposit('${d.id}')" style="background:#f0dada;border:none;border-radius:6px;width:24px;height:24px;cursor:pointer;color:var(--danger);font-size:14px;display:flex;align-items:center;justify-content:center;">×</button>
      </div>
    </div>`).join('')}` : ``}
  `);
};

window.saveDeposit = async function() {
  const amount = +document.getElementById('depositAmount').value;
  const concept = document.getElementById('depositConcept').value.trim() || 'Depósito personal';
  if (!amount || amount <= 0) { toast('Ingresa un monto válido', 'err'); return; }
  await addItem('deposits', { amount, concept, date: new Date().toISOString() });
  toast('Depósito registrado ✓');
  closeModal('modalSaldo');
};

window.deleteDeposit = async function(id) {
  if (!confirm('¿Eliminar este depósito?')) return;
  await deleteItem('deposits', id);
  toast('Depósito eliminado');
  closeModal('modalSaldo');
};

window.saveSaldoBase = async function() {
  const val = +document.getElementById('saldoBaseInput').value || 0;
  await db.collection('config').doc('saldo').set({ base: val });
  state.saldoBase = val;
  updateSaldoDisplay();
  toast('Saldo base guardado ✓');
  closeModal('modalSaldo');
};

// ── LISTENERS DE FIRESTORE ────────────────
// Bug fix: se ordena products por createdAt al recibir el snapshot,
// para que el orden no cambie entre recargas.
listenCol('products', docs => {
  state.products = docs.sort((a, b) => (a.createdAt?.seconds || 0) - (b.createdAt?.seconds || 0));
  renderTab();
  updateStats();
});
listenCol('quotes', docs => {
  state.quotes = docs.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
  // No pisar el carrito mientras el usuario está armando una cotización
  if (currentTab === 1 && cartItems.length > 0) return;
  renderTab();
});
listenCol('sales', docs => {
  state.sales = docs.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
  renderTab();
  updateStats();
  updateSaldoDisplay();
});
listenCol('expenses', docs => {
  state.expenses = docs.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
  renderTab();
  updateSaldoDisplay();
});
listenCol('deposits', docs => {
  state.deposits = docs.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
  updateSaldoDisplay();
});
listenCol('creditSales', docs => {
  state.creditSales = docs.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
  renderTab();
});
listenCol('pagosLibres', docs => {
  state.pagosLibres = docs.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
  renderTab();
  updateSaldoDisplay();
});

db.collection('config').doc('saldo').get().then(snap => {
  state.saldoBase = snap.exists ? (snap.data().base || 0) : 0;
  updateSaldoDisplay();
});

// ── ARRANQUE ───────────────────────────────
renderTab();