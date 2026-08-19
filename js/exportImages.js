// ══════════════════════════════════════════════════════════════════
// exportImages.js
// Módulo separado (antes vivía dentro de catalog.js) para que ese
// archivo no crezca sin control. Todo lo relacionado a las tarjetas
// de imagen (plantillas, detección de color, export a .zip) vive aquí.
//
// catalog.js solo necesita: import './exportImages.js';
// (import de efecto secundario — no exporta nada, solo define
// window.exportImages y window.openExportImagesModal, que es lo que
// usa el botón de la pantalla de Catálogo)
// ══════════════════════════════════════════════════════════════════

import { state } from './state.js';
import { fmtMoney, toast, showModal, stripEmoji } from './utils.js';
import { showDownloadModal, loadImagesLimited } from './catalog.js';

// ──────────────────────────────────────────
// 1. PLANTILLAS DISPONIBLES
// ──────────────────────────────────────────
const TEMPLATES = {
  rosa: { label: 'Baby / Skincare (rosa)', accent: '#E24E86' },
  olivo: { label: 'Botánico (verde)', accent: '#3E4A2C' },
  vintage: { label: 'Café / Vintage (nude)', accent: '#6F4E37' }
};

// ──────────────────────────────────────────
// 2. FUENTES E INYECCIÓN DE ESTILOS (una sola vez)
// ──────────────────────────────────────────
let _stylesReady = null;
function ensureTemplateAssets() {
  if (_stylesReady) return _stylesReady;
  _stylesReady = new Promise((resolve) => {
    if (!document.getElementById('_tplFontsLink')) {
      const link = document.createElement('link');
      link.id = '_tplFontsLink';
      link.rel = 'stylesheet';
      link.href = 'https://fonts.googleapis.com/css2?family=Fredoka:wght@500;600;700&family=Caveat:wght@600;700&family=Nunito:wght@400;600;700;800&family=Fraunces:ital,opsz,wght@0,9..144,500;0,9..144,600;0,9..144,700;1,9..144,500&family=Manrope:wght@400;500;600;700;800&family=Cormorant+Garamond:wght@500;600;700&family=Special+Elite&display=swap';
      document.head.appendChild(link);
    }
    if (!document.getElementById('_tplStyleTag')) {
      const style = document.createElement('style');
      style.id = '_tplStyleTag';
      style.textContent = TEMPLATE_CSS;
      document.head.appendChild(style);
    }
    Promise.all([
      document.fonts.load('700 40px "Fredoka"'),
      document.fonts.load('700 30px "Caveat"'),
      document.fonts.load('800 20px "Nunito"'),
      document.fonts.load('700 50px "Fraunces"'),
      document.fonts.load('600 20px "Manrope"'),
      document.fonts.load('600 50px "Cormorant Garamond"'),
      document.fonts.load('400 16px "Special Elite"')
    ]).then(() => resolve()).catch(() => resolve());
  });
  return _stylesReady;
}

// Contenedor oculto donde se arma cada tarjeta antes de capturarla.
function ensureStage() {
  let stage = document.getElementById('_cardStage');
  if (!stage) {
    stage = document.createElement('div');
    stage.id = '_cardStage';
    stage.style.position = 'fixed';
    stage.style.left = '-99999px';
    stage.style.top = '0';
    stage.style.zIndex = '-1';
    document.body.appendChild(stage);
  }
  return stage;
}

// ──────────────────────────────────────────
// 3. ÍCONOS (SVG en línea, un solo color)
// ──────────────────────────────────────────
const ICONS = {
  sun: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="12" cy="12" r="4.5"/><path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1"/></svg>',
  leaf: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20c8-1 14-7 15-15C11 6 5 12 4 20z"/><path d="M6 18c3-3 6-6 9-11"/></svg>',
  drop: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3s6 6.6 6 11a6 6 0 1 1-12 0c0-4.4 6-11 6-11z"/></svg>',
  heart: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 21s-7.5-4.6-10-9.1C.5 8.6 2 5 5.5 5c2 0 3.4 1.1 4.2 2.4C10.5 6.1 11.9 5 13.9 5 17.4 5 19 8.6 17.5 11.9 15 16.4 12 21 12 21z"/></svg>',
  globe: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 2.6 4 6 4 9s-1.5 6.4-4 9c-2.5-2.6-4-6-4-9s1.5-6.4 4-9z"/></svg>',
  sparkle: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3z"/></svg>',
  shield: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l7 3.2v5.1c0 4.4-3 8.3-7 9.4-4-1.1-7-5-7-9.4V6.2L12 3z"/><path d="M9 12.2l2 2 4-4.2"/></svg>',
  chat: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.4 8.4 0 0 1-8.9 8.4 8.6 8.6 0 0 1-3.4-.7L3 20l1-4.9a8.4 8.4 0 0 1-1-4A8.5 8.5 0 0 1 12 3a8.4 8.4 0 0 1 9 8.5z"/></svg>'
};

