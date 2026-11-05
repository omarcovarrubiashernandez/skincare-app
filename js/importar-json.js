// ══════════════════════════════════════════
// IMPORTAR PRODUCTO(S) DESDE JSON
// Pegas el JSON, se abre el formulario ya llenado,
// tú revisas, subes la foto y das Guardar. Nada se guarda solo.
// ══════════════════════════════════════════
import { state } from './state.js';
import { toast, showModal, CATS, SKINS } from './utils.js';

const UNITS = ['ml', 'g', 'oz', 'N/A'];
const CATS_VALIDAS = CATS.filter(c => c !== 'Todos' && c !== 'Kits');

const EJEMPLO = `{
  "name": "L'BEL L'Essential Desmaquillador Bifásico",
  "category": "Maquillaje",
  "skin": ["Todo tipo"],
  "mlVal": "125",
  "mlUnit": "ml",
  "price": 150,
  "priceMayoreo": 100,
  "cost": 70,
  "stock": 1,
  "description": [
    "Desmaquilla a fondo",
    "Desmaquilla lo difícil: Fórmula bifásica que retira maquillaje a prueba de agua sin frotar.",
    "25% complejo con ácido hialurónico: Limpia e hidrata, dejando la piel suave y sin resequedad."
  ],
  "isKorean": false,
  "isMini": false
}`;

const norm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();
const esc = v => String(v == null ? '' : v).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const pick = (o, ...keys) => { for (const k of keys) if (o[k] !== undefined && o[k] !== null && o[k] !== '') return o[k]; return undefined; };
const num = v => { const n = parseFloat(String(v == null ? '' : v).replace(/[^0-9.\-]/g, '')); return isFinite(n) ? n : 0; };
const bool = v => v === true || /^(true|si|sí|yes|1)$/i.test(String(v || '').trim());

function matchFrom(list, value, fallback) {
  const hit = list.find(x => norm(x) === norm(value));
  return hit || fallback;
}

function normalizeProduct(raw) {
  if (!raw || typeof raw !== 'object') throw new Error('Cada producto debe ser un objeto { ... }');
  const name = String(pick(raw, 'name', 'nombre') || '').trim();
  if (!name) throw new Error('A un producto le falta "name"');

  let skinIn = pick(raw, 'skin', 'tipoPiel', 'piel');
  if (!Array.isArray(skinIn)) skinIn = skinIn ? String(skinIn).split(/[,/]/) : [];
  const skin = [...new Set(skinIn.map(x => matchFrom(SKINS, x, null)).filter(Boolean))];

  let desc = pick(raw, 'description', 'descripcion', 'descripción') || '';
  if (Array.isArray(desc)) desc = desc.map(x => String(x).trim()).filter(Boolean).join('\n');

  const unitRaw = pick(raw, 'mlUnit', 'unit', 'unidad');
  const mlRaw = pick(raw, 'mlVal', 'ml', 'cantidad');

  return {
    name,
    category: matchFrom(CATS_VALIDAS, pick(raw, 'category', 'categoria', 'categoría'), 'Otros'),
    skin: skin.length ? skin : ['No aplica'],
    mlVal: mlRaw === undefined ? '' : String(mlRaw).replace(/[^0-9.]/g, ''),
    mlUnit: matchFrom(UNITS, unitRaw, 'ml'),
    price: num(pick(raw, 'price', 'precio', 'menudeo')),
    priceMayoreo: num(pick(raw, 'priceMayoreo', 'mayoreo', 'precioMayoreo')),
    cost: num(pick(raw, 'cost', 'costo')),
    stock: num(pick(raw, 'stock')),
    description: String(desc),
    isKorean: bool(raw.isKorean ?? raw.coreano),
    isMini: bool(raw.isMini ?? raw.mini)
  };
}

export function parseProductsJson(text) {
  let t = String(text || '').trim();
  t = t.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();   // por si se copió con ```json
  if (!t) throw new Error('Pega primero el JSON');
  let data;
  try { data = JSON.parse(t); }
  catch (e) { throw new Error('El JSON no es válido: ' + e.message); }
  if (data && !Array.isArray(data) && Array.isArray(data.products)) data = data.products;
  const arr = Array.isArray(data) ? data : [data];
  if (!arr.length) throw new Error('El JSON no trae productos');
  return arr.map(normalizeProduct);
}

