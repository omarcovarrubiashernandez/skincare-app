import { state } from './state.js';
import { fmtMoney, toast, showModal, icons, stripEmoji } from './utils.js';

// Trae window.exportImages y window.openExportImagesModal (efecto
// secundario — este archivo no exporta nada directamente, pero
// catalog.js necesita que se ejecute para que el botón del catálogo
// funcione).
import './exportImages.js';

// ══════════════════════════════════════════
// DESCARGA — Blob + botón visible en modal
// (export: exportImages.js también usa esta función)
// ══════════════════════════════════════════
window._downloadUrl = null;

export function showDownloadModal(title, blob, filename) {
  if (window._downloadUrl) { URL.revokeObjectURL(window._downloadUrl); window._downloadUrl = null; }
  const url = URL.createObjectURL(blob);
  window._downloadUrl = url;
  const sizeKB = Math.round(blob.size / 1024);
  showModal('modalDownloadFile', `
    <div class="modal-header"><div class="modal-title">${title}</div><button class="modal-close" onclick="window._closeDownloadModal()">×</button></div>
    <p style="font-size:13px;color:var(--text-light);margin-bottom:18px;">Tu archivo está listo (${sizeKB} KB). Toca el botón para descargarlo.</p>
    <a href="${url}" download="${filename}" class="btn btn-primary btn-full" style="display:flex;align-items:center;justify-content:center;gap:8px;text-decoration:none;">⬇ Descargar ${filename}</a>
  `);
}

window._closeDownloadModal = function() {
  window.closeModal('modalDownloadFile');
  if (window._downloadUrl) { URL.revokeObjectURL(window._downloadUrl); window._downloadUrl = null; }
};

// ══════════════════════════════════════════
// CATÁLOGO — vista principal
// ══════════════════════════════════════════
export function renderCatalog() {
  const inStock = state.products.filter(p => (p.stock || 0) > 0).length;
  return `
  <div class="section-title">Catálogo</div>
  <div style="font-size:13px;color:var(--text-light);margin-bottom:20px;">${state.products.length} productos · ${inStock} en stock</div>
  <div style="display:flex;flex-direction:column;gap:12px;margin-bottom:28px;">
    <button class="btn btn-primary btn-full" onclick="exportCatalog(true)" style="padding:14px;font-size:15px;">📦 Exportar solo productos en stock</button>
    <button class="btn btn-outline btn-full" onclick="exportCatalog(false)" style="padding:14px;font-size:15px;">📋 Exportar catálogo completo</button>
    <button class="btn btn-gold btn-full" onclick="openExportImagesModal()" style="padding:14px;font-size:15px;">🖼 Exportar imágenes (.zip)</button>
    <button class="btn btn-outline btn-full" onclick="exportStockExcel()" style="padding:14px;font-size:15px;">📊 Exportar inventario (.csv)</button>
  </div>
  <div style="font-family:'Playfair Display',serif;font-size:18px;margin-bottom:14px;color:var(--text);">Vista previa</div>
  <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:12px;">
    ${state.products.map(p => `
    <div class="card" style="padding:0;overflow:hidden;opacity:${(p.stock || 0) === 0 ? '0.5' : '1'};">
      <div style="width:100%;height:120px;background:var(--cream-dark);overflow:hidden;display:flex;align-items:center;justify-content:center;">
        ${p.image ? `<img src="${p.image}" style="width:100%;height:100%;object-fit:cover;">` : `${icons.pkg}`}
      </div>
      <div style="padding:10px;">
        <div style="font-weight:600;font-size:13px;margin-bottom:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${p.name}${p.isKorean ? ' 🇰🇷' : ''}${p.isMini ? ' 🧴' : ''}</div>
        <div style="display:flex;justify-content:space-between;align-items:center;margin-top:6px;">
          <span style="font-family:'Playfair Display',serif;font-size:16px;color:var(--olive);">${fmtMoney(p.price)}</span>
          <span class="pill ${(p.stock || 0) === 0 ? 'pill-low' : 'pill-ok'}" style="font-size:10px;">${(p.stock || 0) === 0 ? 'Agotado' : 'En stock'}</span>
        </div>
        ${p.priceMayoreo ? `<div style="font-size:11px;color:#7a6230;margin-top:3px;">May: ${fmtMoney(p.priceMayoreo)}</div>` : ''}
      </div>
    </div>`).join('')}
  </div>`;
}