function pickIconKey(text) {
  const t = (text || '').toLowerCase();
  if (/(protector|solar|spf|fps|\bsol\b)/.test(t)) return 'sun';
  if (/(formulad|extracto|centella|asiática|natural|ingredient|botanic)/.test(t)) return 'leaf';
  if (/(hidrat|calmante|serum|sérum|textura|ligera|acuos|nutr)/.test(t)) return 'drop';
  if (/(piel sensible|dermat|hipoalerg|sensible|bebé|bebe)/.test(t)) return 'heart';
  if (/(original|coreano|certificad|garantiz)/.test(t)) return 'globe';
  return 'sparkle';
}

function icon(key) { return ICONS[key] || ICONS.sparkle; }

// ──────────────────────────────────────────
// 4. DATOS DERIVADOS DEL PRODUCTO
// ──────────────────────────────────────────
function getDescFrases(p) {
  const descClean = stripEmoji(p.description || '');
  return descClean ? descClean.split(/[.,;]/).map(s => s.trim()).filter(Boolean) : [];
}

function buildFeatureItems(p) {
  const frases = getDescFrases(p);
  const base = (frases.length ? frases : [p.name || '']).slice(0, 4);
  return base.map(frase => ({ icon: pickIconKey(frase), text: frase }));
}

function buildTagChips(p) {
  const chips = [];
  if (p.category) chips.push({ label: p.category, icon: 'leaf' });
  const mlVal = String(p.mlVal || '').trim();
  const mlUnit = String(p.mlUnit || '').trim();
  if (mlVal && mlVal !== '0' && mlUnit && mlUnit !== 'N/A') chips.push({ label: `${mlVal} ${mlUnit}`, icon: 'drop' });
  const skinArr = Array.isArray(p.skin) ? p.skin.filter(s => s && s !== 'No aplica') : (p.skin && p.skin !== 'No aplica' ? [p.skin] : []);
  if (skinArr.length) chips.push({ label: skinArr.join(', '), icon: 'heart' });
  if (p.isKorean) chips.push({ label: 'Producto coreano', icon: 'globe' });
  if (p.isMini) chips.push({ label: 'Mini', icon: 'sparkle' });
  return chips.slice(0, 4);
}

function buildSubtitle(p, descFrases) {
  let subtitle = (p.category || '').trim();
  if (!subtitle && descFrases[0] && descFrases[0].split(' ').length <= 6) subtitle = descFrases[0];
  return subtitle;
}

// ──────────────────────────────────────────
// 5. PRECIO
// ──────────────────────────────────────────
function buildPriceHTML(p, mode, template) {
  const hasMayoreo = p.priceMayoreo && p.priceMayoreo > 0;
  const showAmbos = mode === 'ambos' && hasMayoreo;
  const isMay = mode === 'mayoreo' && hasMayoreo;

  if (template === 'olivo') {
    if (showAmbos) {
      return `
        <div class="olive-price-panel olive-price-double">
          <div class="olive-price-row"><span>Menudeo</span><b>${fmtMoney(p.price)}</b></div>
          <div class="olive-price-row alt"><span>Mayoreo</span><b>${fmtMoney(p.priceMayoreo)}</b></div>
        </div>`;
    }
    const val = isMay ? p.priceMayoreo : p.price;
    return `
      <div class="olive-price-panel">
        <div class="olive-price-value">${fmtMoney(val)}</div>
        ${isMay ? '<div class="olive-price-unit">MAYOREO</div>' : ''}
      </div>`;
  }

  if (template === 'vintage') {
    if (showAmbos) {
      return `
        <div class="vint-price-panel vint-price-double">
          <div class="vint-price-row"><span>Menudeo</span><b>${fmtMoney(p.price)}</b></div>
          <div class="vint-price-row alt"><span>Mayoreo</span><b>${fmtMoney(p.priceMayoreo)}</b></div>
        </div>`;
    }
    const val = isMay ? p.priceMayoreo : p.price;
    return `
      <div class="vint-price-panel">
        <div class="vint-price-value">${fmtMoney(val)}</div>
        <div class="vint-price-unit">${isMay ? 'MAYOREO' : 'PRECIO'}</div>
      </div>`;
  }

  if (showAmbos) {
    return `
      <div class="pink-price-stack">
        <div class="pink-price-blob small">
          <div class="pink-price-label">MENUDEO</div>
          <div class="pink-price-value small">${fmtMoney(p.price)}</div>
        </div>
        <div class="pink-price-blob small alt">
          <div class="pink-price-label">MAYOREO</div>
          <div class="pink-price-value small">${fmtMoney(p.priceMayoreo)}</div>
        </div>
      </div>`;
  }
  const val = isMay ? p.priceMayoreo : p.price;
  return `
    <div class="pink-price-blob">
      <div class="pink-price-label">${isMay ? 'MAYOREO' : '¡SOLO!'}</div>
      <div class="pink-price-value">${fmtMoney(val)}</div>
    </div>`;
}

