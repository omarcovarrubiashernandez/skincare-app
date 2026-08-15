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

window.exportImages = async function(priceMode = 'menudeo') {
  const prods = state.products.filter(p => p.image && (p.stock || 0) > 0);
  if (!prods.length) { toast('No hay productos con imagen en stock', 'err'); return; }
  toast('Generando imágenes...');

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

  function drawPriceArea(ctx, p, W, H, mode) {
    const hasMayoreo = p.priceMayoreo && p.priceMayoreo > 0;

    if (mode === 'ambos' && hasMayoreo) {
      const pillH = 70;
      const pillGap = 10;
      const totalPillH = pillH * 2 + pillGap;

      const menText = fmtMoney(p.price);
      ctx.font = 'bold 40px Georgia, serif';
      const menW = ctx.measureText(menText).width + 70;
      const menX = W - menW - 28;
      const menY = H - totalPillH - 28;

      ctx.fillStyle = '#f0ece4';
      ctx.strokeStyle = '#2a2820';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      roundRect(ctx, menX, menY, menW, pillH, pillH / 2);
      ctx.fill(); ctx.stroke();

      ctx.font = '500 16px Arial, sans-serif';
      ctx.fillStyle = '#888070';
      ctx.textAlign = 'center';
      ctx.fillText('MENUDEO', menX + menW / 2, menY + 20);

      ctx.font = 'bold 36px Georgia, serif';
      ctx.fillStyle = '#2a2820';
      ctx.fillText(menText, menX + menW / 2, menY + 56);

      const mayText = fmtMoney(p.priceMayoreo);
      ctx.font = 'bold 40px Georgia, serif';
      const mayW = ctx.measureText(mayText).width + 70;
      const mayX = W - mayW - 28;
      const mayY = menY + pillH + pillGap;

      ctx.fillStyle = '#f0ead8';
      ctx.strokeStyle = '#7a6230';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      roundRect(ctx, mayX, mayY, mayW, pillH, pillH / 2);
      ctx.fill(); ctx.stroke();

      ctx.font = '500 16px Arial, sans-serif';
      ctx.fillStyle = '#9a8050';
      ctx.textAlign = 'center';
      ctx.fillText('MAYOREO', mayX + mayW / 2, mayY + 20);

      ctx.font = 'bold 36px Georgia, serif';
      ctx.fillStyle = '#7a6230';
      ctx.fillText(mayText, mayX + mayW / 2, mayY + 56);

      return Math.min(menX, mayX);

    } else {
      const isMay = (mode === 'mayoreo') && hasMayoreo;
      const priceVal = isMay ? p.priceMayoreo : p.price;
      const priceText = fmtMoney(priceVal);
      const pillH = 90;

      ctx.font = 'bold 54px Georgia, serif';
      const priceW = ctx.measureText(priceText).width;
      const pillW = priceW + 80;
      const pillX = W - pillW - 28;
      const pillY = H - pillH - 28;

      ctx.fillStyle = isMay ? '#f0ead8' : '#f0ece4';
      ctx.strokeStyle = isMay ? '#7a6230' : '#2a2820';
      ctx.lineWidth = 3;
      ctx.beginPath();
      roundRect(ctx, pillX, pillY, pillW, pillH, pillH / 2);
      ctx.fill(); ctx.stroke();

      if (isMay) {
        ctx.font = '500 16px Arial, sans-serif';
        ctx.fillStyle = '#9a8050';
        ctx.textAlign = 'center';
        ctx.fillText('MAYOREO', pillX + pillW / 2, pillY + 20);
        ctx.font = 'bold 48px Georgia, serif';
        ctx.fillStyle = '#7a6230';
        ctx.fillText(priceText, pillX + pillW / 2, pillY + 68);
      } else {
        ctx.font = 'bold 52px Georgia, serif';
        ctx.fillStyle = '#2a2820';
        ctx.textAlign = 'center';
        ctx.fillText(priceText, pillX + pillW / 2, pillY + 62);
      }

      return pillX;
    }
  }

  const makeCard = (p, imgEl, mode) => new Promise(res => {
    const W = 970, H = 1220;
    const canvas = document.createElement('canvas');
    canvas.width = W; canvas.height = H;
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = '#f2ede8';
    ctx.fillRect(0, 0, W, H);

    ctx.strokeStyle = '#c0b09a';
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.moveTo(0, 190); ctx.quadraticCurveTo(60, 80, 190, 55); ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, 245); ctx.quadraticCurveTo(80, 105, 240, 70); ctx.stroke();

    // BUG FIX: quitar emojis del nombre ANTES de medir/dibujar en canvas,
    // porque rompen measureText() y las letras quedan encimadas.
    const nombre = stripEmoji(p.name || '').toUpperCase();
    ctx.fillStyle = '#1a1814';
    ctx.textAlign = 'left';
    const TITLE_X = 48;
    const maxTitleW = W - TITLE_X - 48;

    const calcLines = (size) => {
      ctx.font = 'bold ' + size + 'px Georgia, serif';
      const words = nombre.split(' ');
      let lines = [], cur = '';
      for (const w of words) {
        const test = cur + w + ' ';
        if (ctx.measureText(test).width > maxTitleW && cur) { lines.push(cur.trim()); cur = w + ' '; }
        else cur = test;
      }
      lines.push(cur.trim());
      return lines;
    };

    let tSize = 90;
    let titleLines = calcLines(tSize);
    while (titleLines.length > 2 && tSize > 36) { tSize -= 4; titleLines = calcLines(tSize); }
    if (titleLines.length > 2) {
      titleLines = titleLines.slice(0, 2);
      ctx.font = '900 ' + tSize + 'px Arial Black, sans-serif';
      let l2 = titleLines[1];
      while (ctx.measureText(l2 + '…').width > maxTitleW && l2.length > 1) l2 = l2.slice(0, -1);
      titleLines[1] = l2 + '…';
    }

    ctx.font = '900 ' + tSize + 'px Arial Black, sans-serif';
    let ty = 108;
    for (const l of titleLines) { ctx.fillText(l, TITLE_X, ty); ty += tSize * 1.12; }

    const imgX = 30, imgY = ty + 30;
    const imgW = 610, imgH = H - imgY - 30;

    ctx.save();
    ctx.beginPath();
    roundRect(ctx, imgX, imgY, imgW, imgH, 36);
    ctx.clip();
    ctx.fillStyle = '#f2ede8';
    ctx.fillRect(imgX, imgY, imgW, imgH);
    if (imgEl) {
      const iw = imgEl.naturalWidth, ih = imgEl.naturalHeight;
      const sc = Math.min(imgW / iw, imgH / ih);
      const dw = iw * sc, dh = ih * sc;
      ctx.drawImage(imgEl, imgX + (imgW - dw) / 2, imgY + (imgH - dh) / 2, dw, dh);
    }
    ctx.restore();

    const colX = imgX + imgW + 36;
    const colW = W - colX - 28;
    ctx.textAlign = 'left';

    // BUG FIX: quitar emojis de la descripción ANTES de medir/dibujar
    const descClean = stripEmoji(p.description || '');
    const descFrases = descClean
      ? descClean.split(/[.,;]/).map(s => s.trim()).filter(Boolean)
      : [nombre || ''];

    const extraItems = [];
    const skinArr = Array.isArray(p.skin)
      ? p.skin.filter(s => s && s !== 'No aplica')
      : (p.skin && p.skin !== 'No aplica' ? [p.skin] : []);
    if (skinArr.length) extraItems.push(skinArr.join(', '));
    const mlVal = String(p.mlVal || '').trim();
    const mlUnit = String(p.mlUnit || '').trim();
    if (mlVal && mlVal !== '0' && mlUnit && mlUnit !== 'N/A') extraItems.push(mlVal + ' ' + mlUnit);
    if (p.isKorean) extraItems.push('🇰🇷 Coreano');
    if (p.isMini) extraItems.push('🧴 Mini');

    const hasMayoreo = p.priceMayoreo && p.priceMayoreo > 0;
    const priceAreaH = (mode === 'ambos' && hasMayoreo) ? (70 * 2 + 10 + 28 + 20) : (90 + 28 + 20);
    const maxTextY = H - priceAreaH;

    const drawWrappedSafe = (text, x, startY, maxW, font, color, lineH) => {
      ctx.font = font;
      ctx.fillStyle = color;
      const words = text.toUpperCase().split(' ');
      let line = '', curY = startY;
      for (let i = 0; i < words.length; i++) {
        const w = words[i];
        const test = line + w + ' ';
        if (ctx.measureText(test).width > maxW && line) {
          const nextY = curY + lineH;
          if (nextY + lineH > maxTextY) {
            let truncLine = line.trim();
            while (ctx.measureText(truncLine + '…').width > maxW && truncLine.length > 1) truncLine = truncLine.slice(0, -1);
            ctx.fillText(truncLine + '…', x, curY);
            return { y: curY + lineH, clipped: true };
          }
          ctx.fillText(line.trim(), x, curY);
          line = w + ' '; curY += lineH;
        } else line = test;
      }
      if (curY > maxTextY) return { y: curY, clipped: true };
      ctx.fillText(line.trim(), x, curY);
      return { y: curY + lineH, clipped: false };
    };

    let dy = imgY + 36;
    const descFont = '500 24px Arial, sans-serif';
    const descLineH = 32;
    const descGap = 20;

    let descClipped = false;
    for (const frase of descFrases) {
      if (descClipped) break;
      if (dy + descLineH > maxTextY) break;
      const result = drawWrappedSafe('― ' + frase, colX, dy, colW, descFont, '#2a2820', descLineH);
      dy = result.y + descGap;
      if (result.clipped) descClipped = true;
    }

    let extrasShownAbove = false;
    if (!descClipped) {
      dy += 10;
      const extraFont = '500 22px Arial, sans-serif';
      const extraLineH = 30;
      let allFit = true;
      for (const extra of extraItems) {
        if (dy + extraLineH > maxTextY) { allFit = false; break; }
        const result = drawWrappedSafe(extra, colX, dy, colW, extraFont, '#7a7060', extraLineH);
        dy = result.y + 14;
        if (result.clipped) { allFit = false; break; }
      }
      extrasShownAbove = allFit;
    }

    const leftmostPillX = drawPriceArea(ctx, p, W, H, mode);

    if (!extrasShownAbove && extraItems.length) {
      const extraText = extraItems.filter(e => !e.includes('🇰🇷') && !e.includes('🧴')).join('  ·  ').toUpperCase();
      if (extraText) {
        ctx.font = '500 20px Arial, sans-serif';
        ctx.fillStyle = '#7a7060';
        ctx.textAlign = 'right';
        const maxExtraW = leftmostPillX - colX - 16;
        const pillBottomRef = H - (mode === 'ambos' && hasMayoreo ? 28 : 28);
        const pillTopRef = H - (mode === 'ambos' && hasMayoreo ? (70*2+10+28) : (90+28));
        const eWords = extraText.split(' ');
        let eLine = '', eLines = [];
        for (const w of eWords) {
          const test = eLine + w + ' ';
          if (ctx.measureText(test).width > maxExtraW && eLine) { eLines.push(eLine.trim()); eLine = w + ' '; } else eLine = test;
        }
        eLines.push(eLine.trim()); eLines = eLines.slice(0, 2);
        const eLineH = 26;
        const eTotalH = eLines.length * eLineH;
        const eStartY = pillTopRef + (pillBottomRef - pillTopRef - eTotalH) / 2 + eLineH;
        for (let i = 0; i < eLines.length; i++) ctx.fillText(eLines[i], leftmostPillX - 16, eStartY + i * eLineH);
      }
    }

    canvas.toBlob(blob => {
      const fname = (p.name || 'producto').replace(/[^a-zA-Z0-9áéíóúñÁÉÍÓÚÑ ]/g, '').trim().replace(/ +/g, '_');
      canvas.width = 1; canvas.height = 1;
      res({ fname: fname + '.jpg', blob });
    }, 'image/jpeg', 0.92);
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
  // Nota: clean() ya remueve emojis (rango unicode) antes de medir/dibujar texto en el PDF
  const clean = str => stripEmoji(str || '').replace(/\s+/g, ' ').trim();
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

  Promise.all(prods.map(loadImg)).then(imgs => {
    prods.forEach((p, i) => addRow(p, imgs[i]));
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7); doc.setTextColor(160, 155, 140);
    doc.text(prods.length + ' productos · Aplo Blossom', PW / 2, PH - 6, { align: 'center' });
    const filename = 'catalogo-aploblossom-' + (onlyInStock ? 'disponible' : 'completo') + '.pdf';
    const pdfBlob = doc.output('blob');
    // BUG FIX: Blob + botón "Descargar" en modal
    showDownloadModal('PDF listo', pdfBlob, filename);
  });
};