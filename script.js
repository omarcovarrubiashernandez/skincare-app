// ════════════════════════════════════════════════════════════
// APLO BLOSSOM - SCRIPT CORREGIDO Y MEJORADO (PURE JS)
// ════════════════════════════════════════════════════════════

window.onerror = function(msg, src, line, col, err) {
  const c = document.getElementById('mainContent');
  if(c) c.innerHTML = '<div style="padding:20px;color:red;font-size:13px;font-family:monospace;word-break:break-all;"><b>JS Error:</b><br>' + msg + '<br>Line: ' + line + '<br>' + (err&&err.stack?err.stack:'') + '</div>';
};

const firebaseConfig = {
  apiKey: "AIzaSyCSBO1WxMpDFakY-6zgygJAu6n6Hyp3W80",
  authDomain: "aplo-blossom.firebaseapp.com",
  projectId: "aplo-blossom",
  storageBucket: "aplo-blossom.firebasestorage.app",
  messagingSenderId: "636625295603",
  appId: "1:636625295603:web:5551ef6fb1790069017f86"
};
firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();

// ══════════════════════════════════════════
// CLOUDFLARE R2 — CONFIGURACIÓN
// ══════════════════════════════════════════
const R2_CONFIG = {
  accountId:   '0b2e7767e0ee207dc616905c2c16eca4',
  accessKeyId: '7ea097e43524d89b4aa9c7d839468f48',
  secretKey:   '2843d255e4f1f08297ab47b0b9141c8dc724006b38e6f2f8f707d4cc28ed673f',
  bucket:      'aplo-blossom-images',
  publicUrl:   'https://pub-3d7d2139a4334439ae85eb5b2674f06d.r2.dev'
};

async function compressImage(file, maxPx = 1080, quality = 0.90) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      let { naturalWidth: w, naturalHeight: h } = img;
      if (w > maxPx || h > maxPx) {
        const scale = Math.min(maxPx / w, maxPx / h);
        w = Math.round(w * scale);
        h = Math.round(h * scale);
      }
      const canvas = document.createElement('canvas');
      canvas.width = w; canvas.height = h;
      canvas.getContext('2d').drawImage(img, 0, 0, w, h);
      canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('Compresión fallida')), 'image/jpeg', quality);
    };
    img.onerror = reject;
    img.src = url;
  });
}

async function hmacSha256(key, data) {
  const k = typeof key === 'string' ? new TextEncoder().encode(key) : key;
  const cryptoKey = await crypto.subtle.importKey('raw', k, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return crypto.subtle.sign('HMAC', cryptoKey, new TextEncoder().encode(data));
}

async function sha256Hex(data) {
  const buf = data instanceof ArrayBuffer ? data : (data instanceof Blob ? await data.arrayBuffer() : new TextEncoder().encode(data));
  const hash = await crypto.subtle.digest('SHA-256', buf);
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2,'0')).join('');
}

async function uploadToR2(file) {
  const compressed = await compressImage(file);
  const ext = 'jpg';
  const key = `products/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
  const region = 'auto', service = 's3';
  const endpoint = `https://${R2_CONFIG.accountId}.r2.cloudflarestorage.com`;
  const host = `${R2_CONFIG.accountId}.r2.cloudflarestorage.com`;
  const now = new Date();
  const amzDate = now.toISOString().replace(/[:\-]|\.\d{3}/g,'').slice(0,15) + 'Z';
  const dateStamp = amzDate.slice(0,8);
  const payloadHash = await sha256Hex(compressed);
  const contentType = 'image/jpeg';
  const canonicalHeaders = `content-type:${contentType}\nhost:${host}\nx-amz-content-sha256:${payloadHash}\nx-amz-date:${amzDate}\n`;
  const signedHeaders = 'content-type;host;x-amz-content-sha256;x-amz-date';
  const canonicalRequest = ['PUT', '/' + R2_CONFIG.bucket + '/' + key, '', canonicalHeaders, signedHeaders, payloadHash].join('\n');
  const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;
  const stringToSign = ['AWS4-HMAC-SHA256', amzDate, credentialScope, await sha256Hex(canonicalRequest)].join('\n');
  const kDate = await hmacSha256('AWS4' + R2_CONFIG.secretKey, dateStamp);
  const kRegion = await hmacSha256(kDate, region);
  const kService = await hmacSha256(kRegion, service);
  const kSigning = await hmacSha256(kService, 'aws4_request');
  const sigBytes = await hmacSha256(kSigning, stringToSign);
  const signature = Array.from(new Uint8Array(sigBytes)).map(b => b.toString(16).padStart(2,'0')).join('');
  const authorization = `AWS4-HMAC-SHA256 Credential=${R2_CONFIG.accessKeyId}/${credentialScope},SignedHeaders=${signedHeaders},Signature=${signature}`;
  const res = await fetch(`${endpoint}/${R2_CONFIG.bucket}/${key}`, {
    method: 'PUT',
    headers: { 'Content-Type': contentType, 'x-amz-date': amzDate, 'x-amz-content-sha256': payloadHash, 'Authorization': authorization },
    body: compressed
  });
  if (!res.ok) { const txt = await res.text(); throw new Error(`R2 upload failed ${res.status}: ${txt}`); }
  return `${R2_CONFIG.publicUrl}/${key}`;
}