// ──────────────────────────────────────────
// 6. ARMADO DEL HTML DE CADA TARJETA
// ──────────────────────────────────────────
function esc(str) {
  return String(str || '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

function buildCardHTML(p, mode, template, imgUrl) {
  const nombre = esc(p.name || '');
  const descFrases = getDescFrases(p);
  const subtitle = esc(buildSubtitle(p, descFrases));
  const features = buildFeatureItems(p);
  const chips = buildTagChips(p);
  const priceHTML = buildPriceHTML(p, mode, template);

  if (template === 'olivo') {
    return `
    <div class="olive-inner"></div>
    <div class="olive-header">
      <div class="olive-eyebrow">Aplo Blossom</div>
      <div class="olive-eyebrow-rule"></div>
      <div class="olive-brand">${nombre}</div>
      ${subtitle ? `<div class="olive-sub">${subtitle}</div>` : ''}
    </div>
    <div class="olive-body">
      <div class="olive-photo-frame">
        <div class="olive-photo-plate"></div>
        <div class="olive-photo-mask"><img src="${imgUrl}" crossorigin="anonymous"></div>
      </div>
      <div class="olive-features">
        ${features.map(f => `
        <div class="olive-feat">
          <div class="olive-feat-icon"><span class="ic">${icon(f.icon)}</span></div>
          <div class="olive-feat-desc">${esc(f.text)}</div>
        </div>`).join('')}
      </div>
    </div>
    <div class="olive-footer">
      <div class="olive-tags">
        ${chips.map(c => `<div class="olive-tag"><span class="ic">${icon(c.icon)}</span>${esc(c.label).toUpperCase()}</div>`).join('')}
      </div>
      ${priceHTML}
    </div>`;
  }

  if (template === 'vintage') {
    return `
    <div class="vint-frame"></div>
    <div class="vint-header">
      <div class="vint-stamp">Aplo<br>Blossom</div>
      <div class="vint-brandblock">
        <div class="vint-brand">${nombre}</div>
        ${subtitle ? `<div class="vint-sub">${subtitle}</div>` : ''}
      </div>
    </div>
    <div class="vint-body">
      <div class="vint-photo-frame">
        <div class="vint-photo-mat"></div>
        <div class="vint-photo-mask"><img src="${imgUrl}" crossorigin="anonymous"></div>
        <div class="vint-corner tl"></div>
        <div class="vint-corner tr"></div>
        <div class="vint-corner bl"></div>
        <div class="vint-corner br"></div>
      </div>
      <div class="vint-features">
        ${features.map((f, i) => `
        ${i > 0 ? '<hr class="vint-divider">' : ''}
        <div class="vint-feat">
          <div class="vint-feat-icon"><span class="ic">${icon(f.icon)}</span></div>
          <div class="vint-feat-desc">${esc(f.text)}</div>
        </div>`).join('')}
      </div>
    </div>
    <div class="vint-footer">
      <div class="vint-tags">
        ${chips.map(c => `<div class="vint-tag"><span class="ic">${icon(c.icon)}</span>${esc(c.label).toUpperCase()}</div>`).join('')}
      </div>
      ${priceHTML}
    </div>`;
  }

  return `
    <div class="pink-header">
      <div class="pink-tagline">Aplo<br>Blossom</div>
      <div class="pink-brandblock">
        <div class="pink-brand">${nombre}</div>
        ${subtitle ? `<div class="pink-sub">${subtitle}</div>` : ''}
      </div>
    </div>
    <div class="pink-body">
      <div class="pink-photo-frame">
        <div class="pink-tape"></div>
        <img src="${imgUrl}" crossorigin="anonymous">
        <div class="vignette"></div>
      </div>
      <div class="pink-features">
        ${features.map((f, i) => `
        ${i > 0 ? '<hr class="pink-divider">' : ''}
        <div class="pink-feat">
          <div class="pink-feat-icon"><span class="ic">${icon(f.icon)}</span></div>
          <div class="pink-feat-desc">${esc(f.text)}</div>
        </div>`).join('')}
      </div>
    </div>
    <div class="pink-footer">
      ${priceHTML}
      <div class="pink-cta"><span class="ic">${icon('chat')}</span>¡Envíame mensaje y pídelo hoy!</div>
    </div>
    ${chips.length ? `
    <div class="pink-strip">
      ${chips.map(c => `<div class="pink-strip-item"><span class="ic">${icon(c.icon)}</span>${esc(c.label).toUpperCase()}</div>`).join('')}
    </div>` : ''}`;
}

// ──────────────────────────────────────────
// 7. DETECCIÓN AUTOMÁTICA DE PLANTILLA POR COLOR
// ──────────────────────────────────────────
// Convierte RGB (0-255) a matiz (hue, 0-360) y saturación (0-1).
function rgbToHueSat(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  let h = 0, s = 0;
  if (d !== 0) {
    s = d / (1 - Math.abs(2 * l - 1));
    switch (max) {
      case r: h = 60 * (((g - b) / d) % 6); break;
      case g: h = 60 * (((b - r) / d) + 2); break;
      case b: h = 60 * (((r - g) / d) + 4); break;
    }
  }
  if (h < 0) h += 360;
  return { h, s };
}

// Analiza una imagen ya cargada y decide entre las 3 plantillas según
// su tono dominante:
//   - olivo   -> verdes/botánicos (h 55–170, con saturación real)
//   - rosa    -> rosas/rojos vivos (h 320–360 o 0–20, saturación alta)
//   - vintage -> TODO lo demás: azules, morados, ámbar/café, khaki,
//                y también fotos neutras/blancas/grises (que son la
//                mayoría en skincare) — por eso "vintage" es el color
//                comodín, no rosa como antes.
// Si por CORS no se puede leer el pixel de la imagen, cae a 'vintage'
// (el más neutro) sin tronar el export completo por una sola foto.
function detectTemplateFromImage(imgEl) {
  try {
    const size = 24;
    const c = document.createElement('canvas');
    c.width = size; c.height = size;
    const ctx = c.getContext('2d');
    ctx.drawImage(imgEl, 0, 0, size, size);
    const data = ctx.getImageData(0, 0, size, size).data;
    let r = 0, g = 0, b = 0, n = 0;
    for (let i = 0; i < data.length; i += 4) {
      r += data[i]; g += data[i + 1]; b += data[i + 2]; n++;
    }
    r /= n; g /= n; b /= n;
    const { h, s } = rgbToHueSat(r, g, b);
    if (s < 0.12) return 'vintage'; // foto neutra/gris/blanca -> comodín
    if (h >= 55 && h <= 170) return 'olivo'; // gama verde/oliva
    if ((h >= 320 || h <= 20) && s >= 0.25) return 'rosa'; // rosa/rojo vivo
    return 'vintage'; // azules, morados, ámbar, café, khaki, etc.
  } catch (e) {
    return 'vintage'; // imagen bloqueada por CORS u otro error -> default seguro
  }
}

function loadImageForDetection(imgUrl) {
  return new Promise(resolve => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    const timer = setTimeout(() => resolve(null), 6000);
    img.onload = () => { clearTimeout(timer); resolve(img); };
    img.onerror = () => { clearTimeout(timer); resolve(null); };
    img.src = imgUrl;
  });
}

// Resuelve la plantilla final para un producto según el modo elegido
// en el modal: 'auto' analiza la foto, 'rosa'/'olivo' fuerzan una fija.
async function resolveTemplate(templateMode, imgUrl) {
  if (templateMode !== 'auto') return templateMode;
  const imgEl = await loadImageForDetection(imgUrl);
  if (!imgEl) return 'vintage';
  return detectTemplateFromImage(imgEl);
}

// ──────────────────────────────────────────
// 8. CAPTURA: HTML → imagen
// ──────────────────────────────────────────
async function makeCardBlob(p, mode, template, imgUrl) {
  const stage = ensureStage();
  const card = document.createElement('div');
  card.className = `tpl-card tpl-${template}`;
  card.innerHTML = buildCardHTML(p, mode, template, imgUrl);
  stage.appendChild(card);

  const imgEl = card.querySelector('img');
  await new Promise(resolve => {
    if (!imgEl || imgEl.complete) return resolve();
    imgEl.onload = resolve;
    imgEl.onerror = resolve;
    setTimeout(resolve, 8000);
  });
  await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));

  const canvas = await window.html2canvas(card, {
    scale: 2,
    backgroundColor: null,
    useCORS: true,
    height: card.scrollHeight,
    windowHeight: card.scrollHeight
  });

  stage.removeChild(card);

  return new Promise(resolve => {
    canvas.toBlob(blob => {
      const fname = (p.name || 'producto').replace(/[^a-zA-Z0-9áéíóúñÁÉÍÓÚÑ ]/g, '').trim().replace(/ +/g, '_');
      resolve({ fname: fname + '.jpg', blob });
    }, 'image/jpeg', 0.92);
  });
}