// ══════════════════════════════════════════
// BUG FIX #1 — sanitizador de texto para jsPDF
// ══════════════════════════════════════════
function pdfSafe(str) {
  if (!str) return '';
  return String(str)
    .replace(/[\u{1F1E6}-\u{1F1FF}]/gu, '')  // banderas
    .replace(/[\u{1F300}-\u{1FAFF}]/gu, '')  // emoji principales
    .replace(/[\u{2600}-\u{27BF}]/gu, '')    // símbolos/dingbats (☀ ✨ ❤ ✓...)
    .replace(/[\u{2190}-\u{21FF}]/gu, '')    // flechas
    .replace(/[\u{2B00}-\u{2BFF}]/gu, '')    // símbolos varios
    .replace(/[\u{FE00}-\u{FE0F}]/gu, '')    // selectores de variación
    .replace(/\u200D/g, '')                  // zero-width joiner
    .replace(/[\u2018\u2019]/g, "'")         // comillas curvas simples
    .replace(/[\u201C\u201D]/g, '"')         // comillas curvas dobles
    .replace(/[\u2013\u2014]/g, '-')         // guiones en/em dash
    .replace(/\u2026/g, '...')               // puntos suspensivos
    .replace(/[^\x00-\xFF]/g, '')            // red de seguridad
    .replace(/\s+/g, ' ')
    .trim();
}

// ══════════════════════════════════════════
// BUG FIX #2 — carga de imágenes con concurrencia limitada
// (export: exportImages.js también usa esta función)
// ══════════════════════════════════════════
export async function loadImagesLimited(items, loaderFn, concurrency = 6) {
  const results = new Array(items.length);
  let idx = 0;
  async function worker() {
    while (idx < items.length) {
      const current = idx++;
      results[current] = await loaderFn(items[current]);
    }
  }
  await Promise.all(Array.from({ length: concurrency }, () => worker()));
  return results;
}

