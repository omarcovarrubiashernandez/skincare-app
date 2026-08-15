import { state } from './state.js';
import { fmtMoney, toast, showModal, icons } from './utils.js';
import { addItem, updateItem, deleteItem } from './firebase.js';

export function renderCreditSales() {
  const pending = state.creditSales.filter(c => c.status !== 'pagado');
  const done = state.creditSales.filter(c => c.status === 'pagado');
  const totalPendiente = pending.reduce((s, c) => s + (c.pendiente || 0), 0);
  const totalPagosLibres = state.pagosLibres.reduce((s, p) => s + (p.amount || 0), 0);

  return `
  <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:18px;">
    <div class="section-title" style="margin-bottom:0;">Abonos</div>
    <button class="btn btn-gold btn-sm" onclick="openPagoLibreModal()">+ Pago recibido</button>
  </div>
  <div class="summary-grid" style="margin-bottom:20px;">
    <div class="summary-card" style="background:#f0ead8;"><div class="summary-val" style="color:#7a6230;">${fmtMoney(totalPendiente)}</div><div class="summary-label">Por cobrar</div></div>
    <div class="summary-card" style="background:#f5f0e8;border:1px solid var(--cream-mid);"><div class="summary-val" style="color:var(--text);">${pending.length}</div><div class="summary-label">Clientes activos</div></div>
    <div class="summary-card" style="background:#daeadd;"><div class="summary-val" style="color:var(--success);">${fmtMoney(state.creditSales.reduce((s, c) => s + (c.pagado || 0), 0))}</div><div class="summary-label">Total cobrado</div></div>
    <div class="summary-card" style="background:#e8edd8;"><div class="summary-val" style="color:var(--olive);">${fmtMoney(totalPagosLibres)}</div><div class="summary-label">Pagos recibidos</div></div>
  </div>
  ${state.pagosLibres.length > 0 ? `
  <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
    <div style="font-family:'Playfair Display',serif;font-size:18px;color:var(--text);">Pagos recibidos</div>
  </div>
  <div style="display:flex;flex-direction:column;gap:8px;margin-bottom:24px;">
    ${state.pagosLibres.map(p => `
    <div class="card" style="padding:14px;display:flex;align-items:center;gap:12px;">
      <div style="width:40px;height:40px;border-radius:10px;background:#daeadd;display:flex;align-items:center;justify-content:center;flex-shrink:0;font-size:18px;">💵</div>
      <div style="flex:1;min-width:0;">
        <div style="font-weight:600;font-size:14px;">${p.person || 'Sin nombre'}</div>
        <div style="font-size:12px;color:var(--text-light);">${p.date ? new Date(p.date).toLocaleDateString('es-MX') : ''}</div>
        ${p.description ? `<div style="font-size:12px;color:var(--text-mid);margin-top:3px;">${p.description}</div>` : ''}
      </div>
      <div style="display:flex;align-items:center;gap:8px;flex-shrink:0;">
        <span style="font-family:'Playfair Display',serif;font-size:18px;color:var(--success);">+${fmtMoney(p.amount)}</span>
        <button class="icon-btn" onclick="deletePagoLibre('${p.id}')" style="background:#f0dada;">${icons.trash}</button>
      </div>
    </div>`).join('')}
  </div>` : ''}
  ${pending.length === 0 && done.length === 0 ? `<div class="empty">${icons.pkg}<p>Sin ventas a crédito registradas.</p><p style="font-size:12px;margin-top:8px;">Crea una cotización y usa el botón "💳 Abono"</p></div>` : ''}
  ${pending.length > 0 ? `<div style="font-family:'Playfair Display',serif;font-size:18px;margin-bottom:12px;color:var(--text);">Pendientes de cobro</div>` : ''}
  ${pending.map(c => renderCreditCard(c)).join('')}
  ${done.length > 0 ? `<div style="font-family:'Playfair Display',serif;font-size:18px;margin:20px 0 12px;color:var(--text);">Liquidadas</div>` : ''}
  ${done.map(c => renderCreditCard(c, true)).join('')}`;
}