function proxiedUrl(url) {
  return 'https://images.weserv.nl/?url=' + encodeURIComponent(url) + '&output=jpg&q=90';
}

// ──────────────────────────────────────────
// 9. EXPORTAR — JSZip + showDownloadModal
//    template puede ser 'auto' | 'rosa' | 'olivo'
// ──────────────────────────────────────────
window.exportImages = async function(priceMode = 'menudeo', templateMode = 'auto') {
  const prods = state.products.filter(p => p.image && (p.stock || 0) > 0);
  if (!prods.length) { toast('No hay productos con imagen en stock', 'err'); return; }
  toast('Generando imágenes...');
  await ensureTemplateAssets();

  const zip = new (window.JSZip)();
  let count = 0;

  await loadImagesLimited(prods, async (p) => {
    try {
      const imgUrl = proxiedUrl(p.image);
      const template = await resolveTemplate(templateMode, imgUrl);
      const result = await makeCardBlob(p, priceMode, template, imgUrl);
      if (result) { zip.file(result.fname, result.blob); count++; }
      toast(`Procesando... ${count}/${prods.length}`);
    } catch (e) { console.error(e); }
  }, 4);

  const zipBlob = await zip.generateAsync({ type: 'blob' });
  const modeLabel = priceMode === 'ambos' ? 'ambos-precios' : priceMode;
  showDownloadModal(`ZIP listo (${count} imágenes)`, zipBlob, `catalogo-aploblossom-${modeLabel}-${templateMode}.zip`);
};