// ── HELPERS ──────────────────────────────
const fmt = n => {
  const v = Math.round((+n || 0) * 100) / 100;
  return v % 1 === 0 ? v.toLocaleString('es-MX') : v.toLocaleString('es-MX', {minimumFractionDigits:2, maximumFractionDigits:2});
};
const fmtMoney = n => '$' + fmt(n);

// Helper para limpiar emojis antes de enviar a PDF (Evita superposición de letras)
const cleanEmojis = str => (str || '').replace(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F700}-\u{1F77F}\u{1F780}-\u{1F7FF}\u{1F800}-\u{1F8FF}\u{1F900}-\u{1F9FF}\u{1FA00}-\u{1FA6F}\u{1FA70}-\u{1FAFF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F1E6}-\u{1F1FF}]/gu, '').replace(/\s+/g, ' ').trim();

// ── STATE ─────────────────────────────────
let state = { products:[], quotes:[], sales:[], expenses:[], deposits:[], creditSales:[], pagosLibres:[], saldoBase:0 };
let currentTab = 0;
let cartItems = [];
let editingProduct = null;

// ── FIRESTORE HELPERS ─────────────────────
async function addItem(col, data) { return await db.collection(col).add({...data, createdAt: firebase.firestore.FieldValue.serverTimestamp()}); }
async function updateItem(col, id, data) { return await db.collection(col).doc(id).update(data); }
async function deleteItem(col, id) { return await db.collection(col).doc(id).delete(); }
function listenCol(col, cb) {
  return db.collection(col).onSnapshot(snap => cb(snap.docs.map(d=>({id:d.id,...d.data()}))));
}

// ── INIT LISTENERS ────────────────────────
listenCol('products', docs => { state.products=docs; renderTab(); updateStats(); });
listenCol('quotes', docs => { state.quotes=docs.sort((a,b)=>(b.createdAt?.seconds||0)-(a.createdAt?.seconds||0)); if(currentTab===1&&cartItems.length>0)return; renderTab(); });
listenCol('sales', docs => { state.sales=docs.sort((a,b)=>(b.createdAt?.seconds||0)-(a.createdAt?.seconds||0)); renderTab(); updateStats(); });
listenCol('expenses', docs => { state.expenses=docs.sort((a,b)=>(b.createdAt?.seconds||0)-(a.createdAt?.seconds||0)); renderTab(); });
listenCol('deposits', docs => { state.deposits=docs.sort((a,b)=>(b.createdAt?.seconds||0)-(a.createdAt?.seconds||0)); });
listenCol('creditSales', docs => { state.creditSales=docs.sort((a,b)=>(b.createdAt?.seconds||0)-(a.createdAt?.seconds||0)); renderTab(); });
listenCol('pagosLibres', docs => { state.pagosLibres=docs.sort((a,b)=>(b.createdAt?.seconds||0)-(a.createdAt?.seconds||0)); renderTab(); });

db.collection('config').doc('saldo').get().then(snap=>{
  state.saldoBase = snap.exists?(snap.data().base||0):0;
});

// ── SALDO DISPLAY (OPCIONAL, SE ELIMINÓ DEL HEADER) ───────────────────
function updateSaldoDisplay() {
  const totalVentas = state.sales.reduce((s,v)=>s+(v.total||0),0);
  const totalGastos = state.expenses.reduce((s,e)=>s+(e.amount||0),0);
  const totalDepositos = state.deposits.reduce((s,d)=>s+(d.amount||0),0);
  const totalPagosLibres = state.pagosLibres.reduce((s,p)=>s+(p.amount||0),0);
  const totalAbonosParciales = state.creditSales.filter(c => c.status !== 'pagado').reduce((s,c) => s + (c.pagado||0), 0);
  const saldo = state.saldoBase + totalVentas + totalDepositos + totalPagosLibres + totalAbonosParciales - totalGastos;
  document.querySelectorAll('#headerSaldo').forEach(el=>el.textContent=fmtMoney(saldo));
}

// ── TABS ──────────────────────────────────
window.setTab = function(i) {
  currentTab = i;
  document.querySelectorAll('.nav-item').forEach((b,j)=>b.classList.toggle('active',i===j));
  document.querySelectorAll('.mobile-nav-btn').forEach(b=>{
    const id = +b.id.replace('mnav','');
    b.classList.toggle('active', i===id);
  });
  renderTab();
};