// ── cola de revisión ─────────────────────
let queue = [];
let idx = 0;

function openCurrent() {
  window.openProductModal(null, queue[idx]);
}

window._importReset = () => { queue = []; idx = 0; };

window._importBarHTML = () => {
  if (!queue.length) return '';
  const cur = queue[idx];
  const dup = state.products.some(p => norm(p.name) === norm(cur.name));
  return `
    <div style="background:var(--cream-dark);border:1.5px dashed var(--olive);border-radius:var(--radius-sm);padding:10px 12px;margin-bottom:12px;font-size:13px;">
      <div style="font-weight:600;color:var(--olive);">Importado desde JSON · ${idx + 1} de ${queue.length}</div>
      <div style="color:var(--text-light);margin-top:2px;">Revisa los datos, sube la foto y da Guardar.</div>
      ${dup ? `<div style="color:var(--danger);margin-top:4px;">⚠ Ya existe un producto con este nombre.</div>` : ''}
      ${queue.length > 1 ? `<div style="display:flex;gap:8px;margin-top:8px;">
        <button type="button" class="btn btn-outline btn-sm" onclick="window._importSkip()">Saltar este</button>
        <button type="button" class="btn btn-outline btn-sm" onclick="window._importCancel()">Cancelar importación</button>
      </div>` : ''}
    </div>`;
};

window._importNext = () => {
  if (!queue.length) return;
  idx++;
  if (idx < queue.length) { setTimeout(openCurrent, 150); }
  else { window._importReset(); toast('Importación terminada ✓'); }
};

window._importSkip = () => { window.closeModal('modalProduct'); window._importNext(); };
window._importCancel = () => { window._importReset(); window.closeModal('modalProduct'); toast('Importación cancelada'); };

// ── modal para pegar el JSON ─────────────
window.openImportJsonModal = function () {
  showModal('modalImportJson', `
    <div class="modal-header"><div class="modal-title">Importar desde JSON</div><button class="modal-close" onclick="closeModal('modalImportJson')">×</button></div>
    <div style="font-size:13px;color:var(--text-light);margin-bottom:10px;">Pega el JSON de uno o varios productos. Se abrirá el formulario ya llenado para que lo revises; nada se guarda hasta que tú des Guardar.</div>
    <textarea id="importJsonText" placeholder='{ "name": "...", "category": "...", ... }  o una lista [ {...}, {...} ]'
      style="width:100%;height:220px;font-family:monospace;font-size:12px;border:1.5px solid var(--cream-mid);border-radius:var(--radius-sm);padding:10px 12px;box-sizing:border-box;resize:vertical;outline:none;"></textarea>
    <div id="importJsonErr" style="color:var(--danger);font-size:12px;min-height:16px;margin:6px 0;"></div>
    <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px;">
      <button type="button" class="btn btn-outline btn-sm" onclick="window._importExample()">Insertar ejemplo</button>
      <label class="btn btn-outline btn-sm" style="cursor:pointer;">Cargar archivo .json
        <input type="file" accept=".json,application/json,text/plain" style="display:none" onchange="window._importFile(this)">
      </label>
    </div>
    <button class="btn btn-primary btn-full" onclick="window._importGo()">Revisar y abrir formulario</button>
  `);
};

window._importExample = () => { document.getElementById('importJsonText').value = EJEMPLO; };

window._importFile = async (input) => {
  const f = input.files[0]; if (!f) return;
  document.getElementById('importJsonText').value = await f.text();
};

window._importGo = () => {
  const err = document.getElementById('importJsonErr');
  try {
    const items = parseProductsJson(document.getElementById('importJsonText').value);
    queue = items; idx = 0;
    window.closeModal('modalImportJson');
    openCurrent();
    if (items.length > 1) toast(`${items.length} productos para revisar`);
  } catch (e) {
    err.textContent = e.message;
  }
};