// ──────────────────────────────────────────
// 10. MODAL — automático (recomendado) + forzar rosa/olivo
// ──────────────────────────────────────────
window._exportTemplateChoice = 'auto';

window.openExportImagesModal = function() {
  const tpl = window._exportTemplateChoice;
  const opt = (key, label, sub) => `
    <button class="btn ${tpl === key ? 'btn-primary' : 'btn-outline'} btn-full"
            onclick="window._exportTemplateChoice='${key}'; window.openExportImagesModal();"
            style="padding:12px;text-align:left;">
      <div style="font-weight:600;font-size:13px;">${label}</div>
      ${sub ? `<div style="font-size:11px;color:var(--text-light);font-weight:400;">${sub}</div>` : ''}
    </button>`;

  showModal('modalExportImg', `
    <div class="modal-header"><div class="modal-title">Exportar imágenes</div><button class="modal-close" onclick="closeModal('modalExportImg')">×</button></div>

    <div style="font-size:13px;color:var(--text-light);margin-bottom:10px;">1. Elige el diseño de la imagen.</div>
    <div style="display:flex;flex-direction:column;gap:8px;margin-bottom:18px;">
      ${opt('auto', 'Automático (recomendado)', 'Elige rosa, olivo o café según los colores de cada foto')}
      ${opt('rosa', TEMPLATES.rosa.label, 'Forzar esta plantilla para todo el lote')}
      ${opt('olivo', TEMPLATES.olivo.label, 'Forzar esta plantilla para todo el lote')}
      ${opt('vintage', TEMPLATES.vintage.label, 'Forzar esta plantilla para todo el lote')}
    </div>

    <div style="font-size:13px;color:var(--text-light);margin-bottom:16px;">2. Elige qué precio mostrar.</div>
    <div style="display:flex;flex-direction:column;gap:10px;margin-bottom:16px;">

      <button class="btn btn-outline btn-full" onclick="closeModal('modalExportImg');exportImages('menudeo', window._exportTemplateChoice)" style="padding:14px;text-align:left;">
        <div style="font-weight:600;">Solo precio menudeo</div>
        <div style="font-size:12px;color:var(--text-light);">Muestra el precio normal de venta</div>
      </button>

      <button class="btn btn-outline btn-full" onclick="closeModal('modalExportImg');exportImages('mayoreo', window._exportTemplateChoice)" style="padding:14px;text-align:left;border-color:#c8a86a;">
        <div style="font-weight:600;color:#7a6230;">Solo precio mayoreo</div>
        <div style="font-size:12px;color:var(--text-light);">Muestra el precio de mayoreo</div>
      </button>

      <button class="btn btn-primary btn-full" onclick="closeModal('modalExportImg');exportImages('ambos', window._exportTemplateChoice)" style="padding:14px;text-align:left;">
        <div style="font-weight:600;">Menudeo + Mayoreo</div>
        <div style="font-size:12px;color:rgba(245,240,232,.75);">Muestra ambos precios en la imagen para comparar</div>
      </button>

    </div>
  `);
};