function renderCreditCard(c, done = false) {
  const pct = c.total > 0 ? Math.min(100, Math.round((c.pagado || 0) / c.total * 100)) : 0;
  return `
  <div class="card" style="padding:16px;margin-bottom:12px;${done ? 'opacity:.75' : ''}">
    <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:10px;">
      <div>
        <div style="font-weight:700;font-size:16px;">${c.client || 'Sin nombre'}</div>
        <div style="font-size:12px;color:var(--text-light);">${c.date ? new Date(c.date).toLocaleDateString('es-MX') : ''}</div>
        <div style="font-size:12px;color:var(--text-light);margin-top:3px;">${(c.items || []).map(i => `${i.name} ×${i.qty}`).join(', ')}</div>
      </div>
      <span class="pill ${done ? 'pill-sold' : 'pill-pending'}">${done ? 'Liquidada' : 'Pendiente'}</span>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-bottom:12px;text-align:center;">
      <div style="background:var(--cream-dark);border-radius:8px;padding:8px;">
        <div style="font-size:10px;color:var(--text-light);margin-bottom:2px;">Total</div>
        <div style="font-family:'Playfair Display',serif;font-size:16px;color:var(--text);">${fmtMoney(c.total)}</div>
      </div>
      <div style="background:#daeadd;border-radius:8px;padding:8px;">
        <div style="font-size:10px;color:var(--text-light);margin-bottom:2px;">Pagado</div>
        <div style="font-family:'Playfair Display',serif;font-size:16px;color:var(--success);">${fmtMoney(c.pagado || 0)}</div>
      </div>
      <div style="background:${(c.pendiente || 0) > 0 ? '#f0ead8' : '#daeadd'};border-radius:8px;padding:8px;">
        <div style="font-size:10px;color:var(--text-light);margin-bottom:2px;">Resta</div>
        <div style="font-family:'Playfair Display',serif;font-size:16px;color:${(c.pendiente || 0) > 0 ? '#7a6230' : 'var(--success)'};">${fmtMoney(c.pendiente || 0)}</div>
      </div>
    </div>
    <div style="margin-bottom:12px;">
      <div style="display:flex;justify-content:space-between;margin-bottom:4px;">
        <span style="font-size:11px;color:var(--text-light);">Progreso de pago</span>
        <span style="font-size:11px;font-weight:600;color:var(--olive);">${pct}%</span>
      </div>
      <div style="height:8px;background:var(--cream-dark);border-radius:10px;overflow:hidden;">
        <div style="height:100%;width:${pct}%;background:var(--olive);border-radius:10px;transition:width .5s;"></div>
      </div>
    </div>
    ${(c.pagos || []).length > 0 ? `
    <div style="margin-bottom:12px;">
      <div style="font-size:11px;font-weight:600;letter-spacing:.5px;text-transform:uppercase;color:var(--text-light);margin-bottom:6px;">Historial de abonos</div>
      ${(c.pagos || []).map((p, pi) => `
      <div class="abono-row">
        <div>
          <span class="abono-badge">Abono #${pi + 1}</span>
          ${p.note ? `<span style="font-size:12px;color:var(--text-light);margin-left:6px;">${p.note}</span>` : ''}
          <div style="font-size:11px;color:var(--text-light);margin-top:2px;">${p.date ? new Date(p.date).toLocaleDateString('es-MX', '') : ''}</div>
        </div>
        <span style="font-weight:700;color:var(--success);font-size:14px;">+${fmtMoney(p.amount)}</span>
      </div>`).join('')}
    </div>` : ''}
    <div style="display:flex;gap:8px;flex-wrap:wrap;">
      ${!done ? `<button class="btn btn-primary btn-sm" onclick="openAbonoModal('${c.id}')">+ Registrar abono</button>` : ''}
      <button class="btn btn-danger btn-sm" onclick="deleteCreditSale('${c.id}')">Eliminar</button>
    </div>
  </div>`;
}

