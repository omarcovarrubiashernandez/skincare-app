// ═══════════════════════════════════════════════════════════
// EDITOR EN LOTE — Aplo Blossom
// Módulo independiente. Solo puede modificar `name` y `description`
// de documentos que YA existen en la colección `products`.
// No crea, no borra, no toca precio, stock, imagen ni kitItems.
// ═══════════════════════════════════════════════════════════
import { db } from './firebase.js';
import { state } from './state.js';
import { toast } from './utils.js';

const COL = 'products';
const CAMPOS = ['name', 'description'];   // únicos campos que se escriben
const LOTE = 400;                         // Firestore admite 500 por batch

const esc = s => String(s ?? '').replace(/[&<>"']/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function descargar(nombre, obj) {
  const blob = new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = nombre;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

const fecha = () => new Date().toISOString().slice(0, 10);

// ── 1) Exportar solo lo que se va a editar ──────────────────
function exportarParaEditar() {
  const rows = state.products.map(p => ({
    id: p.id,
    name: p.name || '',
    description: p.description || '',
    // contexto de solo lectura (se ignora al importar)
    category: p.category || '',
    isKit: !!p.isKit
  }));
  descargar(`aplo-productos-editar-${fecha()}.json`, rows);
  toast(`Exportados ${rows.length} productos`);
}

// ── 2) Respaldo completo (todos los campos) ─────────────────
function respaldoCompleto() {
  descargar(`aplo-respaldo-productos-${fecha()}.json`, state.products);
  toast(`Respaldo de ${state.products.length} productos descargado`);
}

// ── 3) Leer archivo y calcular cambios (sin escribir) ───────
let cambiosPendientes = [];

function calcularCambios(rows) {
  const porId = new Map(state.products.map(p => [p.id, p]));
  const cambios = [];
  let omitidos = 0, sinCambio = 0;

  for (const r of rows) {
    const actual = r && porId.get(r.id);
    if (!actual) { omitidos++; continue; }              // id inexistente: se salta, NO se crea
    const nuevo = {};
    for (const c of CAMPOS) {
      if (typeof r[c] !== 'string') continue;           // campo ausente: no se toca
      const v = r[c].trim();
      if (c === 'name' && !v) continue;                 // nunca dejar un nombre vacío
      if (v !== (actual[c] || '')) nuevo[c] = v;
    }
    if (Object.keys(nuevo).length) cambios.push({ id: r.id, antes: actual, nuevo });
    else sinCambio++;
  }
  return { cambios, omitidos, sinCambio };
}

function pintarVistaPrevia(panel, res) {
  cambiosPendientes = res.cambios;
  const filas = res.cambios.slice(0, 200).map(c => {
    const partes = Object.entries(c.nuevo).map(([campo, v]) => `
      <div style="margin:4px 0">
        <b>${campo === 'name' ? 'Nombre' : 'Descripción'}</b><br>
        <span style="color:#b04a4a;text-decoration:line-through;white-space:pre-wrap">${esc(c.antes[campo] || '(vacío)')}</span><br>
        <span style="color:#2f7d4f;white-space:pre-wrap">${esc(v)}</span>
      </div>`).join('');
    return `<div style="border-bottom:1px solid #eee;padding:8px 0;font-size:13px">${partes}</div>`;
  }).join('');

  panel.innerHTML = `
    <p style="margin:0 0 8px"><b>${res.cambios.length}</b> productos cambiarán ·
      ${res.sinCambio} sin cambios · ${res.omitidos} omitidos (id no existe)</p>
    ${res.cambios.length > 200 ? '<p style="font-size:12px;color:#888">Mostrando los primeros 200.</p>' : ''}
    <div style="max-height:45vh;overflow:auto;border:1px solid #eee;border-radius:8px;padding:0 10px">${filas || '<p>No hay nada que aplicar.</p>'}</div>
    <div style="display:flex;gap:8px;margin-top:12px">
      <button id="elApply" ${res.cambios.length ? '' : 'disabled'} style="flex:1;padding:10px;border:0;border-radius:8px;background:#2f7d4f;color:#fff;font-weight:600">Aplicar ${res.cambios.length} cambios</button>
      <button id="elCancel" style="padding:10px 14px;border:1px solid #ccc;border-radius:8px;background:#fff">Cancelar</button>
    </div>`;

  panel.querySelector('#elCancel').onclick = () => { cambiosPendientes = []; panel.innerHTML = ''; };
  panel.querySelector('#elApply').onclick = () => aplicar(panel);
}

// ── 4) Aplicar: solo update() de name/description ───────────
async function aplicar(panel) {
  const btn = panel.querySelector('#elApply');
  btn.disabled = true;
  btn.textContent = 'Aplicando…';
  try {
    for (let i = 0; i < cambiosPendientes.length; i += LOTE) {
      const batch = db.batch();
      for (const c of cambiosPendientes.slice(i, i + LOTE)) {
        batch.update(db.collection(COL).doc(c.id), c.nuevo);   // update, nunca set/delete
      }
      await batch.commit();
    }
    toast(`${cambiosPendientes.length} productos actualizados`);
    cambiosPendientes = [];
    panel.innerHTML = '<p style="color:#2f7d4f"><b>Listo.</b> Los cambios ya están en Firestore.</p>';
  } catch (e) {
    console.error(e);
    toast('Error al aplicar: ' + e.message, 'err');
    btn.disabled = false;
    btn.textContent = 'Reintentar';
  }
}

function leerArchivo(file, panel) {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const rows = JSON.parse(reader.result);
      if (!Array.isArray(rows)) throw new Error('El JSON debe ser una lista de productos');
      pintarVistaPrevia(panel, calcularCambios(rows));
    } catch (e) {
      panel.innerHTML = `<p style="color:#b04a4a">Archivo inválido: ${esc(e.message)}</p>`;
    }
  };
  reader.readAsText(file);
}