// ──────────────────────────────────────────
// 11. CSS de las dos plantillas
// ──────────────────────────────────────────
const TEMPLATE_CSS = `
.tpl-card{ width:900px; box-sizing:border-box; }
.tpl-card *{ box-sizing:border-box; }

/* ---------- ROSA ---------- */
.tpl-rosa{
  background:#FDF1F5; position:relative; overflow:hidden; border-radius:6px;
  font-family:'Nunito', sans-serif; color:#241F26;
}
.tpl-rosa::before{ content:""; position:absolute; top:-130px; right:-150px; width:440px; height:440px;
  background:radial-gradient(circle at 30% 30%, #FBD9E6 0%, #FBD9E6 55%, transparent 72%); opacity:.9; }
.tpl-rosa::after{ content:""; position:absolute; bottom:-160px; left:-120px; width:360px; height:360px;
  background:radial-gradient(circle at 60% 60%, #FCE6EE 0%, #FCE6EE 50%, transparent 70%); opacity:.8; }
.pink-header{ position:relative; padding:56px 60px 0 60px; display:flex; justify-content:space-between; align-items:flex-start; }
.pink-tagline{ background:#fff; border:2px solid #FBD9E6; color:#B22F63; font-family:'Caveat', cursive; font-weight:700;
  font-size:31px; line-height:1.08; padding:16px 24px; border-radius:20px; transform:rotate(-4deg);
  box-shadow:0 8px 16px rgba(178,47,99,.14); max-width:200px; text-align:center; }
.pink-brandblock{ text-align:right; max-width:520px; }
.pink-brand{ font-family:'Fredoka', sans-serif; font-weight:700; font-size:46px; letter-spacing:-.5px; line-height:1.05; }
.pink-sub{ font-family:'Fredoka', sans-serif; font-weight:600; font-size:24px; color:#E24E86; margin-top:8px; }
.pink-body{ position:relative; display:flex; align-items:center; gap:20px; padding:36px 50px 0 50px; }
.pink-photo-frame{ flex:0 0 430px; height:560px; background:#fff; border-radius:22px;
  box-shadow:0 20px 44px rgba(178,47,99,.16), 0 4px 10px rgba(0,0,0,.04); position:relative; overflow:hidden; transform:rotate(-2deg); }
.pink-photo-frame img{ width:100%; height:100%; object-fit:cover; object-position:center; }
.pink-photo-frame .vignette{ position:absolute; inset:0; background:linear-gradient(180deg, rgba(253,241,245,0) 60%, rgba(253,241,245,.55) 100%); }
.pink-tape{ position:absolute; top:-16px; left:50%; transform:translateX(-50%) rotate(-3deg); width:96px; height:36px; background:rgba(242,167,59,.55); border-radius:2px; z-index:2; }
.pink-features{ flex:1; display:flex; flex-direction:column; gap:22px; }
.pink-feat{ display:flex; align-items:flex-start; gap:18px; }
.pink-feat-icon{ flex:0 0 58px; height:58px; border-radius:50%; background:#FBD9E6; display:flex; align-items:center; justify-content:center; color:#B22F63; font-size:26px; }
.pink-feat-desc{ font-family:'Fredoka',sans-serif; font-weight:600; font-size:19px; line-height:1.35; padding-top:6px; }
.pink-divider{ border:none; border-top:1.5px dashed #FBD9E6; margin:0; }
.pink-footer{ position:relative; margin-top:32px; padding:0 50px 40px 50px; display:flex; align-items:center; gap:22px; }
.pink-price-blob{ position:relative; background:linear-gradient(135deg, #E24E86, #B22F63); color:#fff; border-radius:26px; padding:20px 36px; box-shadow:0 16px 26px rgba(178,47,99,.30); }
.pink-price-blob.alt{ background:linear-gradient(135deg, #7a6230, #4a3a1c); }
.pink-price-blob.small{ padding:12px 24px; }
.pink-price-stack{ display:flex; flex-direction:column; gap:10px; }
.pink-price-label{ font-family:'Fredoka',sans-serif; font-size:15px; font-weight:600; opacity:.9; letter-spacing:.06em; }
.pink-price-value{ font-family:'Fredoka',sans-serif; font-weight:700; font-size:54px; line-height:1; }
.pink-price-value.small{ font-size:30px; }
.pink-cta{ flex:1; background:#241F26; color:#fff; font-family:'Fredoka',sans-serif; font-weight:600; font-size:19px;
  text-align:center; padding:21px 20px; border-radius:999px; display:flex; align-items:center; justify-content:center; gap:10px; }
.pink-cta .ic{ font-size:22px; }
.pink-strip{ position:relative; background:#fff; border-top:1px solid #FBD9E6; padding:26px 50px; display:flex; flex-wrap:wrap; gap:20px; justify-content:space-between; }
.pink-strip-item{ display:flex; align-items:center; gap:11px; font-size:13.5px; font-weight:800; color:#6b6570; text-transform:uppercase; letter-spacing:.02em; }
.pink-strip-item .ic{ font-size:27px; color:#B22F63; }

/* ---------- OLIVO ---------- */
.tpl-olivo{ background:#F6F2E7; position:relative; overflow:hidden; border-radius:6px; font-family:'Manrope', sans-serif; color:#3E4A2C; }
.olive-inner{ position:absolute; inset:22px; border:1px solid #C9C0A6; border-radius:2px; }
.olive-header{ position:relative; text-align:center; padding:64px 60px 0 60px; }
.olive-eyebrow{ font-family:'Manrope', sans-serif; font-weight:600; font-size:13px; color:#7C8C55; letter-spacing:.28em; text-transform:uppercase; }
.olive-eyebrow-rule{ width:50px; height:1px; background:#C9C0A6; margin:16px auto; }
.olive-brand{ font-family:'Fraunces', serif; font-weight:600; font-size:52px; letter-spacing:-.01em; line-height:1.1; }
.olive-sub{ font-family:'Fraunces', serif; font-style:italic; font-weight:500; font-size:28px; color:#7C8C55; margin-top:8px; }
.olive-body{ position:relative; display:flex; align-items:center; gap:22px; padding:32px 55px 0 55px; }
.olive-photo-frame{ flex:0 0 400px; height:520px; display:flex; align-items:center; justify-content:center; position:relative; }
.olive-photo-plate{ position:absolute; inset:0; border-radius:22px; background:radial-gradient(circle at 40% 35%, #FFFFFF 0%, #F1ECDC 68%, transparent 85%); box-shadow:0 22px 34px rgba(62,74,44,.14); }
.olive-photo-mask{ position:relative; width:100%; height:100%; border-radius:22px; overflow:hidden; box-shadow:0 18px 26px rgba(62,74,44,.16); border:7px solid #FBF8F0; }
.olive-photo-mask img{ width:100%; height:100%; object-fit:cover; object-position:center; }
.olive-features{ flex:1; display:flex; flex-direction:column; }
.olive-feat{ display:flex; align-items:center; gap:16px; padding:19px 0; border-bottom:1px solid #C9C0A6; }
.olive-feat:first-child{ padding-top:0; }
.olive-feat-icon{ flex:0 0 50px; height:50px; border-radius:50%; background:#EAE4CF; display:flex; align-items:center; justify-content:center; color:#3E4A2C; }
.olive-feat-icon .ic{ font-size:24px; }
.olive-feat-desc{ font-family:'Manrope',sans-serif; font-weight:600; font-size:16px; line-height:1.4; }
.olive-footer{ position:relative; margin-top:34px; padding:0 55px 46px 55px; display:flex; align-items:center; justify-content:space-between; gap:20px; flex-wrap:wrap; }
.olive-tags{ display:flex; gap:20px; flex-wrap:wrap; }
.olive-tag{ font-family:'Manrope',sans-serif; font-weight:600; font-size:14px; color:#5c5a4d; display:flex; align-items:center; gap:9px; }
.olive-tag .ic{ color:#7C8C55; font-size:22px; }
.olive-price-panel{ background:#3E4A2C; color:#FBF8F0; border-radius:16px; padding:18px 32px; text-align:center; box-shadow:0 18px 26px rgba(62,74,44,.24); }
.olive-price-value{ font-family:'Fraunces', serif; font-weight:600; font-size:40px; line-height:1; }
.olive-price-unit{ font-family:'Manrope', sans-serif; font-size:11.5px; letter-spacing:.14em; opacity:.75; margin-top:5px; }
.olive-price-double{ display:flex; flex-direction:column; gap:10px; padding:16px 28px; }
.olive-price-row{ display:flex; justify-content:space-between; gap:20px; font-family:'Manrope',sans-serif; }
.olive-price-row span{ font-size:12px; letter-spacing:.1em; opacity:.75; align-self:center; }
.olive-price-row b{ font-family:'Fraunces',serif; font-size:24px; }
.olive-price-row.alt{ opacity:.85; }

/* ---------- CAFÉ / VINTAGE ---------- */
.tpl-vintage{ background:#EFE6D8; position:relative; overflow:hidden; border-radius:6px; font-family:'Nunito', sans-serif; color:#3E2F23; }
.vint-frame{ position:absolute; inset:20px; border:1px dashed #C7B393; border-radius:2px; }
.vint-header{ position:relative; padding:56px 60px 0 60px; display:flex; align-items:flex-start; gap:24px; }
.vint-stamp{ flex:0 0 118px; height:118px; border:2px solid #6F4E37; border-radius:50%; display:flex; align-items:center; justify-content:center; text-align:center; font-family:'Special Elite', monospace; font-size:14px; line-height:1.3; color:#6F4E37; transform:rotate(-8deg); background:#F7F1E6; }
.vint-brandblock{ padding-top:10px; }
.vint-brand{ font-family:'Cormorant Garamond', serif; font-weight:600; font-size:50px; letter-spacing:.01em; line-height:1.05; }
.vint-sub{ font-family:'Special Elite', monospace; font-size:16px; letter-spacing:.08em; text-transform:uppercase; color:#A9906F; margin-top:10px; }
.vint-body{ position:relative; display:flex; align-items:center; gap:24px; padding:34px 55px 0 55px; }
.vint-photo-frame{ flex:0 0 400px; height:520px; position:relative; }
.vint-photo-mat{ position:absolute; inset:0; background:#F7F1E6; border-radius:4px; box-shadow:0 18px 30px rgba(62,47,35,.14); }
.vint-photo-mask{ position:absolute; inset:14px; overflow:hidden; }
.vint-photo-mask img{ width:100%; height:100%; object-fit:cover; object-position:center; filter:sepia(.12); }
.vint-corner{ position:absolute; width:22px; height:22px; border-color:#6F4E37; }
.vint-corner.tl{ top:6px; left:6px; border-top:2px solid; border-left:2px solid; }
.vint-corner.tr{ top:6px; right:6px; border-top:2px solid; border-right:2px solid; }
.vint-corner.bl{ bottom:6px; left:6px; border-bottom:2px solid; border-left:2px solid; }
.vint-corner.br{ bottom:6px; right:6px; border-bottom:2px solid; border-right:2px solid; }
.vint-features{ flex:1; display:flex; flex-direction:column; }
.vint-feat{ display:flex; align-items:center; gap:16px; padding:19px 0; }
.vint-feat-icon{ flex:0 0 50px; height:50px; border-radius:50%; background:#E4D5BB; display:flex; align-items:center; justify-content:center; color:#6F4E37; }
.vint-feat-icon .ic{ font-size:24px; }
.vint-feat-desc{ font-family:'Nunito',sans-serif; font-weight:700; font-size:16px; line-height:1.4; }
.vint-divider{ border:none; border-top:1px dashed #C7B393; margin:0; }
.vint-footer{ position:relative; margin-top:34px; padding:0 55px 46px 55px; display:flex; align-items:center; justify-content:space-between; gap:20px; flex-wrap:wrap; }
.vint-tags{ display:flex; gap:20px; flex-wrap:wrap; }
.vint-tag{ font-family:'Special Elite', monospace; font-weight:400; font-size:12px; letter-spacing:.05em; color:#6F4E37; display:flex; align-items:center; gap:9px; }
.vint-tag .ic{ color:#6F4E37; font-size:20px; }
.vint-price-panel{ background:#6F4E37; color:#F7F1E6; border-radius:4px; padding:18px 32px; text-align:center; box-shadow:0 18px 26px rgba(62,47,35,.24); }
.vint-price-value{ font-family:'Cormorant Garamond', serif; font-weight:600; font-size:42px; line-height:1; }
.vint-price-unit{ font-family:'Special Elite', monospace; font-size:11px; letter-spacing:.14em; opacity:.8; margin-top:6px; }
.vint-price-double{ display:flex; flex-direction:column; gap:10px; padding:16px 28px; }
.vint-price-row{ display:flex; justify-content:space-between; gap:20px; font-family:'Nunito',sans-serif; }
.vint-price-row span{ font-size:11px; letter-spacing:.1em; opacity:.8; align-self:center; font-family:'Special Elite',monospace; }
.vint-price-row b{ font-family:'Cormorant Garamond',serif; font-size:22px; }
.vint-price-row.alt{ opacity:.85; }

.ic{ display:inline-flex; width:1em; height:1em; vertical-align:-0.15em; }
.ic svg{ width:100%; height:100%; }
`;