// ══════════════════════════════════════════
// EXPORTAR INVENTARIO — CSV
// ══════════════════════════════════════════
window.exportStockExcel = function() {
  if (!state.products.length) { toast('No hay productos', 'err'); return; }
  const headers = ['Nombre','Categoría','Tipo de piel','Cantidad','Unidad','Precio Menudeo ($)','Precio Mayoreo ($)','Costo ($)','Stock','Coreano','Mini','Descripción','Imagen (URL)'];
  const escape = v => { const s = String(v == null ? '' : v).replace(/"/g, '""'); return /[",\n]/.test(s) ? '"' + s + '"' : s; };
  const lines = [headers.map(escape).join(','), ...state.products.map(p => [
    p.name || '', p.category || '',
    Array.isArray(p.skin) ? p.skin.join(', ') : (p.skin || ''),
    p.mlVal || '', p.mlUnit || '',
    p.price || 0, p.priceMayoreo || 0, p.cost || 0, p.stock || 0,
    p.isKorean ? 'Sí' : 'No',
    p.isMini ? 'Sí' : 'No',
    p.description || '', p.image || ''
  ].map(escape).join(','))];
  const blob = new Blob(['\uFEFF' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
  const filename = 'inventario-aploblossom-' + new Date().toISOString().slice(0, 10) + '.csv';
  showDownloadModal('CSV listo', blob, filename);
  toast('Inventario listo para descargar ✓');
};

// ══════════════════════════════════════════
// EXPORTAR CATÁLOGO — PDF
// ══════════════════════════════════════════
window.exportCatalog = function(onlyInStock) {
  const prods = onlyInStock ? state.products.filter(p => (p.stock || 0) > 0) : state.products;
  if (!prods.length) { toast('Sin productos para exportar', 'err'); return; }
  toast('Generando PDF...');
  const { jsPDF } = window.jspdf; const doc = new jsPDF({ format: 'a4', unit: 'mm' });
  const clean = str => pdfSafe(str);
  const PW = 210, PH = 297, ML = 12, MR = 12, usableW = PW - ML - MR;
  const IMG_W = 22, COL_IMG = ML, COL_NAME = ML + IMG_W + 5, NAME_W = 45, COL_DESC = COL_NAME + NAME_W + 5, DESC_W = 55, COL_PRICE = COL_DESC + DESC_W + 5, COL_MAY = COL_PRICE + 28;
  const drawHeader = () => { doc.setFillColor(74, 82, 64); doc.rect(0, 0, PW, 18, 'F'); doc.setFont('helvetica', 'bold'); doc.setFontSize(13); doc.setTextColor(245, 240, 232); doc.text('Aplo Blossom', ML, 12); doc.setFont('helvetica', 'normal'); doc.setFontSize(7); doc.setTextColor(184, 149, 90); doc.text(onlyInStock ? 'Productos en stock' : 'Catalogo completo', ML, 16.5); doc.text(new Date().toLocaleDateString('es-MX', { month: 'long', year: 'numeric' }), PW - MR, 16.5, { align: 'right' }); };
  const drawTableHeader = y => { doc.setFillColor(220, 213, 196); doc.rect(ML, y, usableW, 6.5, 'F'); doc.setFont('helvetica', 'bold'); doc.setFontSize(7); doc.setTextColor(74, 82, 64); doc.text('Producto', COL_NAME, y + 4.5); doc.text('Descripcion', COL_DESC, y + 4.5); doc.text('Menudeo', COL_PRICE, y + 4.5); doc.text('Mayoreo', COL_MAY, y + 4.5); return y + 9; };
  drawHeader(); let y = drawTableHeader(22); let rowCount = 0;
  const addRow = (p, imgData) => {
    const IMG_H = 22; const LINE_NAME = 4.2;
    const nameClean = clean(p.name);
    const descClean = clean(p.description);
    const metaClean = clean([p.category, p.mlVal && p.mlUnit !== 'N/A' ? p.mlVal + p.mlUnit : '', p.isKorean ? 'Coreano' : '', p.isMini ? 'Mini' : ''].filter(Boolean).join(' · '));
    doc.setFont('helvetica', 'bold'); doc.setFontSize(8);
    const nameLines = doc.splitTextToSize(nameClean, NAME_W);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7);
    const descLines = descClean ? doc.splitTextToSize(descClean, DESC_W) : [];
    const nameH = nameLines.length * LINE_NAME + (metaClean ? 4.5 : 0);
    const descH = descLines.length * 3.9;
    const rowH = Math.max(IMG_H, nameH, descH) + 8;
    if (y + rowH > PH - 14) { doc.addPage(); drawHeader(); y = drawTableHeader(22); rowCount = 0; }
    if (rowCount % 2 === 1) { doc.setFillColor(250, 247, 242); doc.rect(ML, y, usableW, rowH, 'F'); }
    const imgY = y + (rowH - IMG_H) / 2;
    doc.setFillColor(237, 229, 212); doc.setDrawColor(210, 203, 188); doc.rect(COL_IMG, imgY, IMG_W, IMG_H, 'FD');
    if (imgData) { try { doc.addImage(imgData, COL_IMG, imgY, IMG_W, IMG_H); } catch (e) {} }
    let tx = y + 5; doc.setFont('helvetica', 'bold'); doc.setFontSize(8); doc.setTextColor(30, 30, 24);
    nameLines.forEach(l => { doc.text(l, COL_NAME, tx); tx += LINE_NAME; });
    if (metaClean) { doc.setFont('helvetica', 'normal'); doc.setFontSize(6.5); doc.setTextColor(110, 110, 90); doc.text(metaClean, COL_NAME, tx); }
    let dtx = y + 5; doc.setFont('helvetica', 'normal'); doc.setFontSize(7); doc.setTextColor(80, 78, 68);
    descLines.slice(0, 9).forEach(l => { doc.text(l, COL_DESC, dtx); dtx += 3.9; });
    doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor(74, 82, 64); doc.text(fmtMoney(p.price), COL_PRICE, y + 7);
    if (p.priceMayoreo) { doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor(122, 98, 48); doc.text(fmtMoney(p.priceMayoreo), COL_MAY, y + 7); }
    doc.setDrawColor(222, 214, 200); doc.line(ML, y + rowH, PW - MR, y + rowH); y += rowH; rowCount++;
  };

  const loadImg = p => new Promise(res => {
    if (!p.image) { res(null); return; }
    let done = false;
    const finish = (val) => { if (!done) { done = true; res(val); } };
    const timer = setTimeout(() => finish(null), 8000);
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.src = 'https://images.weserv.nl/?url=' + encodeURIComponent(p.image) + '&output=jpg&q=85';
    img.onload = () => { clearTimeout(timer); finish(img); };
    img.onerror = () => {
      const img2 = new Image();
      img2.crossOrigin = 'anonymous';
      img2.src = p.image;
      img2.onload = () => { clearTimeout(timer); finish(img2); };
      img2.onerror = () => { clearTimeout(timer); finish(null); };
    };
  });

  loadImagesLimited(prods, loadImg, 6).then(imgs => {
    prods.forEach((p, i) => addRow(p, imgs[i]));
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7); doc.setTextColor(160, 155, 140);
    doc.text(prods.length + ' productos · Aplo Blossom', PW / 2, PH - 6, { align: 'center' });
    const filename = 'catalogo-aploblossom-' + (onlyInStock ? 'disponible' : 'completo') + '.pdf';
    const pdfBlob = doc.output('blob');
    showDownloadModal('PDF listo', pdfBlob, filename);
  });
};