function renderTab() {
  try {
    const c = document.getElementById('mainContent');
    if(!c) return;
    if(currentTab===0) { if(!document.getElementById('invList')) { c.innerHTML=renderInventory(); } renderInvList(); }
    else if(currentTab===1) { if(!document.getElementById('quoteGrid')) c.innerHTML=renderQuote(); renderQuoteGrid(); }
    else if(currentTab===2) c.innerHTML=renderSales();
    else if(currentTab===3) c.innerHTML=renderReports();
    else if(currentTab===4) c.innerHTML=renderFinances();
    else if(currentTab===5) c.innerHTML=renderCatalog();
    else if(currentTab===6) c.innerHTML=renderCreditSales();
  } catch(err) {
    const c = document.getElementById('mainContent');
    if(c) c.innerHTML = '<div style="padding:24px;color:red;font-family:monospace;font-size:13px;word-break:break-all;"><b>Error en tab '+currentTab+':</b><br>' + err.message + '<br><br>' + (err.stack||'') + '</div>';
    console.error('renderTab error:', err);
  }
}

let lowStockThreshold = parseInt(localStorage.getItem('lowStockThreshold')||'5');

function updateStats() {
  const setAll = (id, val) => document.querySelectorAll('#'+id).forEach(el=>el.textContent=val);
  setAll('statProducts', state.products.length);
  const low = state.products.filter(p=>(p.stock||0)<=lowStockThreshold).length;
  setAll('statLow', low);
  const today = new Date().toDateString();
  setAll('statToday', state.sales.filter(s=>s.date&&new Date(s.date).toDateString()===today).length);
}

// ── TOAST ──────────────────────────────────
function toast(msg, type='ok') {
  const el=document.createElement('div');
  el.className=`toast toast-${type}`;el.textContent=msg;
  document.body.appendChild(el);
  setTimeout(()=>el.remove(),2500);
}

// ── ICONS ─────────────────────────────────
const icons = {
  edit:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="width:15px;height:15px"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>`,
  plus:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" style="width:15px;height:15px"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>`,
  minus:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" style="width:15px;height:15px"><line x1="5" y1="12" x2="19" y2="12"/></svg>`,
  trash:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="width:15px;height:15px"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></svg>`,
  stock:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="width:15px;height:15px"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>`,
  pdf:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="width:14px;height:14px"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>`,
  check:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:14px;height:14px"><polyline points="20 6 9 17 4 12"/></svg>`,
  camera:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>`,
  pkg:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>`
};

const CATS=['Todos','Kits','TikTok Shop','Skincare Mini','Skincare Coreano','Maquillaje','Protector Solar','Sérum','Limpieza','Hidratante','Otros'];
const SKINS=['Todo tipo','No aplica','Seca','Grasa','Mixta','Sensible','Normal','Otro'];
const EXPENSE_CATS=['Tarjeta de Crédito (Coreano/TikTok)','Compra de Insumos (WhatsApp Mini)','Gasolina / Transporte','Empaque / Bolsas','Envíos','Publicidad','Otros Gastos'];

// ── INVENTARIO ────────────────────────────
let invFilter='Todos', invSearch='', invSkinFilter='', invMlVal='', invMlUnit='', invFilterActive=false;
let invKoreanOnly=false;

function renderInventory() {
  return `
  <div style="display:flex;gap:10px;margin-bottom:10px;align-items:center;flex-wrap:wrap;">
    <div class="search-wrap" style="flex:1;min-width:200px;margin-bottom:0;">
      <svg class="search-icon" viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
      <input id="invSearch" value="${invSearch}" placeholder="Buscar producto..." oninput="window._invSearch(this.value)">
    </div>
    <div style="display:flex;gap:6px;flex-shrink:0;">
      <button class="btn btn-outline btn-sm" onclick="openKitModal()" style="border-radius:22px;">Kit</button>
      <button class="btn btn-primary btn-sm" onclick="openProductModal(null)" style="border-radius:22px;display:flex;align-items:center;gap:6px;">${icons.plus} Nuevo</button>
    </div>
  </div>

  <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px;flex-wrap:wrap;">
    <button onclick="window._toggleKoreanFilter()" class="btn btn-sm ${invKoreanOnly?'btn-primary':'btn-outline'}" style="display:flex;align-items:center;gap:6px;border-radius:22px;">
      🇰🇷 ${invKoreanOnly?'Solo coreanos':'Ver coreanos'}
    </button>
    <input id="invMlValInput" type="number" min="0" value="${invMlVal}" placeholder="Cantidad" oninput="window._invMlVal(this.value)" style="width:80px;font-family:'Jost',sans-serif;font-size:13px;border:1.5px solid var(--cream-mid);border-radius:8px;padding:6px 10px;background:var(--white);color:var(--text);outline:none;">
    <select id="invMlUnitSel" onchange="window._invMlUnit(this.value)" style="font-family:'Jost',sans-serif;font-size:13px;border:1.5px solid var(--cream-mid);border-radius:8px;padding:6px 8px;background:var(--white);color:var(--text);outline:none;">
      <option value="">Todas</option>
      <option value="ml"${invMlUnit==='ml'?' selected':''}>ml</option>
      <option value="g"${invMlUnit==='g'?' selected':''}>g</option>
      <option value="oz"${invMlUnit==='oz'?' selected':''}>oz</option>
      <option value="N/A"${invMlUnit==='N/A'?' selected':''}>N/A</option>
    </select>
    ${(invMlVal||invMlUnit)?`<button onclick="window._invMlClear()" style="font-size:11px;color:var(--text-light);background:none;border:none;cursor:pointer;padding:4px;">✕</button>`:''}
  </div>

  <div style="font-size:11px;font-weight:600;letter-spacing:.8px;text-transform:uppercase;color:var(--text-light);margin-bottom:6px;">Categoría</div>
  <div class="chips" id="invChips"></div>
  <div style="font-size:11px;font-weight:600;letter-spacing:.8px;text-transform:uppercase;color:var(--text-light);margin-bottom:6px;margin-top:4px;">Tipo de piel</div>
  <div class="chips" id="invSkinChips"></div>
  <div id="invList"></div>`;
}