window.openAbonoModal = function(id) {
  const c = state.creditSales.find(x => x.id === id);
  if (!c) return;
  showModal('modalAbono', `
    <div class="modal-header"><div class="modal-title">Registrar abono</div><button class="modal-close" onclick="closeModal('modalAbono')">×</button></div>
    <p style="font-size:14px;color:var(--text-light);margin-bottom:4px;">Cliente: <strong style="color:var(--text);">${c.client || 'Sin nombre'}</strong></p>
    <p style="font-size:14px;color:var(--text-light);margin-bottom:16px;">Saldo pendiente: <strong style="color:var(--danger);">${fmtMoney(c.pendiente || 0)}</strong></p>
    <div class="field"><label>Monto del abono $</label><input id="abonoAmount" type="number" placeholder="0" max="${c.pendiente || 0}"></div>
    <div class="field"><label>Nota (opcional)</label><input id="abonoNote" placeholder="Ej: Transferencia, efectivo..."></div>
    <button class="btn btn-primary btn-full" onclick="saveAbono('${id}')">Guardar abono</button>
  `);
};

window.saveAbono = async function(id) {
  const c = state.creditSales.find(x => x.id === id);
  if (!c) return;
  const amount = +document.getElementById('abonoAmount').value;
  const note = document.getElementById('abonoNote').value.trim();
  if (!amount || amount <= 0) { toast('Ingresa un monto', 'err'); return; }
  if (amount > (c.pendiente || 0)) { toast(`El abono no puede ser mayor al pendiente (${fmtMoney(c.pendiente)})`, 'err'); return; }
  const pagos = [...(c.pagos || []), { amount, note, date: new Date().toISOString() }];
  const pagado = (c.pagado || 0) + amount;
  const pendiente = Math.max(0, (c.total || 0) - pagado);
  const status = pendiente <= 0 ? 'pagado' : 'pendiente';
  if (status === 'pagado') {
    await addItem('sales', { client: c.client || '', items: c.items || [], total: c.total || 0, date: new Date().toISOString(), note: 'Crédito liquidado' });
    toast('¡Crédito liquidado! Venta registrada ✓');
  } else {
    toast(`Abono de ${fmtMoney(amount)} registrado ✓`);
  }
  await updateItem('creditSales', id, { pagos, pagado, pendiente, status });
  closeModal('modalAbono');
};

window.deleteCreditSale = async function(id) {
  if (!confirm('¿Eliminar esta venta a crédito?')) return;
  await deleteItem('creditSales', id);
  toast('Eliminada');
};

window.openPagoLibreModal = function() {
  showModal('modalPagoLibre', `
    <div class="modal-header"><div class="modal-title">Registrar pago recibido</div><button class="modal-close" onclick="closeModal('modalPagoLibre')">×</button></div>
    <div class="field"><label>Persona / Cliente</label><input id="plPerson" placeholder="Ej: María García"></div>
    <div class="field"><label>Monto recibido $</label><input id="plAmount" type="number" placeholder="0"></div>
    <div class="field"><label>Descripción (opcional)</label><textarea id="plDesc" placeholder="Ej: Pago de deuda de enero, transferencia..."></textarea></div>
    <button class="btn btn-gold btn-full" onclick="savePagoLibre()">Guardar pago</button>
  `);
};

window.savePagoLibre = async function() {
  const person = document.getElementById('plPerson').value.trim();
  const amount = +document.getElementById('plAmount').value;
  const description = document.getElementById('plDesc').value.trim();
  if (!person) { toast('Escribe el nombre de la persona', 'err'); return; }
  if (!amount || amount <= 0) { toast('Ingresa un monto válido', 'err'); return; }
  await addItem('pagosLibres', { person, amount, description, date: new Date().toISOString() });
  toast(`Pago de ${fmtMoney(amount)} registrado ✓`);
  closeModal('modalPagoLibre');
};

window.deletePagoLibre = async function(id) {
  if (!confirm('¿Eliminar este pago?')) return;
  await deleteItem('pagosLibres', id);
  toast('Pago eliminado');
};