// ── UI: botón flotante + panel ──────────────────────────────
function abrirPanel() {
  if (document.getElementById('editorLoteOverlay')) return;
  const ov = document.createElement('div');
  ov.id = 'editorLoteOverlay';
  ov.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:99999;display:flex;align-items:center;justify-content:center;padding:12px';
  ov.innerHTML = `
    <div style="background:#fff;color:#222;border-radius:14px;max-width:560px;width:100%;max-height:92vh;overflow:auto;padding:16px;font-family:inherit">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
        <b style="font-size:16px">Editar nombres y descripciones en lote</b>
        <button id="elClose" style="border:0;background:none;font-size:22px;line-height:1">×</button>
      </div>
      <p style="font-size:13px;color:#666;margin:0 0 10px">Solo se modifican <b>nombre</b> y <b>descripción</b>. No se crea ni se borra nada.</p>
      <div style="display:flex;flex-direction:column;gap:8px">
        <button id="elBackup" style="padding:10px;border:1px solid #ccc;border-radius:8px;background:#fff">1) Descargar respaldo completo</button>
        <button id="elExport" style="padding:10px;border:1px solid #ccc;border-radius:8px;background:#fff">2) Exportar para editar (JSON)</button>
        <label style="padding:10px;border:1px dashed #999;border-radius:8px;text-align:center;cursor:pointer">
          3) Importar JSON corregido
          <input id="elFile" type="file" accept="application/json,.json" style="display:none">
        </label>
      </div>
      <div id="elPanel" style="margin-top:12px"></div>
    </div>`;
  document.body.appendChild(ov);

  const cerrar = () => { cambiosPendientes = []; ov.remove(); };
  ov.querySelector('#elClose').onclick = cerrar;
  ov.addEventListener('click', e => { if (e.target === ov) cerrar(); });
  ov.querySelector('#elBackup').onclick = respaldoCompleto;
  ov.querySelector('#elExport').onclick = exportarParaEditar;
  ov.querySelector('#elFile').onchange = e => {
    const f = e.target.files[0];
    if (f) leerArchivo(f, ov.querySelector('#elPanel'));
    e.target.value = '';
  };
}

function montarBoton() {
  if (document.getElementById('editorLoteBtn')) return;
  const b = document.createElement('button');
  b.id = 'editorLoteBtn';
  b.textContent = '✎ Editar en lote';
  b.style.cssText = 'position:fixed;right:12px;bottom:84px;z-index:9999;padding:8px 12px;border:0;border-radius:999px;background:#222;color:#fff;font-size:12px;opacity:.85;box-shadow:0 2px 8px rgba(0,0,0,.25)';
  b.onclick = abrirPanel;
  document.body.appendChild(b);
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', montarBoton);
else montarBoton();