function renderInvList() {
  let allProds = state.products.filter(p=>
    (p.name||'').toLowerCase().includes(invSearch.toLowerCase()) &&
    (!invSkinFilter||(invSkinFilter==='Todo tipo'?(Array.isArray(p.skin)?p.skin.includes('Todo tipo'):p.skin==='Todo tipo'):(Array.isArray(p.skin)?p.skin.includes(invSkinFilter):p.skin===invSkinFilter))) &&
    (!invMlVal||String(p.mlVal)===String(invMlVal)) &&
    (!invMlUnit||(p.mlUnit||'ml')===invMlUnit)
  );

  if(invKoreanOnly) allProds = allProds.filter(p=>p.isKorean===true);

  let prods = !invFilterActive?[]:invFilter==='Todos'?allProds:allProds.filter(p=>p.category===invFilter);

  const chips = document.getElementById('invChips');
  if(chips) chips.innerHTML=CATS.map(c=>`<button class="chip${invFilterActive&&invFilter===c?' active':''}" onclick="window._invFilter('${c}')">${c}</button>`).join('');
  const skinChips = document.getElementById('invSkinChips');
  if(skinChips) skinChips.innerHTML=SKINS.map(s=>`<button class="chip${invSkinFilter===s&&invSkinFilter!==''?' active':''}" onclick="window._invSkin('${s}')">${s}</button>`).join('');

  const el = document.getElementById('invList');
  if(!el) return;
  if(!invFilterActive && !invKoreanOnly) { el.innerHTML=`<div class="empty">${icons.pkg}<p>Selecciona una categoría o filtro para ver productos</p></div>`; return; }
  if(invKoreanOnly && !invFilterActive) prods = allProds;

  el.innerHTML=(prods.length===0?`<div class="empty">${icons.pkg}<p>Sin productos</p></div>`:'')+
  prods.map(p=>`
  <div class="card product-card">
    <div class="product-img">${p.image?`<img src="${p.image}" alt="${p.name}">`:`<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;">${icons.pkg}</div>`}</div>
    <div class="product-info">
      <div class="product-name">${p.name}${p.isKit?` <span class="pill pill-warn" style="font-size:10px;padding:1px 7px;">Kit</span>`:''}${p.isKorean?` <span style="font-size:12px;" title="Producto coreano">🇰🇷</span>`:''}</div>
      <div class="product-meta">${p.category||''}${p.mlVal&&p.mlUnit!=='N/A'?' · '+p.mlVal+p.mlUnit:''}</div>
      <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
        <span class="product-price">${fmtMoney(p.price)}</span>
        ${p.priceMayoreo?`<span style="font-size:11px;color:#7a6230;font-weight:600;">May: ${fmtMoney(p.priceMayoreo)}</span>`:''}
        <span class="pill ${(p.stock||0)<=3?'pill-low':(p.stock||0)<=8?'pill-warn':'pill-ok'}">${p.stock||0} uds</span>
      </div>
    </div>
    <div class="product-actions">
      <button class="icon-btn" onclick="openStockModal('${p.id}')" title="Ajustar stock">${icons.stock}</button>
      <button class="icon-btn" onclick="${p.isKit?`openKitModal('${p.id}')`:`openProductModal('${p.id}')`}" title="Editar">${icons.edit}</button>
    </div>
  </div>`).join('');
}

window._invSearch=v=>{invSearch=v;renderInvList();};
window._invFilter=v=>{if(invFilter===v&&invFilterActive){invFilterActive=false;}else{invFilter=v;invFilterActive=true;}renderInvList();};
window._invSkin=v=>{if(invSkinFilter===v){invSkinFilter='';}else{invSkinFilter=v;invFilterActive=true;}renderInvList();};
window._invMlVal=v=>{invMlVal=v;if(v)invFilterActive=true;renderInvList();};
window._invMlUnit=v=>{invMlUnit=v;if(v)invFilterActive=true;renderInvList();};
window._invMlClear=()=>{invMlVal='';invMlUnit='';renderInvList();};
window._toggleKoreanFilter=()=>{invKoreanOnly=!invKoreanOnly;const c=document.getElementById('mainContent');c.innerHTML=renderInventory();renderInvList();};

// ── PRODUCT MODAL (TEXTAREA DESCRIPCIÓN) ──────────────────
window.openProductModal = function(id) {
  editingProduct = id?state.products.find(p=>p.id===id):null;
  const p = editingProduct||{};
  showModal('modalProduct',`
    <div class="modal-header"><div class="modal-title">${id?'Editar producto':'Nuevo producto'}</div><button class="modal-close" onclick="closeModal('modalProduct')">×</button></div>
    <label for="imgFileInput" class="img-upload" id="imgUploadLabel">
      ${p.image
        ? `<img src="${p.image}" style="width:100%;height:100%;object-fit:cover;">`
        : `<div style="display:flex;flex-direction:column;align-items:center;gap:8px;">${icons.camera}<span>Subir foto</span></div>`}
    </label>
    <input type="file" id="imgFileInput" accept="image/*" style="display:none" onchange="window._handleImg(this)">
    <input type="hidden" id="pImgData" value="${p.image||''}">
    <div class="field"><label>Nombre</label><input id="pName" value="${p.name||''}" placeholder="Nombre del producto"></div>
    <div class="two-col">
      <div class="field"><label>Categoría</label><select id="pCat">${CATS.filter(c=>c!=='Todos'&&c!=='Kits').map(c=>`<option${p.category===c?' selected':''}>${c}</option>`).join('')}</select></div>
      <div class="field"><label>Tipo de piel</label>
        <div id="pSkinChips" style="display:flex;flex-wrap:wrap;gap:4px;margin-top:4px;">
          ${(()=>{const sk=Array.isArray(p.skin)?p.skin:(p.skin?[p.skin]:['No aplica']);return SKINS.map(s=>`<button type="button" onclick="window._toggleSkin('${s}')" class="chip${sk.includes(s)?' active':''}" style="font-size:11px;padding:4px 10px;">${s}</button>`).join('');})()}
        </div>
      </div>
    </div>

    <div style="background:var(--cream-dark);border-radius:var(--radius-sm);padding:12px;margin-bottom:12px;">
      <div style="font-size:11px;font-weight:600;letter-spacing:.5px;text-transform:uppercase;color:var(--text-light);margin-bottom:10px;">Precios y Costos</div>
      <div class="three-col">
        <div class="field" style="margin-bottom:0;">
          <label style="color:var(--olive);">Menudeo $</label>
          <input id="pPrice" type="number" value="${p.price||''}" placeholder="0" style="border-color:var(--olive-pale);font-weight:600;color:var(--olive);">
        </div>
        <div class="field" style="margin-bottom:0;">
          <label style="color:#7a6230;">Mayoreo $</label>
          <input id="pPriceMayoreo" type="number" value="${p.priceMayoreo||''}" placeholder="0" style="border-color:#c8a86a;font-weight:600;color:#7a6230;">
        </div>
        <div class="field" style="margin-bottom:0;">
          <label style="color:var(--text-light);">Costo $</label>
          <input id="pCost" type="number" value="${p.cost||''}" placeholder="0">
        </div>
      </div>
    </div>

    <div class="two-col">
      <div class="field"><label>Stock actual</label><input id="pStock" type="number" value="${p.stock||''}" placeholder="0"></div>
      <div class="field">
        <label>Cantidad (ml/g/oz)</label>
        <div style="display:flex;gap:6px;">
          <input id="pMlVal" type="number" min="0" value="${p.mlVal||''}" placeholder="100" style="flex:1;min-width:0;">
          <select id="pMlUnit" style="width:72px;font-family:'Jost',sans-serif;font-size:14px;border:1.5px solid var(--cream-mid);border-radius:var(--radius-sm);padding:11px 8px;background:var(--white);color:var(--text);outline:none;">
            <option${(p.mlUnit||'ml')==='ml'?' selected':''}>ml</option>
            <option${p.mlUnit==='g'?' selected':''}>g</option>
            <option${p.mlUnit==='oz'?' selected':''}>oz</option>
            <option${p.mlUnit==='N/A'?' selected':''}>N/A</option>
          </select>
        </div>
      </div>
    </div>
    
    <!-- DESCRIPCIÓN CON TEXTAREA MULTILÍNEA -->
    <div class="field">
      <label>Descripción detallada (Permite saltos de línea y listas)</label>
      <textarea id="pDesc" rows="4" placeholder="Escribe los detalles, ingredientes o beneficios. Puedes usar saltos de línea para hacer listas...">${p.description||''}</textarea>
    </div>

    <div style="display:flex;align-items:center;gap:10px;padding:12px;background:var(--cream-dark);border-radius:var(--radius-sm);margin-bottom:14px;">
      <input type="checkbox" id="pIsKorean" ${p.isKorean?'checked':''} style="width:18px;height:18px;accent-color:var(--olive);cursor:pointer;">
      <label for="pIsKorean" style="cursor:pointer;font-size:14px;font-weight:500;color:var(--text);display:flex;align-items:center;gap:6px;">
        🇰🇷 Producto coreano
      </label>
    </div>

    <div style="display:flex;gap:10px;margin-top:4px;">
      ${id?`<button class="btn btn-danger" onclick="deleteProduct('${id}')">Eliminar</button>`:''}
      <button class="btn btn-primary btn-full" onclick="saveProduct('${id||''}')">Guardar Producto</button>
    </div>
  `);
};

window._toggleSkin=function(s){
  const chips=document.querySelectorAll('#pSkinChips .chip');
  if(s==='Todo tipo'){chips.forEach(b=>b.classList.remove('active'));chips.forEach(b=>{if(b.textContent==='Todo tipo')b.classList.add('active');});}
  else{chips.forEach(b=>{if(b.textContent==='Todo tipo')b.classList.remove('active');});chips.forEach(b=>{if(b.textContent===s)b.classList.toggle('active');});}
};

window._handleImg = async function(input) {
  const file = input.files[0]; if(!file) return;
  const label = document.getElementById('imgUploadLabel');
  label.innerHTML = `<span style="color:var(--text-light);font-size:13px;">⏳ Subiendo imagen...</span>`;
  try {
    const url = await uploadToR2(file);
    document.getElementById('pImgData').value = url;
    label.innerHTML = `<img src="${url}" style="width:100%;height:100%;object-fit:cover;">`;
    toast('Imagen subida ✓');
  } catch(e) {
    console.error(e);
    label.innerHTML = `<div style="display:flex;flex-direction:column;align-items:center;gap:8px;">${icons.camera}<span style="color:var(--danger);font-size:12px;">Error al subir</span></div>`;
    toast('Error al subir imagen', 'err');
  }
};

window.saveProduct=async function(id){
  const name=document.getElementById('pName').value.trim();
  if(!name){toast('Escribe el nombre','err');return;}
  const data={
    name,
    category:document.getElementById('pCat').value,
    skin:Array.from(document.querySelectorAll('#pSkinChips .chip.active')).map(b=>b.textContent).filter(Boolean),
    mlVal:document.getElementById('pMlVal').value||'',
    mlUnit:document.getElementById('pMlUnit').value||'ml',
    price:+document.getElementById('pPrice').value||0,
    priceMayoreo:+document.getElementById('pPriceMayoreo').value||0,
    cost:+document.getElementById('pCost').value||0,
    stock:+document.getElementById('pStock').value||0,
    description:document.getElementById('pDesc').value,
    image:document.getElementById('pImgData').value||'',
    isKorean:document.getElementById('pIsKorean').checked
  };
  if(id){await updateItem('products',id,data);toast('Producto actualizado');}
  else{await db.collection('products').add({...data,createdAt:firebase.firestore.FieldValue.serverTimestamp()});toast('Producto agregado');}
  closeModal('modalProduct');
};

window.deleteProduct=async function(id){
  if(!confirm('¿Eliminar este producto?'))return;
  await deleteItem('products',id);toast('Producto eliminado');closeModal('modalProduct');
};

// ── AJUSTE DE STOCK (CON BOTONES Y SIGNO - CORREGIDO) ───────────────────
window.openStockModal=function(id){
  const p=state.products.find(x=>x.id===id);
  showModal('modalStock',`
    <div class="modal-header"><div class="modal-title">Ajustar Stock: ${p.name}</div><button class="modal-close" onclick="closeModal('modalStock')">×</button></div>
    <p style="color:var(--text-light);font-size:14px;margin-bottom:16px;">Stock actual: <strong style="color:var(--olive);font-size:18px;">${p.stock||0}</strong> unidades</p>
    
    <div class="field">
      <label>Cantidad a agregar (+) o restar (-)</label>
      <input id="stockDelta" type="text" inputmode="numeric" placeholder="Ej: 5 o -3" style="font-size:18px;font-weight:700;text-align:center;">
    </div>

    <div style="font-size:11px;color:var(--text-light);margin-bottom:8px;font-weight:600;">Botones rápidos de ajuste:</div>
    <div style="display:grid;grid-template-columns:repeat(6,1fr);gap:6px;margin-bottom:16px;">
      <button class="btn btn-outline btn-sm" onclick="document.getElementById('stockDelta').value='+1'">+1</button>
      <button class="btn btn-outline btn-sm" onclick="document.getElementById('stockDelta').value='+5'">+5</button>
      <button class="btn btn-outline btn-sm" onclick="document.getElementById('stockDelta').value='+10'">+10</button>
      <button class="btn btn-danger btn-sm" onclick="document.getElementById('stockDelta').value='-1'">-1</button>
      <button class="btn btn-danger btn-sm" onclick="document.getElementById('stockDelta').value='-5'">-5</button>
      <button class="btn btn-danger btn-sm" onclick="document.getElementById('stockDelta').value='-10'">-10</button>
    </div>

    <button class="btn btn-primary btn-full" onclick="applyStock('${id}')">Aplicar Cambio</button>
  `);
};
window.applyStock=async function(id){
  const valStr = document.getElementById('stockDelta').value.trim();
  const delta = parseInt(valStr, 10);
  if(isNaN(delta)){toast('Ingresa una cantidad válida','err');return;}
  const p=state.products.find(x=>x.id===id);
  const newStock=Math.max(0,(p.stock||0)+delta);
  await updateItem('products',id,{stock:newStock});
  toast(`Stock actualizado: ${newStock} unidades`);
  closeModal('modalStock');
};

// ── FINANZAS COMPLETO ────────────────════════════════════════
let finPeriod='month';

function renderFinances() {
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

window._fPeriod=v=>{finPeriod=v;renderTab();};
window.openExpenseModal=function(){showModal('modalExpense',`
  <div class="modal-header"><div class="modal-title">Registrar Gasto u Operación</div><button class="modal-close" onclick="closeModal('modalExpense')">×</button></div>
  <div class="field"><label>Concepto del gasto</label><input id="eConcept" placeholder="Ej: Pago Tarjeta Crédito (Coreano), Envío WhatsApp..."></div>
  <div class="field"><label>Monto $</label><input id="eAmount" type="number" placeholder="0"></div>
  <div class="field"><label>Categoría</label><select id="eCat">${EXPENSE_CATS.map(c=>`<option>${c}</option>`).join('')}</select></div>
  <div class="field"><label>Descripción (Detalles)</label><textarea id="eDesc" rows="3" placeholder="Detalles de la compra, proveedor, etc..."></textarea></div>
  <button class="btn btn-primary btn-full" onclick="saveExpense()">Guardar Gasto</button>
`);};
window.saveExpense=async function(){const concept=document.getElementById('eConcept').value.trim();const amount=+document.getElementById('eAmount').value;if(!concept||!amount){toast('Completa los campos','err');return;}const desc=document.getElementById('eDesc')?.value.trim()||'';await addItem('expenses',{concept,amount,category:document.getElementById('eCat').value,description:desc,date:new Date().toISOString()});toast('Gasto registrado ✓');closeModal('modalExpense');};
window.deleteExpense=async function(id){if(!confirm('¿Eliminar este gasto?'))return;await deleteItem('expenses',id);toast('Gasto eliminado');};

// ── EXPORTAR CATÁLOGO A PDF (CORREGIDO SIN EMOJIS FEOS) ───────────────────
window.exportCatalog = function(onlyInStock) {
  const prods=onlyInStock?state.products.filter(p=>(p.stock||0)>0):state.products;
  if(!prods.length){toast('Sin productos para exportar','err');return;}
  toast('Generando PDF del catálogo...');
  const{jsPDF}=window.jspdf;const doc=new jsPDF({format:'a4',unit:'mm'});
  const PW=210,PH=297,ML=12,MR=12,usableW=PW-ML-MR;
  const COL_NAME=ML,NAME_W=55,COL_DESC=COL_NAME+NAME_W+5,DESC_W=70,COL_PRICE=COL_DESC+DESC_W+5,COL_MAY=COL_PRICE+28;

  const drawHeader=()=>{
    doc.setFillColor(74,82,64);doc.rect(0,0,PW,18,'F');
    doc.setFont('helvetica','bold');doc.setFontSize(13);doc.setTextColor(245,240,232);
    doc.text('Aplo Blossom',ML,12);
    doc.setFont('helvetica','normal');doc.setFontSize(8);doc.setTextColor(184,149,90);
    doc.text(onlyInStock?'Productos en stock':'Catalogo completo',PW-MR,12,{align:'right'});
  };

  const drawTableHeader=y=>{
    doc.setFillColor(220,213,196);doc.rect(ML,y,usableW,6.5,'F');
    doc.setFont('helvetica','bold');doc.setFontSize(8);doc.setTextColor(74,82,64);
    doc.text('Producto',COL_NAME+2,y+4.5);
    doc.text('Descripcion',COL_DESC+2,y+4.5);
    doc.text('Menudeo',COL_PRICE,y+4.5);
    doc.text('Mayoreo',COL_MAY,y+4.5);
    return y+9;
  };

  drawHeader();let y=drawTableHeader(22);let rowCount=0;

  prods.forEach(p => {
    const nameClean = cleanEmojis(p.name);
    const descClean = cleanEmojis(p.description);

    doc.setFont('helvetica','bold');doc.setFontSize(8);
    const nameLines=doc.splitTextToSize(nameClean, NAME_W);
    doc.setFont('helvetica','normal');doc.setFontSize(7);
    const descLines=descClean ? doc.splitTextToSize(descClean, DESC_W) : [];

    const rowH = Math.max(16, Math.max(nameLines.length, descLines.length) * 4.5 + 6);

    if (y + rowH > PH - 14) {
      doc.addPage(); drawHeader(); y = drawTableHeader(22); rowCount = 0;
    }

    if (rowCount % 2 === 1) {
      doc.setFillColor(250,247,242); doc.rect(ML, y, usableW, rowH, 'F');
    }

    doc.setFont('helvetica','bold');doc.setFontSize(8);doc.setTextColor(30,30,24);
    let ty = y + 4.5;
    nameLines.forEach(l => { doc.text(l, COL_NAME + 2, ty); ty += 4; });

    doc.setFont('helvetica','normal');doc.setFontSize(7);doc.setTextColor(80,78,68);
    let dty = y + 4.5;
    descLines.slice(0, 4).forEach(l => { doc.text(l, COL_DESC + 2, dty); dty += 3.8; });

    doc.setFont('helvetica','bold');doc.setFontSize(9);doc.setTextColor(74,82,64);
    doc.text(fmtMoney(p.price), COL_PRICE, y + 6);

    if (p.priceMayoreo) {
      doc.setFont('helvetica','bold');doc.setFontSize(9);doc.setTextColor(122,98,48);
      doc.text(fmtMoney(p.priceMayoreo), COL_MAY, y + 6);
    }

    doc.setDrawColor(222,214,200); doc.line(ML, y + rowH, PW - MR, y + rowH);
    y += rowH; rowCount++;
  });

  doc.save('catalogo-aploblossom.pdf');
  toast('Catálogo PDF generado ✓');
};

// ── EXPORTAR IMÁGENES A ZIP (RÁPIDO Y ORDENADO) ───────────────────
window.exportImages = async function(priceMode = 'menudeo') {
  const prods = state.products.filter(p => p.image && (p.stock || 0) > 0);
  if (!prods.length) { toast('No hay productos con imagen en stock', 'err'); return; }
  toast('Generando ZIP de imágenes...');

  const zip = new JSZip();
  let count = 0;

  for (let idx = 0; idx < prods.length; idx++) {
    const p = prods[idx];
    try {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      await new Promise(res => {
        img.onload = res;
        img.onerror = res;
        img.src = 'https://images.weserv.nl/?url=' + encodeURIComponent(p.image) + '&output=jpg&q=85';
      });

      const canvas = document.createElement('canvas');
      canvas.width = 800; canvas.height = 800;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#ffffff'; ctx.fillRect(0,0,800,800);
      if (img.naturalWidth) ctx.drawImage(img, 0, 0, 800, 800);

      // Sticker de precio
      ctx.fillStyle = '#4a5240';
      ctx.fillRect(500, 700, 270, 70);
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 32px sans-serif';
      ctx.fillText(fmtMoney(p.price), 520, 748);

      const blob = await new Promise(res => canvas.toBlob(res, 'image/jpeg', 0.85));
      const fileNum = String(idx + 1).padStart(3, '0');
      const safeName = cleanEmojis(p.name).replace(/[^a-zA-Z0-9]/g, '_');
      zip.file(`${fileNum}_${safeName}.jpg`, blob);
      count++;
      toast(`Exportando... ${count}/${prods.length}`);
    } catch(e) {
      console.log('Error exportando imagen:', e);
    }
  }

  const zipBlob = await zip.generateAsync({ type: 'blob' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(zipBlob);
  a.download = `catalogo-imagenes-${priceMode}.zip`;
  document.body.appendChild(a); a.click();
  setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(a.href); }, 1000);
  toast(`ZIP generado (${count} imágenes) ✓`);
};

// ── MODALES HELPERS ───────────────────────
function showModal(id,html){let overlay=document.getElementById('overlay_'+id);if(!overlay){overlay=document.createElement('div');overlay.id='overlay_'+id;overlay.className='modal-overlay';document.body.appendChild(overlay);}overlay.innerHTML=`<div class="modal-box">${html}</div>`;overlay.style.display='flex';}
window.closeModal=function(id){const el=document.getElementById('overlay_'+id);if(el)el.style.display='none';};

// FIRST RENDER
renderTab();
