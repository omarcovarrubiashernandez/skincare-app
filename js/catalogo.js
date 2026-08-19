import { state } from './state.js';
import { fmtMoney, toast, showModal, icons, stripEmoji } from './utils.js';

// ══════════════════════════════════════════
// DESCARGA — Blob + botón visible en modal
// (bug fix: los navegadores móviles bloquean el
// auto-click de un <a> invisible tras un await largo)
// ══════════════════════════════════════════
window._downloadUrl = null;

function showDownloadModal(title, blob, filename) {
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
// EXPORTAR IMÁGENES — con selector de precio
// ══════════════════════════════════════════
window.openExportImagesModal = function() {
  showModal('modalExportImg', `
    <div class="modal-header"><div class="modal-title">Exportar imágenes</div><button class="modal-close" onclick="closeModal('modalExportImg')">×</button></div>
    <div style="font-size:13px;color:var(--text-light);margin-bottom:16px;">Elige qué precio mostrar en las imágenes del catálogo.</div>
    <div style="display:flex;flex-direction:column;gap:10px;margin-bottom:16px;">

      <button class="btn btn-outline btn-full" onclick="closeModal('modalExportImg');exportImages('menudeo')" style="padding:14px;text-align:left;display:flex;align-items:center;gap:12px;">
        <span style="font-size:24px;">🛍</span>
        <div>
          <div style="font-weight:600;">Solo precio menudeo</div>
          <div style="font-size:12px;color:var(--text-light);">Muestra el precio normal de venta</div>
        </div>
      </button>

      <button class="btn btn-outline btn-full" onclick="closeModal('modalExportImg');exportImages('mayoreo')" style="padding:14px;text-align:left;display:flex;align-items:center;gap:12px;border-color:#c8a86a;">
        <span style="font-size:24px;">📦</span>
        <div>
          <div style="font-weight:600;color:#7a6230;">Solo precio mayoreo</div>
          <div style="font-size:12px;color:var(--text-light);">Muestra el precio de mayoreo</div>
        </div>
      </button>

      <button class="btn btn-primary btn-full" onclick="closeModal('modalExportImg');exportImages('ambos')" style="padding:14px;text-align:left;display:flex;align-items:center;gap:12px;">
        <span style="font-size:24px;">🏷</span>
        <div>
          <div style="font-weight:600;">Menudeo + Mayoreo</div>
          <div style="font-size:12px;color:rgba(245,240,232,.75);">Muestra ambos precios en la imagen para comparar</div>
        </div>
      </button>

    </div>
  `);
};

// ══════════════════════════════════════════
// BUG FIX #1 — sanitizador de texto para jsPDF
// jsPDF usa la fuente estándar Helvetica, que solo entiende el
// alfabeto Latin-1/WinAnsi (256 caracteres). stripEmoji() no
// cubre TODOS los símbolos posibles (☀️✨💧 comillas curvas,
// guiones largos, etc). Cualquier residuo que se le cuele rompe
// el cálculo de ancho de letra en jsPDF: aparece el símbolo "þ"
// (byte 0xFE de esa tabla) y las letras siguientes se ven
// separadas como si fueran monoespaciadas.
// pdfSafe() no confía solo en stripEmoji: al final tira CUALQUIER
// carácter fuera de Latin-1, sea cual sea, como red de seguridad.
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
    .replace(/[^\x00-\xFF]/g, '')            // red de seguridad: cualquier otro
                                              // carácter fuera de Latin-1/WinAnsi
    .replace(/\s+/g, ' ')
    .trim();
}

