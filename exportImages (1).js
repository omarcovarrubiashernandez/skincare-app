import { state, costoInsumos } from './state.js';
import { fmtMoney, toast, showModal, stripEmoji } from './utils.js';
import { showDownloadModal, loadImagesLimited } from './catalogo.js';

const TEMPLATE_BG = '#F8F5EF';
const IMAGE_LOAD_TIMEOUT_MS = 8000;
const CANVAS_TIMEOUT_MS = 25000;
const CARD_SCALE = 2.5;   // 1000px de tarjeta x 2.5 = 2500px de ancho

let _stylesReady = null;
function ensureTemplateAssets() {
  if (_stylesReady) return _stylesReady;
  _stylesReady = new Promise((resolve) => {
    if (!document.getElementById('_tplFontsLink')) {
      const link = document.createElement('link');
      link.id = '_tplFontsLink';
      link.rel = 'stylesheet';
      link.href = 'https://fonts.googleapis.com/css2?family=Fredoka:wght@500;600;700&family=Caveat:wght@600;700&family=Nunito:wght@400;600;700;800&display=swap';
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
      document.fonts.load('800 20px "Nunito"')
    ]).then(() => resolve()).catch(() => resolve());
  });
  return _stylesReady;
}

function ensureStage() {
  let stage = document.getElementById('_cardStage');
  if (!stage) {
    stage = document.createElement('div');
    stage.id = '_cardStage';
    stage.style.position = 'fixed';
    stage.style.left = '0';
    stage.style.top = '0';
    stage.style.width = '0';
    stage.style.height = '0';
    stage.style.overflow = 'hidden';
    stage.style.zIndex = '-1';
    document.body.appendChild(stage);
  }
  return stage;
}

function withTimeout(promise, ms, label) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`Timeout (${label}) tras ${ms}ms`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

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

function getDescFrases(p) {
  const descClean = stripEmoji(p.description || '');
  return descClean
    ? descClean.split('\n').map(s => s.trim()).filter(Boolean)
    : [];
}

function buildFeatureItems(p) {
  const frases = getDescFrases(p);
  return frases.map(frase => ({ icon: pickIconKey(frase), text: frase }));
}