// ══════════════════════════════════════════
// BUG FIX #2 — carga de imágenes con concurrencia limitada
// Antes se disparaban las 200+ peticiones de imagen al mismo
// tiempo con Promise.all(prods.map(loadImg)). Los navegadores
// solo permiten ~6 conexiones simultáneas por dominio, así que
// la mayoría de esas imágenes se quedaban en cola y expiraban
// (timeout de 8s) antes de alcanzar a cargar — por eso salían
// los cuadros vacíos en vez de la foto.
// loadImagesLimited() mantiene solo `concurrency` peticiones
// activas a la vez y va tomando la siguiente en cuanto una
// termina, así todas alcanzan a cargar dentro de su timeout.
// ══════════════════════════════════════════
async function loadImagesLimited(items, loaderFn, concurrency = 6) {
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
// REDISEÑO DE TARJETA — branding + iconos + tipografía
// ══════════════════════════════════════════
// Paleta (coincide con el verde ya usado en el PDF: rgb(74,82,64))
const CARD = {
  bg: '#f6f1e8',
  ink: '#26241c',
  inkSoft: '#5c5748',
  olive: '#4a5240',
  oliveSoft: '#e4e2d6',
  gold: '#7a6230',
  goldSoft: '#f0ead8',
  line: '#d9d2c2'
};

// Carga (una sola vez) las fuentes de Google usadas en la tarjeta.
// Si ya están cargadas en la página no vuelve a inyectar el <link>.
let _fontsReady = null;
function ensureFonts() {
  if (_fontsReady) return _fontsReady;
  _fontsReady = new Promise((resolve) => {
    if (!document.getElementById('_aploFontsLink')) {
      const link = document.createElement('link');
      link.id = '_aploFontsLink';
      link.rel = 'stylesheet';
      link.href = 'https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,700;0,900;1,600&family=Dancing+Script:wght@600;700&display=swap';
      document.head.appendChild(link);
    }
    Promise.all([
      document.fonts.load('900 90px "Playfair Display"'),
      document.fonts.load('700 90px "Playfair Display"'),
      document.fonts.load('italic 600 60px "Playfair Display"'),
      document.fonts.load('600 60px "Dancing Script"'),
      document.fonts.load('700 60px "Dancing Script"')
    ]).then(() => resolve()).catch(() => resolve());
  });
  return _fontsReady;
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

// Icono simple dibujado con paths (sin dependencias externas)
function drawIcon(ctx, type, cx, cy, r) {
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = CARD.oliveSoft;
  ctx.fill();
  ctx.strokeStyle = CARD.olive;
  ctx.fillStyle = CARD.olive;
  ctx.lineWidth = 2.6;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  const s = r * 0.5;
  switch (type) {
    case 'sun':
      ctx.beginPath(); ctx.arc(cx, cy, s * 0.55, 0, Math.PI * 2); ctx.stroke();
      for (let i = 0; i < 8; i++) {
        const a = (Math.PI / 4) * i;
        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(a) * s * 0.85, cy + Math.sin(a) * s * 0.85);
        ctx.lineTo(cx + Math.cos(a) * s * 1.2, cy + Math.sin(a) * s * 1.2);
        ctx.stroke();
      }
      break;
    case 'leaf':
      ctx.beginPath();
      ctx.moveTo(cx - s * 0.7, cy + s * 0.75);
      ctx.quadraticCurveTo(cx - s * 0.95, cy - s * 0.55, cx + s * 0.1, cy - s * 0.9);
      ctx.quadraticCurveTo(cx + s * 0.95, cy - s * 0.55, cx + s * 0.7, cy + s * 0.75);
      ctx.quadraticCurveTo(cx, cy + s * 0.4, cx - s * 0.7, cy + s * 0.75);
      ctx.stroke();
      ctx.beginPath(); ctx.moveTo(cx - s * 0.6, cy + s * 0.6); ctx.lineTo(cx + s * 0.55, cy - s * 0.55); ctx.stroke();
      break;
    case 'drop':
      ctx.beginPath();
      ctx.moveTo(cx, cy - s * 1.05);
      ctx.quadraticCurveTo(cx + s * 0.95, cy + s * 0.2, cx, cy + s * 0.9);
      ctx.quadraticCurveTo(cx - s * 0.95, cy + s * 0.2, cx, cy - s * 1.05);
      ctx.stroke();
      break;
    case 'heart':
      ctx.beginPath();
      ctx.moveTo(cx, cy + s * 0.8);
      ctx.bezierCurveTo(cx - s * 1.15, cy - s * 0.2, cx - s * 0.4, cy - s * 1.05, cx, cy - s * 0.35);
      ctx.bezierCurveTo(cx + s * 0.4, cy - s * 1.05, cx + s * 1.15, cy - s * 0.2, cx, cy + s * 0.8);
      ctx.stroke();
      break;
    case 'flag':
      ctx.beginPath();
      ctx.moveTo(cx - s * 0.65, cy - s); ctx.lineTo(cx - s * 0.65, cy + s); ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(cx - s * 0.65, cy - s * 0.9);
      ctx.lineTo(cx + s * 0.85, cy - s * 0.55);
      ctx.lineTo(cx - s * 0.65, cy - s * 0.2);
      ctx.closePath(); ctx.fill();
      break;
    default: // sparkle
      ctx.beginPath();
      ctx.moveTo(cx, cy - s); ctx.lineTo(cx + s * 0.3, cy - s * 0.3);
      ctx.lineTo(cx + s, cy); ctx.lineTo(cx + s * 0.3, cy + s * 0.3);
      ctx.lineTo(cx, cy + s); ctx.lineTo(cx - s * 0.3, cy + s * 0.3);
      ctx.lineTo(cx - s, cy); ctx.lineTo(cx - s * 0.3, cy - s * 0.3);
      ctx.closePath(); ctx.fill();
  }
  ctx.restore();
}

function pickIcon(text) {
  const t = (text || '').toLowerCase();
  if (/(protector|solar|spf|fps|\bsol\b)/.test(t)) return 'sun';
  if (/(formulad|extracto|centella|asiática|natural|ingredient|botanic)/.test(t)) return 'leaf';
  if (/(hidrat|calmante|serum|sérum|textura|ligera|acuos|nutr)/.test(t)) return 'drop';
  if (/(piel sensible|dermat|hipoalerg|sensible|bebé|bebe)/.test(t)) return 'heart';
  if (/(original|coreano|certificad|garantiz)/.test(t)) return 'flag';
  return 'sparkle';
}

// Dibuja pequeño logo de flor (4 pétalos) para el encabezado de marca
function drawFlowerMark(ctx, cx, cy, r) {
  ctx.save();
  ctx.fillStyle = CARD.olive;
  for (let i = 0; i < 4; i++) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate((Math.PI / 2) * i + Math.PI / 4);
    ctx.beginPath();
    ctx.ellipse(0, -r * 0.65, r * 0.42, r * 0.65, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  ctx.beginPath();
  ctx.arc(cx, cy, r * 0.32, 0, Math.PI * 2);
  ctx.fillStyle = CARD.gold;
  ctx.fill();
  ctx.restore();
}

// Envuelve texto a un ancho máximo y devuelve las líneas (sin dibujar)
function wrapLines(ctx, text, maxW, maxLines) {
  const words = String(text).split(' ');
  const lines = [];
  let cur = '';
  for (const w of words) {
    const test = cur ? cur + ' ' + w : w;
    if (ctx.measureText(test).width > maxW && cur) {
      lines.push(cur);
      cur = w;
      if (maxLines && lines.length >= maxLines) break;
    } else {
      cur = test;
    }
  }
  if (cur && (!maxLines || lines.length < maxLines)) lines.push(cur);
  if (maxLines && lines.length > maxLines) lines.length = maxLines;
  if (maxLines && lines.length === maxLines) {
    let last = lines[maxLines - 1];
    while (ctx.measureText(last + '…').width > maxW && last.length > 1) last = last.slice(0, -1);
    lines[maxLines - 1] = last + (ctx.measureText(text).width > maxW ? '…' : '');
  }
  return lines;
}

// Franja de precio sólida (menudeo / mayoreo / ambos)
function drawPriceBadge(ctx, p, W, H, mode) {
  const hasMayoreo = p.priceMayoreo && p.priceMayoreo > 0;
  const M = 50;

  const drawOne = (text, label, x, y, w, h, fill, textColor, labelColor) => {
    ctx.beginPath();
    roundRect(ctx, x, y, w, h, h / 2);
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.textAlign = 'center';
    if (label) {
      ctx.font = '700 15px Arial, sans-serif';
      ctx.fillStyle = labelColor;
      ctx.fillText(label, x + w / 2, y + 22);
      ctx.font = '900 34px Georgia, "Playfair Display", serif';
      ctx.fillStyle = textColor;
      ctx.fillText(text, x + w / 2, y + h - 16);
    } else {
      ctx.font = '900 46px Georgia, "Playfair Display", serif';
      ctx.fillStyle = textColor;
      ctx.fillText(text, x + w / 2, y + h / 2 + 16);
    }
  };

  if (mode === 'ambos' && hasMayoreo) {
    const pillH = 78, gap = 12;
    const menText = fmtMoney(p.price), mayText = fmtMoney(p.priceMayoreo);
    ctx.font = '900 34px Georgia, serif';
    const menW = Math.max(ctx.measureText(menText).width + 70, 180);
    const mayW = Math.max(ctx.measureText(mayText).width + 70, 180);
    const w = Math.max(menW, mayW);
    const x = W - w - M;
    const menY = H - (pillH * 2 + gap) - M;
    const mayY = menY + pillH + gap;
    drawOne(menText, 'MENUDEO', x, menY, w, pillH, CARD.olive, '#f5f0e8', '#c9c2a8');
    drawOne(mayText, 'MAYOREO', x, mayY, w, pillH, CARD.gold, '#f5f0e8', '#e0cfa0');
    return x;
  } else {
    const isMay = mode === 'mayoreo' && hasMayoreo;
    const priceVal = isMay ? p.priceMayoreo : p.price;
    const priceText = fmtMoney(priceVal);
    const pillH = 100;
    ctx.font = '900 46px Georgia, serif';
    const w = Math.max(ctx.measureText(priceText).width + 90, 220);
    const x = W - w - M;
    const y = H - pillH - M;
    drawOne(priceText, isMay ? 'MAYOREO' : null, x, y, w, pillH, isMay ? CARD.gold : CARD.olive, '#f5f0e8', '#e0cfa0');
    return x;
  }
}

const makeCard = (p, imgEl, mode) => new Promise(res => {
  const W = 970, H = 1220, M = 50;
  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d');

  // ── Fondo ──
  ctx.fillStyle = CARD.bg;
  ctx.fillRect(0, 0, W, H);

  // ── Encabezado de marca ──
  const brandY = 46;
  drawFlowerMark(ctx, W / 2, 22, 12);
  ctx.font = '600 22px Georgia, serif';
  ctx.fillStyle = CARD.olive;
  ctx.textAlign = 'center';
  const brandText = 'A P L O   B L O S S O M';
  ctx.fillText(brandText, W / 2, brandY);
  const brandW = ctx.measureText(brandText).width;
  ctx.strokeStyle = CARD.line;
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.moveTo(M + 10, brandY - 6); ctx.lineTo(W / 2 - brandW / 2 - 22, brandY - 6); ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(W / 2 + brandW / 2 + 22, brandY - 6); ctx.lineTo(W - M - 10, brandY - 6); ctx.stroke();

  // ── Nombre del producto (serif bold, mayúsculas) ──
  const nombre = stripEmoji(p.name || '').toUpperCase();
  const TITLE_X = M;
  const maxTitleW = W - TITLE_X - M;
  ctx.textAlign = 'left';
  ctx.fillStyle = CARD.ink;

  const calcTitleLines = (size) => {
    ctx.font = '900 ' + size + 'px Georgia, "Playfair Display", serif';
    return wrapLines(ctx, nombre, maxTitleW, 2);
  };
  let tSize = 78;
  let titleLines = calcTitleLines(tSize);
  while (ctx.measureText(titleLines[0] || '').width > maxTitleW && tSize > 34) { tSize -= 4; titleLines = calcTitleLines(tSize); }

  let ty = 108;
  ctx.font = '900 ' + tSize + 'px Georgia, "Playfair Display", serif';
  for (const l of titleLines) { ctx.fillText(l, TITLE_X, ty); ty += tSize * 1.08; }

  // ── Subtítulo estilo script (categoría o primera frase corta) ──
  const descClean = stripEmoji(p.description || '');
  const descFrases = descClean ? descClean.split(/[.,;]/).map(s => s.trim()).filter(Boolean) : [];
  let subtitle = (p.category || '').trim();
  if (!subtitle && descFrases[0] && descFrases[0].split(' ').length <= 6) subtitle = descFrases[0];

  ty += 8;
  if (subtitle) {
    let sSize = 46;
    ctx.font = sSize + 'px "Dancing Script", cursive';
    let sub = subtitle;
    while (ctx.measureText(sub).width > maxTitleW && sSize > 26) { sSize -= 3; ctx.font = sSize + 'px "Dancing Script", cursive'; }
    ctx.fillStyle = CARD.olive;
    ctx.fillText(sub, TITLE_X, ty + sSize * 0.7);
    ty += sSize * 0.95;
  }
  ty += 18;

  // ── Imagen del producto ──
  const priceAreaH = (() => {
    const hasMayoreo = p.priceMayoreo && p.priceMayoreo > 0;
    return (mode === 'ambos' && hasMayoreo) ? (78 * 2 + 12 + M) : (100 + M);
  })();

  const imgX = M, imgY = ty;
  const imgW = 540;
  const imgH = H - imgY - priceAreaH - 24;

  ctx.save();
  ctx.beginPath();
  roundRect(ctx, imgX, imgY, imgW, imgH, 32);
  ctx.clip();
  ctx.fillStyle = CARD.oliveSoft;
  ctx.fillRect(imgX, imgY, imgW, imgH);
  if (imgEl) {
    const iw = imgEl.naturalWidth, ih = imgEl.naturalHeight;
    const sc = Math.min(imgW / iw, imgH / ih);
    const dw = iw * sc, dh = ih * sc;
    ctx.drawImage(imgEl, imgX + (imgW - dw) / 2, imgY + (imgH - dh) / 2, dw, dh);
  }
  ctx.restore();
  ctx.strokeStyle = CARD.line;
  ctx.lineWidth = 2;
  ctx.beginPath();
  roundRect(ctx, imgX, imgY, imgW, imgH, 32);
  ctx.stroke();

  // ── Columna de características (icono + texto + separador) ──
  const colX = imgX + imgW + 40;
  const colW = W - colX - M;
  const iconR = 28;

  const extraItems = [];
  const skinArr = Array.isArray(p.skin) ? p.skin.filter(s => s && s !== 'No aplica') : (p.skin && p.skin !== 'No aplica' ? [p.skin] : []);
  if (skinArr.length) extraItems.push(skinArr.join(', '));
  const mlVal = String(p.mlVal || '').trim();
  const mlUnit = String(p.mlUnit || '').trim();
  if (mlVal && mlVal !== '0' && mlUnit && mlUnit !== 'N/A') extraItems.push(mlVal + ' ' + mlUnit);
  if (p.isKorean) extraItems.push('Producto coreano');
  if (p.isMini) extraItems.push('Presentación mini');

  const featureItems = (descFrases.length ? descFrases : [nombre]).slice(0, 5);
  const bottomChips = extraItems.slice(0, 3);

  let iy = imgY + 6;
  const textX = colX + iconR * 2 + 18;
  const textW = colW - iconR * 2 - 18;
  const labelFont = '700 21px Arial, sans-serif';
  const lineH = 26;

  for (let i = 0; i < featureItems.length; i++) {
    const frase = featureItems[i];
    const icon = pickIcon(frase);
    const cy = iy + iconR;
    drawIcon(ctx, icon, colX + iconR, cy, iconR);

    ctx.font = labelFont;
    ctx.fillStyle = CARD.ink;
    ctx.textAlign = 'left';
    const lines = wrapLines(ctx, frase.toUpperCase(), textW, 3);
    const blockH = Math.max(lines.length * lineH, iconR * 2 - 8);
    const startY = cy - (lines.length * lineH) / 2 + lineH * 0.75;
    lines.forEach((l, li) => ctx.fillText(l, textX, startY + li * lineH));

    iy += Math.max(blockH, iconR * 2) + 22;
    if (i < featureItems.length - 1) {
      ctx.strokeStyle = CARD.line;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(colX, iy - 12);
      ctx.lineTo(colX + colW, iy - 12);
      ctx.stroke();
    }
    if (iy > H - priceAreaH - 20) break;
  }

  // ── Chips inferiores (bajo la imagen) ──
  if (bottomChips.length) {
    let cx = imgX;
    const chipY = imgY + imgH + 22;
    ctx.font = '600 17px Arial, sans-serif';
    bottomChips.forEach((chip, i) => {
      const label = chip.toUpperCase();
      const tw = ctx.measureText(label).width;
      const chipW = tw + 44;
      if (cx + chipW > imgX + imgW) return;
      drawIcon(ctx, pickIcon(chip), cx + 14, chipY, 14);
      ctx.fillStyle = CARD.inkSoft;
      ctx.textAlign = 'left';
      ctx.fillText(label, cx + 32, chipY + 6);
      cx += chipW + 22;
      if (i < bottomChips.length - 1) {
        ctx.strokeStyle = CARD.line;
        ctx.beginPath();
        ctx.moveTo(cx - 14, chipY - 12);
        ctx.lineTo(cx - 14, chipY + 12);
        ctx.stroke();
      }
    });
  }

  // ── Precio ──
  drawPriceBadge(ctx, p, W, H, mode);

  canvas.toBlob(blob => {
    const fname = (p.name || 'producto').replace(/[^a-zA-Z0-9áéíóúñÁÉÍÓÚÑ ]/g, '').trim().replace(/ +/g, '_');
    canvas.width = 1; canvas.height = 1;
    res({ fname: fname + '.jpg', blob });
  }, 'image/jpeg', 0.92);
});

window.exportImages = async function(priceMode = 'menudeo') {
  const prods = state.products.filter(p => p.image && (p.stock || 0) > 0);
  if (!prods.length) { toast('No hay productos con imagen en stock', 'err'); return; }
  toast('Generando imágenes...');
  await ensureFonts();

  const loadImgEl = (url) => new Promise(res => {
    let done = false;
    const finish = (val) => { if (!done) { done = true; res(val); } };
    const timer = setTimeout(() => finish(null), 8000);
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.src = 'https://images.weserv.nl/?url=' + encodeURIComponent(url) + '&output=jpg&q=90';
    img.onload = () => { clearTimeout(timer); finish(img); };
    img.onerror = () => {
      const img2 = new Image();
      img2.crossOrigin = 'anonymous';
      img2.src = url;
      img2.onload = () => { clearTimeout(timer); finish(img2); };
      img2.onerror = () => { clearTimeout(timer); finish(null); };
    };
  });

  const zip = new JSZip();
  let count = 0;
  for (const p of prods) {
    try {
      const imgEl = await loadImgEl(p.image);
      const result = await makeCard(p, imgEl, priceMode);
      if (result) { zip.file(result.fname, result.blob); count++; }
      toast(`Procesando... ${count}/${prods.length}`);
    } catch (e) { console.error(e); }
  }

  const zipBlob = await zip.generateAsync({ type: 'blob' });
  const modeLabel = priceMode === 'ambos' ? 'ambos-precios' : priceMode;
  // BUG FIX: Blob + botón "Descargar" en modal, en vez de auto-click en <a> invisible
  showDownloadModal(`ZIP listo (${count} imágenes)`, zipBlob, `catalogo-aploblossom-${modeLabel}.zip`);
};

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
  // BUG FIX: Blob + botón "Descargar" en modal
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
  // BUG FIX: pdfSafe() reemplaza a clean() — filtra cualquier carácter
  // problemático, no solo emojis, antes de medir/dibujar texto en el PDF
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

  // BUG FIX: antes era Promise.all(prods.map(loadImg)) — disparaba TODAS
  // las peticiones de imagen a la vez (hasta 200+), y el navegador solo
  // procesa ~6 en paralelo por dominio, así que la mayoría se quedaban en
  // cola y expiraban antes del timeout de 8s (por eso salían vacías).
  // loadImagesLimited mantiene solo 6 activas a la vez.
  loadImagesLimited(prods, loadImg, 6).then(imgs => {
    prods.forEach((p, i) => addRow(p, imgs[i]));
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7); doc.setTextColor(160, 155, 140);
    doc.text(prods.length + ' productos · Aplo Blossom', PW / 2, PH - 6, { align: 'center' });
    const filename = 'catalogo-aploblossom-' + (onlyInStock ? 'disponible' : 'completo') + '.pdf';
    const pdfBlob = doc.output('blob');
    // BUG FIX: Blob + botón "Descargar" en modal
    showDownloadModal('PDF listo', pdfBlob, filename);
  });
};