function splitFeatureText(text) {
  const clean = (text || '').trim();
  const idx = clean.indexOf(':');
  if (idx === -1) return { title: clean, desc: '' };
  const title = clean.slice(0, idx).trim();
  const desc = clean.slice(idx + 1).trim();
  return { title, desc };
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

function buildPriceHTML(p, mode) {
  const hasMayoreo = p.priceMayoreo && p.priceMayoreo > 0;
  const showAmbos = mode === 'ambos' && hasMayoreo;
  const isMay = mode === 'mayoreo' && hasMayoreo;

  if (showAmbos) {
    return `
      <div class="pink-price-stack">
        <div class="pink-price-blob">
          <div class="pink-price-label">MENUDEO</div>
          <div class="pink-price-value">${fmtMoney(p.price + costoInsumos)}</div>
        </div>
        <div class="pink-price-blob alt">
          <div class="pink-price-label">MAYOREO</div>
          <div class="pink-price-value">${fmtMoney(p.priceMayoreo + costoInsumos)}</div>
        </div>
      </div>`;
  }
  const val = (isMay ? p.priceMayoreo : p.price) + costoInsumos;
  return `
    <div class="pink-price-wrap">
      <div class="pink-price-brush"></div>
      <div class="pink-price-label">${isMay ? 'MAYOREO' : '¡SOLO!'}</div>
      <div class="pink-price-value">${fmtMoney(val)}</div>
    </div>`;
}

function esc(str) {
  return String(str || '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

function buildCardHTML(p, mode, imgUrl) {
  const nombre = esc(p.name || '');
  const descFrases = getDescFrases(p);
  const subtitle = esc(buildSubtitle(p, descFrases));
  const features = buildFeatureItems(p);
  const chips = buildTagChips(p);
  const priceHTML = buildPriceHTML(p, mode);

  return `
    <div class="pink-main">
      <div class="pink-photo-col">
        <div class="pink-photo-frame">
          <img src="${imgUrl}" crossorigin="anonymous">
          <div class="pink-photo-shade"></div>
        </div>
        <div class="pink-badge">Aplo<br>Blossom <span class="ic">${icon('heart')}</span></div>
      </div>
      <div class="pink-content-col">
        <div class="pink-brand">${nombre}</div>
        ${subtitle ? `<div class="pink-sub-pill">${subtitle}</div>` : ''}
        <div class="pink-features">
          ${features.map(f => {
            const { title, desc } = splitFeatureText(f.text);
            return `
            <div class="pink-feat">
              <div class="pink-feat-icon"><span class="ic">${icon(f.icon)}</span></div>
              <div class="pink-feat-body">
                <div class="pink-feat-title">${esc(title)}</div>
                ${desc ? `<div class="pink-feat-desc">${esc(desc)}</div>` : ''}
              </div>
            </div>`;
          }).join('')}
        </div>
        <div class="pink-bottom">
          ${priceHTML}
          <div class="pink-cta"><span class="ic">${icon('chat')}</span>¡Envíame mensaje y pídelo hoy!</div>
        </div>
      </div>
    </div>
    ${chips.length ? `
    <div class="pink-strip">
      ${chips.map(c => `<div class="pink-strip-item"><span class="ic">${icon(c.icon)}</span>${esc(c.label).toUpperCase()}</div>`).join('')}
    </div>` : ''}`;
}

async function makeCardBlob(p, mode, imgUrl) {
  const stage = ensureStage();
  const card = document.createElement('div');
  card.className = 'tpl-card tpl-rosa';
  card.innerHTML = buildCardHTML(p, mode, imgUrl);
  stage.appendChild(card);

  try {
    const imgEl = card.querySelector('img');
    await withTimeout(new Promise(resolve => {
      if (!imgEl || imgEl.complete) return resolve();
      imgEl.onload = resolve;
      imgEl.onerror = resolve;
    }), IMAGE_LOAD_TIMEOUT_MS, `carga imagen ${p.name || ''}`).catch(() => {});

    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));

    const cardW = card.offsetWidth;
    const cardH = card.offsetHeight;

    const canvas = await withTimeout(
      window.html2canvas(card, {
        scale: CARD_SCALE,
        backgroundColor: TEMPLATE_BG,
        useCORS: true,
        width: cardW,
        height: cardH,
        windowWidth: cardW,
        windowHeight: cardH
      }),
      CANVAS_TIMEOUT_MS,
      `html2canvas ${p.name || ''}`
    );

    return await new Promise(resolve => {
      canvas.toBlob(blob => {
        resolve({ fname: safeFileBase(p.name) + '.jpg', blob });
      }, 'image/jpeg', 0.96);
    });
  } finally {
    stage.removeChild(card);
  }
}

function proxiedUrl(url) {
  return 'https://images.weserv.nl/?url=' + encodeURIComponent(url) + '&output=jpg&q=100';
}

function safeFileBase(name) {
  return (name || 'producto').replace(/[^a-zA-Z0-9áéíóúñÁÉÍÓÚÑ ]/g, '').trim().replace(/ +/g, '_') || 'producto';
}

// Descarga la foto ORIGINAL del producto (sin tarjeta, sin texto, sin recomprimir).
// Primero intenta directo; si el navegador lo bloquea por CORS, usa el proxy sin cambiar tamaño.
async function fetchRawPhoto(p) {
  const tryFetch = async (url) => {
    const res = await withTimeout(fetch(url), IMAGE_LOAD_TIMEOUT_MS * 2, `descarga ${p.name || ''}`);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return res.blob();
  };
  let blob;
  try { blob = await tryFetch(p.image); }
  catch (_) { blob = await tryFetch('https://images.weserv.nl/?url=' + encodeURIComponent(p.image)); }
  const t = (blob.type || '').toLowerCase();
  const ext = t.includes('png') ? '.png' : t.includes('webp') ? '.webp' : '.jpg';
  return { blob, ext };
}

function pickUniqueName(usedNames, base, ext, renamed, productName) {
  const n = (usedNames.get(base) || 0) + 1;
  usedNames.set(base, n);
  if (n > 1) { renamed.push(productName); return `${base}_${n}${ext}`; }
  return base + ext;
}

// mode: 'menudeo' | 'mayoreo' | 'ambos'  -> tarjeta con formato
//       'foto'                           -> solo la foto original del producto
window.exportImages = async function(priceMode = 'menudeo') {
  const prods = state.products.filter(p => p.image && (p.stock || 0) > 0);
  if (!prods.length) { toast('No hay productos con imagen en stock', 'err'); return; }
  const rawOnly = priceMode === 'foto';

  if (!rawOnly) {
    if (typeof window.html2canvas !== 'function') {
      toast('Error: html2canvas no está cargado en la página (revisa el <script> que lo incluye)', 'err');
      console.error('window.html2canvas no es una función. Valor actual:', window.html2canvas);
      return;
    }
    toast('Generando imágenes...');
    await ensureTemplateAssets();
  } else {
    toast('Descargando fotos...');
  }

  const zip = new (window.JSZip)();
  let count = 0;
  let failed = 0;
  let firstError = null;
  const usedNames = new Map();   // nombre base -> veces usado
  const renamed = [];            // productos cuyo archivo se renombro por estar repetido
  const sinImagen = state.products.filter(p => !p.image && (p.stock || 0) > 0);

  await loadImagesLimited(prods, async (p) => {
    try {
      if (rawOnly) {
        const { blob, ext } = await fetchRawPhoto(p);
        zip.file(pickUniqueName(usedNames, safeFileBase(p.name), ext, renamed, p.name), blob);
        count++;
      } else {
        const result = await makeCardBlob(p, priceMode, proxiedUrl(p.image));
        if (result) {
          const base = result.fname.replace(/\.jpg$/i, '');
          zip.file(pickUniqueName(usedNames, base, '.jpg', renamed, p.name), result.blob);
          count++;
        }
      }
      toast(`Procesando... ${count}/${prods.length}`);
    } catch (e) {
      failed++;
      if (!firstError) firstError = { name: p.name, image: p.image, message: e && e.message };
      console.error(`No se pudo generar la imagen de "${p.name}" (URL original: ${p.image}):`, e);
      toast(`Procesando... ${count}/${prods.length}`);
    }
  }, rawOnly ? 6 : 3);

  if (failed) {
    const detail = firstError ? ` — primer error: "${firstError.message}" (producto: ${firstError.name})` : '';
    toast(`${failed} producto(s) se saltaron por error o timeout${detail}`, 'err');
    console.error('Resumen de fallos. Primer error completo:', firstError);
  }

  if (sinImagen.length) {
    console.warn(`${sinImagen.length} producto(s) en stock SIN imagen (no entran al zip):`, sinImagen.map(p => p.name));
    toast(`${sinImagen.length} producto(s) en stock no tienen imagen y se omitieron`, 'err');
  }
  if (renamed.length) console.info(`${renamed.length} archivo(s) tenian nombre repetido y se renombraron:`, renamed);

  if (count === 0) return;

  // STORE = sin recomprimir: los JPG ya vienen comprimidos y asi el zip se arma mas rapido
  const zipBlob = await zip.generateAsync({ type: 'blob', compression: 'STORE' });
  const label = rawOnly ? 'fotos-originales' : (priceMode === 'ambos' ? 'ambos-precios' : priceMode);
  showDownloadModal(`ZIP listo (${count} ${rawOnly ? 'fotos' : 'imágenes'})`, zipBlob, `aploblossom-${label}.zip`);
};

// Descarga UN solo producto (boton junto a cada producto en Inventario)
window.downloadProductCard = async function(id, priceMode = 'menudeo') {
  const p = state.products.find(x => x.id === id);
  if (!p) return;
  if (!p.image) { toast('Este producto no tiene imagen', 'err'); return; }
  try {
    if (priceMode === 'foto') {
      toast('Descargando foto...');
      const { blob, ext } = await fetchRawPhoto(p);
      showDownloadModal('Foto lista', blob, safeFileBase(p.name) + ext);
      return;
    }
    if (typeof window.html2canvas !== 'function') { toast('html2canvas no está cargado', 'err'); return; }
    toast('Generando imagen...');
    await ensureTemplateAssets();
    const result = await makeCardBlob(p, priceMode, proxiedUrl(p.image));
    showDownloadModal('Imagen lista', result.blob, result.fname);
  } catch (e) {
    console.error(`No se pudo generar la imagen de "${p.name}":`, e);
    toast('No se pudo generar: ' + (e && e.message ? e.message : 'error'), 'err');
  }
};

// Sin id -> exporta TODO el stock en .zip. Con id -> descarga solo ese producto.
window.openExportImagesModal = function(productId) {
  const one = typeof productId === 'string' && productId;
  const p = one ? state.products.find(x => x.id === one) : null;
  const run = (mode) => one
    ? `closeModal('modalExportImg');downloadProductCard('${one}','${mode}')`
    : `closeModal('modalExportImg');exportImages('${mode}')`;
  const opt = (mode, title, sub, extra = '') => `
      <button class="btn btn-outline btn-full" onclick="${run(mode)}" style="padding:14px;text-align:left;${extra}">
        <div style="font-weight:600;">${title}</div>
        <div style="font-size:12px;color:var(--text-light);">${sub}</div>
      </button>`;
  showModal('modalExportImg', `
    <div class="modal-header"><div class="modal-title">${p ? esc(p.name) : 'Exportar imágenes (.zip)'}</div><button class="modal-close" onclick="closeModal('modalExportImg')">×</button></div>

    <div style="font-size:13px;color:var(--text-light);margin-bottom:16px;">${p ? 'Elige qué descargar de este producto.' : 'Elige qué precio mostrar en la imagen, o descarga solo las fotos.'}</div>
    <div style="display:flex;flex-direction:column;gap:10px;margin-bottom:16px;">
      ${opt('menudeo', 'Tarjeta · precio menudeo', 'Muestra el precio normal de venta')}
      ${opt('mayoreo', 'Tarjeta · precio mayoreo', 'Muestra el precio de mayoreo', 'border-color:#c8a86a;')}
      ${opt('ambos', 'Tarjeta · menudeo + mayoreo', 'Muestra ambos precios en la imagen')}
      ${opt('foto', 'Solo la foto del producto', 'Foto original, sin tarjeta, sin texto, sin ml', 'border-style:dashed;')}
    </div>
  `);
};

const TEMPLATE_CSS = `
.tpl-card{ width:1000px; box-sizing:border-box; }
.tpl-card *{ box-sizing:border-box; }

.tpl-rosa{
  --olive:#68705A;
  --olive-dark:#30352C;
  --olive-soft:#AEB4A1;
  --beige:#E8DDCE;
  --nude:#D9C4AE;
  --cream:#F8F5EF;
  --cream-2:#F1ECE3;
  --text:#30322D;
  --muted:#77756E;

  position:relative; overflow:hidden; border-radius:10px;
  font-family:'Nunito', sans-serif; color:var(--text);

  background: var(--cream);
}

.pink-main{ position:relative; z-index:2; display:flex; gap:36px; padding:40px 42px 0; }

.pink-photo-col{ flex:0 0 520px; position:relative; min-height:700px; display:flex; align-items:center; }

.pink-photo-col::before{
  content:""; position:absolute; width:380px; height:480px; left:-60px; top:60px; pointer-events:none;
  background:rgba(217,196,174,.38); border-radius:50%;
  transform:rotate(-18deg);
}
.pink-photo-col::after{
  content:""; position:absolute; width:110px; height:110px; border:2px dashed rgba(104,112,90,.25);
  border-radius:50%; bottom:25px; left:-10px; pointer-events:none;
}

.pink-photo-frame{ position:relative; width:100%; height:660px; overflow:hidden; border-radius:28px; background:#fff;
  border:1px solid rgba(48,53,44,.10); transform:rotate(-1.5deg); }
.pink-photo-frame img{ width:100%; height:100%; display:block; object-fit:cover; object-position:center; }
.pink-photo-shade{ position:absolute; inset:0; background:rgba(48,53,44,.06); }

.pink-badge{ position:absolute; z-index:4; top:-6px; left:-4px; max-width:160px; text-align:center; padding:15px 18px;
  border-radius:26px; background:#F0E4D6; color:var(--olive-dark);
  font-family:'Caveat',cursive; font-size:23px; font-weight:700; line-height:1.05; transform:rotate(-7deg);
  border:1px solid rgba(48,53,44,.08); }
.pink-badge .ic{ color:var(--olive); }

.pink-content-col{ flex:1; min-width:0; display:flex; flex-direction:column; padding-bottom:40px; }

.pink-brand{ font-family:'Fredoka',sans-serif; font-size:32px; line-height:1.08; font-weight:700; letter-spacing:.3px;
  color:var(--olive-dark); text-transform:uppercase; }

.pink-sub-pill{ display:inline-block; align-self:flex-start; margin-top:14px; padding:9px 22px; border-radius:999px;
  text-align:center; background:var(--nude); color:#fff; font-family:'Fredoka',sans-serif;
  font-size:20px; font-weight:600; letter-spacing:.07em; text-transform:uppercase; }

.pink-features{ margin-top:24px; display:flex; flex-direction:column; gap:0; }
.pink-feat{ display:flex; align-items:center; gap:16px; padding:14px 0; border-bottom:1px dashed rgba(104,112,90,.28); }
.pink-feat:last-child{ border-bottom:0; }

.pink-feat-icon{ flex:0 0 60px; width:60px; height:60px; border-radius:50%; display:flex; align-items:center; justify-content:center;
  background:var(--beige); color:var(--olive); font-size:24px;
  border:1px solid rgba(104,112,90,.10); }

.pink-feat-body{ flex:1; padding-top:1px; }
.pink-feat-title{ font-family:'Fredoka',sans-serif; font-size:21px; font-weight:700; line-height:1.18; color:var(--olive-dark); text-transform:uppercase; letter-spacing:.01em; }
.pink-feat-desc{ margin-top:4px; font-size:18px; font-weight:600; line-height:1.32; color:var(--muted); }

.pink-bottom{ margin-top:auto; padding-top:26px; display:flex; flex-direction:column; align-items:stretch; gap:14px; }

.pink-price-wrap{ position:relative; display:flex; flex-direction:column; align-items:center; justify-content:center; padding:16px 20px; text-align:center; }
.pink-price-brush{ position:absolute; inset:-6px -14px; z-index:0; opacity:.9;
  background:var(--nude);
  border-radius:24px; transform:rotate(-3deg); }
.pink-price-wrap > *{ position:relative; z-index:1; }
.pink-price-label{ font-family:'Fredoka',sans-serif; font-size:17px; font-weight:600; color:var(--olive); text-transform:uppercase; letter-spacing:.08em; }
.pink-price-value{ margin-top:2px; font-family:'Fredoka',sans-serif; font-size:46px; font-weight:700; line-height:.95; color:var(--olive-dark); }

.pink-price-stack{ display:flex; gap:12px; }
.pink-price-blob{ position:relative; flex:1; padding:14px 16px; text-align:center; border-radius:20px;
  background:var(--olive-dark); }
.pink-price-blob.alt{ background:#7A5F3E; }
.pink-price-blob .pink-price-label{ color:#fff; opacity:.85; }
.pink-price-blob .pink-price-value{ color:#fff; font-size:24px; margin-top:2px; }

.pink-cta{ position:relative; width:100%; display:flex; align-items:center; justify-content:center; gap:10px;
  padding:17px 22px; border-radius:999px; background:var(--olive-dark); color:#fff;
  font-family:'Fredoka',sans-serif; font-size:18px; font-weight:600; text-align:center; }
.pink-cta .ic{ font-size:20px; }

.pink-strip{ position:relative; z-index:3; margin-top:0; padding:20px 42px; display:flex; align-items:center; justify-content:space-around;
  gap:8px; background:#EFE4D5; border-top:1px solid rgba(104,112,90,.13); flex-wrap:wrap; }
.pink-strip-item{ flex:1; min-width:120px; display:flex; align-items:center; justify-content:center; gap:8px; padding:4px 10px;
  font-size:14px; font-weight:800; line-height:1.25; text-align:center; color:var(--olive-dark); text-transform:uppercase; }
.pink-strip-item:not(:last-child){ border-right:1px solid rgba(104,112,90,.18); }
.pink-strip-item .ic{ flex:0 0 auto; color:var(--olive); font-size:26px; }

.ic{ display:inline-flex; width:1em; height:1em; vertical-align:-0.15em; }
.ic svg{ width:100%; height:100%; }
`;
