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
      canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('Compresión fallida')),
        'image/jpeg', quality);
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

// ── INIT ──────────────────────────────────
listenCol('products', docs => { state.products=docs; renderTab(); updateStats(); });
listenCol('quotes', docs => { state.quotes=docs.sort((a,b)=>(b.createdAt?.seconds||0)-(a.createdAt?.seconds||0)); if(currentTab===1&&cartItems.length>0)return; renderTab(); });
listenCol('sales', docs => { state.sales=docs.sort((a,b)=>(b.createdAt?.seconds||0)-(a.createdAt?.seconds||0)); renderTab(); updateStats(); updateSaldoDisplay(); });
listenCol('expenses', docs => { state.expenses=docs.sort((a,b)=>(b.createdAt?.seconds||0)-(a.createdAt?.seconds||0)); renderTab(); updateSaldoDisplay(); });
listenCol('deposits', docs => { state.deposits=docs.sort((a,b)=>(b.createdAt?.seconds||0)-(a.createdAt?.seconds||0)); updateSaldoDisplay(); });
listenCol('creditSales', docs => { state.creditSales=docs.sort((a,b)=>(b.createdAt?.seconds||0)-(a.createdAt?.seconds||0)); renderTab(); });
listenCol('pagosLibres', docs => { state.pagosLibres=docs.sort((a,b)=>(b.createdAt?.seconds||0)-(a.createdAt?.seconds||0)); renderTab(); updateSaldoDisplay(); });

db.collection('config').doc('saldo').get().then(snap=>{
  state.saldoBase = snap.exists?(snap.data().base||0):0;
  updateSaldoDisplay();
});

// ── SALDO EN CUENTA ───────────────────────
function updateSaldoDisplay() {
  const totalVentas = state.sales.reduce((s,v)=>s+(v.total||0),0);
  const totalGastos = state.expenses.reduce((s,e)=>s+(e.amount||0),0);
  const totalDepositos = state.deposits.reduce((s,d)=>s+(d.amount||0),0);
  const totalPagosLibres = state.pagosLibres.reduce((s,p)=>s+(p.amount||0),0);
  const totalAbonosParciales = state.creditSales.filter(c => c.status !== 'pagado').reduce((s,c) => s + (c.pagado||0), 0);
  const saldo = state.saldoBase + totalVentas + totalDepositos + totalPagosLibres + totalAbonosParciales - totalGastos;
  document.querySelectorAll('#headerSaldo').forEach(el=>el.textContent=fmtMoney(saldo));
}

window.openSaldoModal = function() {
  const totalVentas = state.sales.reduce((s,v)=>s+(v.total||0),0);
  const totalGastos = state.expenses.reduce((s,e)=>s+(e.amount||0),0);
  const totalDepositos = state.deposits.reduce((s,d)=>s+(d.amount||0),0);
  const totalPagosLibres = state.pagosLibres.reduce((s,p)=>s+(p.amount||0),0);
  const totalAbonosParciales = state.creditSales.filter(c=>c.status!=='pagado').reduce((s,c)=>s+(c.pagado||0),0);
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
    ${state.deposits.length>0?`
    <div class="divider"></div>
    <div style="font-size:12px;color:var(--text-light);margin-bottom:8px;font-weight:600;">Depósitos registrados</div>
    ${state.deposits.slice(0,5).map(d=>`
    <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid var(--cream-mid);">
      <div>
        <div style="font-size:13px;font-weight:500;">${d.concept||'Depósito'}</div>
        <div style="font-size:11px;color:var(--text-light);">${d.date?new Date(d.date).toLocaleDateString('es-MX'):''}</div>
      </div>
      <div style="display:flex;align-items:center;gap:8px;">
        <span style="font-weight:700;color:#3a5080;">${fmtMoney(d.amount)}</span>
        <button onclick="deleteDeposit('${d.id}')" style="background:#f0dada;border:none;border-radius:6px;width:24px;height:24px;cursor:pointer;color:var(--danger);font-size:14px;display:flex;align-items:center;justify-content:center;">×</button>
      </div>
    </div>`).join('')}`:``}
  `);
};

window.saveDeposit = async function() {
  const amount = +document.getElementById('depositAmount').value;
  const concept = document.getElementById('depositConcept').value.trim()||'Depósito personal';
  if(!amount||amount<=0){toast('Ingresa un monto válido','err');return;}
  await addItem('deposits',{amount,concept,date:new Date().toISOString()});
  toast('Depósito registrado ✓');
  closeModal('modalSaldo');
};

window.deleteDeposit = async function(id) {
  if(!confirm('¿Eliminar este depósito?')) return;
  await deleteItem('deposits',id);
  toast('Depósito eliminado');
  closeModal('modalSaldo');
};

window.saveSaldoBase = async function() {
  const val = +document.getElementById('saldoBaseInput').value || 0;
  await db.collection('config').doc('saldo').set({base:val});
  state.saldoBase = val;
  updateSaldoDisplay();
  toast('Saldo base guardado ✓');
  closeModal('modalSaldo');
};

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
    bindEvents();
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

window.showLowStockModal = function() {
  const lowProds = state.products.filter(p=>(p.stock||0)<=lowStockThreshold).sort((a,b)=>(a.stock||0)-(b.stock||0));
  showModal('modalLowStock',`
    <div class="modal-header"><div class="modal-title">Stock bajo</div><button class="modal-close" onclick="closeModal('modalLowStock')">×</button></div>
    ${lowProds.length===0
      ?`<div class="empty">${icons.pkg}<p>¡Todo en orden!</p></div>`
      :`<div style="display:flex;flex-direction:column;gap:8px;">${lowProds.map(p=>`
        <div class="card" style="display:flex;align-items:center;gap:12px;padding:12px 14px;">
          <div class="product-img" style="width:48px;height:48px;border-radius:10px;flex-shrink:0;">${p.image?`<img src="${p.image}" style="width:100%;height:100%;object-fit:cover;">`:`<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;">${icons.pkg}</div>`}</div>
          <div style="flex:1;min-width:0;"><div style="font-weight:600;font-size:14px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${p.name}</div></div>
          <span class="pill ${(p.stock||0)===0?'pill-low':'pill-warn'}">${p.stock||0} uds</span>
        </div>`).join('')}</div>`}
  `);
};

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

const CATS=['Todos','Kits','Protector Solar','Sérum','Limpieza','Hidratante','Tónico','Crema','Contorno','Aceites y Exfoliantes','Maquillaje','Accesorios','Otros'];
const SKINS=['Todo tipo','No aplica','Seca','Grasa','Mixta','Sensible','Normal','Otro'];
const EXPENSE_CATS=['Insumos','Compra de productos','Envíos','Publicidad','Empaque','Otros'];

// ══════════════════════════════════════════
// INVENTARIO
// ══════════════════════════════════════════
let invFilter='Todos', invSearch='', invSkinFilter='', invMlVal='', invMlUnit='', invFilterActive=false;
let invKoreanOnly=false; // ← NUEVO: filtro coreano

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

  <!-- NUEVO: Filtro Coreano -->
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

  // NUEVO: filtro coreano
  if(invKoreanOnly) allProds = allProds.filter(p=>p.isKorean===true);

  let prods = !invFilterActive?[]:invFilter==='Todos'?allProds:allProds.filter(p=>p.category===invFilter);

  const chips = document.getElementById('invChips');
  if(chips) chips.innerHTML=CATS.map(c=>`<button class="chip${invFilterActive&&invFilter===c?' active':''}" onclick="window._invFilter('${c}')">${c}</button>`).join('');
  const skinChips = document.getElementById('invSkinChips');
  if(skinChips) skinChips.innerHTML=SKINS.map(s=>`<button class="chip${invSkinFilter===s&&invSkinFilter!==''?' active':''}" onclick="window._invSkin('${s}')">${s}</button>`).join('');

  const el = document.getElementById('invList');
  if(!el) return;
  if(!invFilterActive && !invKoreanOnly) { el.innerHTML=`<div class="empty">${icons.pkg}<p>Selecciona una categoría o tipo de piel para ver productos</p></div>`; return; }
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
// NUEVO
window._toggleKoreanFilter=()=>{invKoreanOnly=!invKoreanOnly;const c=document.getElementById('mainContent');c.innerHTML=renderInventory();renderInvList();};

// ── Product Modal ──────────────────────────
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

    <!-- PRECIOS: Menudeo, Mayoreo, Costo -->
    <div style="background:var(--cream-dark);border-radius:var(--radius-sm);padding:12px;margin-bottom:12px;">
      <div style="font-size:11px;font-weight:600;letter-spacing:.5px;text-transform:uppercase;color:var(--text-light);margin-bottom:10px;">Precios</div>
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
      <div class="field"><label>Stock</label><input id="pStock" type="number" value="${p.stock||''}" placeholder="0"></div>
      <div class="field">
        <label>Cantidad</label>
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
    <div class="field"><label>Descripción</label><input id="pDesc" value="${p.description||''}" placeholder="Descripción breve..."></div>

    <!-- NUEVO: Checkbox Coreano -->
    <div style="display:flex;align-items:center;gap:10px;padding:12px;background:var(--cream-dark);border-radius:var(--radius-sm);margin-bottom:14px;">
      <input type="checkbox" id="pIsKorean" ${p.isKorean?'checked':''} style="width:18px;height:18px;accent-color:var(--olive);cursor:pointer;">
      <label for="pIsKorean" style="cursor:pointer;font-size:14px;font-weight:500;color:var(--text);display:flex;align-items:center;gap:6px;">
        🇰🇷 Producto coreano
      </label>
    </div>

    <div style="display:flex;gap:10px;margin-top:4px;">
      ${id?`<button class="btn btn-danger" onclick="deleteProduct('${id}')">Eliminar</button>`:''}
      <button class="btn btn-primary btn-full" onclick="saveProduct('${id||''}')">Guardar</button>
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
  label.innerHTML = `<span style="color:var(--text-light);font-size:13px;">⏳ Comprimiendo y subiendo...</span>`;
  try {
    const url = await uploadToR2(file);
    document.getElementById('pImgData').value = url;
    label.innerHTML = `<img src="${url}" style="width:100%;height:100%;object-fit:cover;">`;
    toast('Imagen subida ✓');
  } catch(e) {
    console.error(e);
    label.innerHTML = `<div style="display:flex;flex-direction:column;align-items:center;gap:8px;">${icons.camera}<span style="color:var(--danger);font-size:12px;">Error al subir — intenta de nuevo</span></div>`;
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
    priceMayoreo:+document.getElementById('pPriceMayoreo').value||0, // NUEVO
    cost:+document.getElementById('pCost').value||0,
    stock:+document.getElementById('pStock').value||0,
    description:document.getElementById('pDesc').value,
    image:document.getElementById('pImgData').value||'',
    isKorean:document.getElementById('pIsKorean').checked // NUEVO
  };
  if(id){await updateItem('products',id,data);toast('Producto actualizado');}
  else{await db.collection('products').add({...data,createdAt:firebase.firestore.FieldValue.serverTimestamp()});toast('Producto agregado');}
  closeModal('modalProduct');
};

window.deleteProduct=async function(id){
  if(!confirm('¿Eliminar este producto?'))return;
  await deleteItem('products',id);toast('Producto eliminado');closeModal('modalProduct');
};

// ── KITS ──────────────────────────────────
window.openKitModal=function(id){
  const kit=id?state.products.find(p=>p.id===id):null;
  const k=kit||{};
  const selectedItems=k.kitItems?[...k.kitItems]:[];
  showModal('modalKit',`
    <div class="modal-header"><div class="modal-title">${id?'Editar kit':'Nuevo kit'}</div><button class="modal-close" onclick="closeModal('modalKit')">×</button></div>
    <label for="kitImgInput" class="img-upload" id="kitImgUploadLabel">
      ${k.image?`<img src="${k.image}" style="width:100%;height:100%;object-fit:cover;">`:`<div style="display:flex;flex-direction:column;align-items:center;gap:8px;">${icons.camera}<span>Foto del kit</span></div>`}
    </label>
    <input type="file" id="kitImgInput" accept="image/*" style="display:none" onchange="window._handleKitImg(this)">
    <input type="hidden" id="kitImgData" value="${k.image||''}">
    <div class="field"><label>Nombre del kit</label><input id="kitName" value="${k.name||''}" placeholder="Ej: Kit Hidratación"></div>
    <div class="two-col">
      <div class="field"><label>Tipo de piel</label>
        <div id="kitSkinChips" style="display:flex;flex-wrap:wrap;gap:4px;margin-top:4px;">
          ${(()=>{const sk=Array.isArray(k.skin)?k.skin:(k.skin?[k.skin]:[]);return SKINS.map(s=>`<button type="button" onclick="window._toggleKitSkin('${s}')" class="chip${sk.includes(s)?' active':''}" style="font-size:11px;padding:4px 10px;">${s}</button>`).join('');})()}
        </div>
      </div>
      <div class="field"><label>Stock kits</label><input id="kitStock" type="number" value="${k.stock||''}" placeholder="0"></div>
    </div>
    <div class="field"><label>Descripción</label><input id="kitDesc" value="${k.description||''}" placeholder="Descripción del kit..."></div>
    <div style="margin-bottom:12px;">
      <div style="font-size:11px;font-weight:600;letter-spacing:.8px;text-transform:uppercase;color:var(--text-light);margin-bottom:8px;">Productos incluidos</div>
      <div id="kitSelectedList" style="display:flex;flex-direction:column;gap:6px;margin-bottom:10px;"></div>
      <div style="position:relative;margin-bottom:8px;">
        <input id="kitProdSearch" placeholder="Buscar producto para agregar..." autocomplete="off"
          style="width:100%;font-family:'Jost',sans-serif;font-size:14px;border:1.5px solid var(--cream-mid);border-radius:var(--radius-sm);padding:10px 14px;background:var(--white);color:var(--text);outline:none;"
          oninput="window._kitSearchInput(this.value)" onfocus="window._kitSearchInput(this.value)"
          onblur="setTimeout(()=>{const d=document.getElementById('kitSearchDropdown');if(d)d.style.display='none';},200)">
        <div id="kitSearchDropdown" style="display:none;position:absolute;top:100%;left:0;right:0;background:var(--white);border:1.5px solid var(--olive);border-top:none;border-radius:0 0 var(--radius-sm) var(--radius-sm);max-height:180px;overflow-y:auto;z-index:50;box-shadow:var(--shadow-lg);"></div>
      </div>
    </div>

    <!-- Precios del kit -->
    <div style="background:var(--cream-dark);border-radius:var(--radius-sm);padding:12px;margin-bottom:14px;">
      <div style="font-size:12px;color:var(--text-light);margin-bottom:4px;">Precio individual sumado</div>
      <div id="kitPriceSum" style="font-family:'Playfair Display',serif;font-size:20px;color:var(--text-mid);">$0</div>
      <div class="two-col" style="margin-top:12px;">
        <div class="field" style="margin-bottom:0;">
          <label style="color:var(--olive);">Precio menudeo $</label>
          <input id="kitPrice" type="number" value="${k.price||''}" placeholder="0" style="border-color:var(--olive-pale);font-weight:600;color:var(--olive);">
        </div>
        <div class="field" style="margin-bottom:0;">
          <label style="color:#7a6230;">Precio mayoreo $</label>
          <input id="kitPriceMayoreo" type="number" value="${k.priceMayoreo||''}" placeholder="0" style="border-color:#c8a86a;font-weight:600;color:#7a6230;">
        </div>
      </div>
    </div>

    <div style="display:flex;gap:10px;">
      ${id?`<button class="btn btn-danger" onclick="deleteProduct('${id}')">Eliminar</button>`:''}
      <button class="btn btn-primary btn-full" onclick="saveKit('${id||''}')">Guardar kit</button>
    </div>
  `);
  window._kitItems=selectedItems;
  window._renderKitItems();
};

window._kitItems=[];
window._renderKitItems=function(){
  const list=document.getElementById('kitSelectedList');if(!list)return;
  const sum=window._kitItems.reduce((s,i)=>{const p=state.products.find(x=>x.id===i.id);return s+(p?p.price||0:0)*i.qty;},0);
  const sumEl=document.getElementById('kitPriceSum');if(sumEl)sumEl.textContent=fmtMoney(sum);
  if(!window._kitItems.length){list.innerHTML='<div style="font-size:12px;color:var(--text-light);">Sin productos</div>';return;}
  list.innerHTML=window._kitItems.map((item,idx)=>{const p=state.products.find(x=>x.id===item.id);return `<div style="display:flex;align-items:center;gap:8px;background:var(--white);border-radius:8px;padding:8px 10px;border:1px solid var(--cream-mid);">
    <div style="flex:1;font-size:13px;font-weight:500;">${p?p.name:item.id}</div>
    <button onclick="window._kitQty(${idx},-1)" style="width:22px;height:22px;border-radius:6px;border:1px solid var(--cream-mid);background:var(--white);cursor:pointer;font-size:14px;">−</button>
    <span style="width:20px;text-align:center;font-weight:600;font-size:13px;">${item.qty}</span>
    <button onclick="window._kitQty(${idx},1)" style="width:22px;height:22px;border-radius:6px;border:1px solid var(--cream-mid);background:var(--white);cursor:pointer;font-size:14px;">+</button>
    <button onclick="window._removeKitItem(${idx})" style="width:22px;height:22px;border-radius:6px;border:none;background:var(--cream-dark);cursor:pointer;color:var(--danger);font-size:14px;">×</button>
  </div>`;}).join('');
};
window._kitQty=function(idx,d){window._kitItems[idx].qty+=d;if(window._kitItems[idx].qty<=0)window._kitItems.splice(idx,1);window._renderKitItems();};
window._removeKitItem=function(idx){window._kitItems.splice(idx,1);window._renderKitItems();};
window._addKitItem=function(id){if(!id)return;const ex=window._kitItems.find(i=>i.id===id);if(ex){ex.qty++;}else{window._kitItems.push({id,qty:1});}const inp=document.getElementById('kitProdSearch');if(inp)inp.value='';const dd=document.getElementById('kitSearchDropdown');if(dd)dd.style.display='none';window._renderKitItems();};
window._kitSearchInput=function(val){const dd=document.getElementById('kitSearchDropdown');if(!dd)return;const regularProds=state.products.filter(p=>!p.isKit);const q=val.trim().toLowerCase();const filtered=q?regularProds.filter(p=>(p.name||'').toLowerCase().includes(q)):regularProds;if(!filtered.length){dd.innerHTML='<div style="padding:10px 14px;font-size:13px;color:var(--text-light);">Sin resultados</div>';dd.style.display='block';return;}dd.innerHTML=filtered.slice(0,20).map(p=>`<div onmousedown="window._addKitItem('${p.id}')" style="padding:9px 14px;cursor:pointer;font-size:13px;border-bottom:1px solid var(--cream-mid);display:flex;justify-content:space-between;" onmouseover="this.style.background='var(--cream)'" onmouseout="this.style.background='var(--white)'"><span>${p.name}</span><span style="font-size:11px;color:var(--text-light);">${p.stock||0} uds</span></div>`).join('');dd.style.display='block';};
window._toggleKitSkin=function(s){const chips=document.querySelectorAll('#kitSkinChips .chip');if(s==='Todo tipo'||s==='No aplica'){chips.forEach(b=>b.classList.remove('active'));chips.forEach(b=>{if(b.textContent===s)b.classList.add('active');});}else{chips.forEach(b=>{if(b.textContent==='Todo tipo'||b.textContent==='No aplica')b.classList.remove('active');});chips.forEach(b=>{if(b.textContent===s)b.classList.toggle('active');});}};

window._handleKitImg = async function(input) {
  const file = input.files[0]; if(!file) return;
  const label = document.getElementById('kitImgUploadLabel');
  label.innerHTML = `<span style="color:var(--text-light);font-size:13px;">⏳ Subiendo...</span>`;
  try {
    const url = await uploadToR2(file);
    document.getElementById('kitImgData').value = url;
    label.innerHTML = `<img src="${url}" style="width:100%;height:100%;object-fit:cover;">`;
    toast('Imagen subida ✓');
  } catch(e) {
    console.error(e);
    label.innerHTML = `<div style="display:flex;flex-direction:column;align-items:center;gap:8px;">${icons.camera}<span style="color:var(--danger);font-size:12px;">Error</span></div>`;
    toast('Error al subir', 'err');
  }
};

window.saveKit=async function(id){
  const name=document.getElementById('kitName').value.trim();
  if(!name){toast('Escribe el nombre','err');return;}
  const totalUnits=window._kitItems.reduce((s,i)=>s+i.qty,0);
  if(totalUnits<2){toast('El kit debe tener al menos 2 unidades','err');return;}
  const price=+document.getElementById('kitPrice').value||0;
  const priceMayoreo=+document.getElementById('kitPriceMayoreo').value||0;
  const stock=+document.getElementById('kitStock').value||0;
  const data={
    name,isKit:true,category:'Kits',
    skin:Array.from(document.querySelectorAll('#kitSkinChips .chip.active')).map(b=>b.textContent).filter(Boolean),
    description:document.getElementById('kitDesc').value,
    price,priceMayoreo,stock,cost:0,
    kitItems:[...window._kitItems],
    image:document.getElementById('kitImgData').value||''
  };
  if(id){await updateItem('products',id,data);toast('Kit actualizado');}
  else{await addItem('products',data);toast('Kit creado');}
  closeModal('modalKit');
};

window.openStockModal=function(id){
  const p=state.products.find(x=>x.id===id);
  showModal('modalStock',`
    <div class="modal-header"><div class="modal-title">${p.name}</div><button class="modal-close" onclick="closeModal('modalStock')">×</button></div>
    <p style="color:var(--text-light);font-size:14px;margin-bottom:20px;">Stock actual: <strong style="color:var(--olive)">${p.stock||0}</strong> unidades</p>
    <div class="field"><label>Cantidad (+ agregar, - quitar)</label><input id="stockDelta" type="number" placeholder="+10 o -3"></div>
    <button class="btn btn-primary btn-full" onclick="applyStock('${id}')">Actualizar stock</button>
  `);
};
window.applyStock=async function(id){const delta=parseInt(document.getElementById('stockDelta').value);if(isNaN(delta)){toast('Ingresa una cantidad','err');return;}const p=state.products.find(x=>x.id===id);const newStock=Math.max(0,(p.stock||0)+delta);await updateItem('products',id,{stock:newStock});toast(`Stock: ${delta>0?'+':''}${delta}`);closeModal('modalStock');};

// ══════════════════════════════════════════
// COTIZAR — con modo Mayoreo / Menudeo
// ══════════════════════════════════════════
let quoteSearch='',quoteCatFilter='Todos',quoteCatActive=false,quoteSkinFilter='',quoteSkinActive=false,quoteMlVal='',quoteMlUnit='';
let quoteDiscount=0;
let quoteKoreanOnly=false;      // NUEVO
let quotePriceMode='menudeo';   // NUEVO: 'menudeo' | 'mayoreo'

// Helper: precio según modo
function getPriceForMode(p) {
  if(quotePriceMode==='mayoreo') return p.priceMayoreo||p.price||0;
  return p.price||0;
}

function renderQuote() {
  const subtotal=cartItems.reduce((s,i)=>s+(i.price*i.qty),0);
  const discountAmt=quoteDiscount>0?Math.min(quoteDiscount,subtotal):0;
  const total=subtotal-discountAmt;
  return `
  <!-- NUEVO: Selector Mayoreo / Menudeo -->
  <div style="display:flex;align-items:center;gap:8px;margin-bottom:14px;background:var(--cream-dark);border-radius:var(--radius-sm);padding:10px 14px;">
    <span style="font-size:12px;font-weight:600;color:var(--text-light);text-transform:uppercase;letter-spacing:.5px;flex-shrink:0;">Tipo de precio:</span>
    <div style="display:flex;gap:6px;">
      <button onclick="window._setPriceMode('menudeo')" class="btn btn-sm ${quotePriceMode==='menudeo'?'btn-primary':'btn-outline'}" style="border-radius:22px;">🛍 Menudeo</button>
      <button onclick="window._setPriceMode('mayoreo')" class="btn btn-sm ${quotePriceMode==='mayoreo'?'btn-primary':'btn-outline'}" style="border-radius:22px;background:${quotePriceMode==='mayoreo'?'#7a6230':'transparent'};border-color:${quotePriceMode==='mayoreo'?'#7a6230':'var(--cream-mid)'};">📦 Mayoreo</button>
    </div>
    ${cartItems.length>0?`<span style="font-size:11px;color:var(--text-light);margin-left:auto;">Cambiar modo limpiará el carrito</span>`:''}
  </div>

  <div class="search-wrap">
    <svg class="search-icon" viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
    <input id="quoteSearch" value="${quoteSearch}" placeholder="Buscar producto..." oninput="window._quoteSearch(this.value)" autocomplete="off">
  </div>
  <div style="display:flex;align-items:center;gap:6px;margin-bottom:10px;flex-wrap:wrap;">
    <!-- NUEVO: filtro coreano en cotizar -->
    <button onclick="window._toggleQuoteKorean()" class="btn btn-sm ${quoteKoreanOnly?'btn-primary':'btn-outline'}" style="border-radius:22px;">🇰🇷 ${quoteKoreanOnly?'Coreanos':'Ver coreanos'}</button>
    <input id="quoteMlValInput" type="number" min="0" value="${quoteMlVal}" placeholder="Cantidad" oninput="window._quoteMlVal(this.value)" style="width:80px;font-family:'Jost',sans-serif;font-size:13px;border:1.5px solid var(--cream-mid);border-radius:8px;padding:6px 10px;background:var(--white);color:var(--text);outline:none;">
    <select id="quoteMlUnitSel" onchange="window._quoteMlUnit(this.value)" style="font-family:'Jost',sans-serif;font-size:13px;border:1.5px solid var(--cream-mid);border-radius:8px;padding:6px 8px;background:var(--white);color:var(--text);outline:none;">
      <option value="">Todas</option>
      <option value="ml"${quoteMlUnit==='ml'?' selected':''}>ml</option>
      <option value="g"${quoteMlUnit==='g'?' selected':''}>g</option>
      <option value="oz"${quoteMlUnit==='oz'?' selected':''}>oz</option>
      <option value="N/A"${quoteMlUnit==='N/A'?' selected':''}>N/A</option>
    </select>
    ${(quoteMlVal||quoteMlUnit)?`<button onclick="window._quoteMlClear()" style="font-size:11px;color:var(--text-light);background:none;border:none;cursor:pointer;">✕</button>`:''}
  </div>
  <div class="chips" id="quoteCatChips">${CATS.map(c=>`<button class="chip${quoteCatActive&&quoteCatFilter===c?' active':''}" onclick="window._quoteCatFilter('${c}')">${c}</button>`).join('')}</div>
  <div class="chips" id="quoteSkinChips">${SKINS.map(s=>`<button class="chip${quoteSkinFilter===s&&quoteSkinActive?' active':''}" onclick="window._quoteSkinFilter('${s}')">${s}</button>`).join('')}</div>
  <div id="quoteGrid" style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:16px;" class="quote-product-grid"></div>
  ${cartItems.length>0?`
  <div class="card" style="padding:16px;margin-bottom:14px;">
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:12px;">
      <div style="font-family:'Playfair Display',serif;font-size:18px;flex:1;">Cotización actual</div>
        <span style="font-size:11px;font-weight:700;padding:3px 10px;border-radius:20px;${quotePriceMode==='mayoreo'?'background:#f0ead8;color:#7a6230;':'background:#daeadd;color:var(--success);'}">${quotePriceMode==='mayoreo'?'MAYOREO':'MENUDEO'}</span>    </div>
    ${cartItems.map(i=>{const prod=state.products.find(x=>x.id===i.id);const outOfStock=prod&&(prod.stock||0)===0;return `
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px;">
      <div style="flex:1;font-size:13px;">${i.name}${outOfStock?`<span style="background:#f0dada;color:var(--danger);border-radius:4px;font-size:10px;font-weight:700;padding:1px 5px;margin-left:4px;">sin stock</span>`:''}</div>
      <div style="display:flex;align-items:center;gap:6px;">
        <button onclick="changeQty('${i.id}',-1)" style="width:26px;height:26px;border-radius:8px;border:1px solid var(--cream-mid);background:var(--white);cursor:pointer;display:flex;align-items:center;justify-content:center;">${icons.minus}</button>
        <span style="width:22px;text-align:center;font-weight:600;">${i.qty}</span>
        <button onclick="changeQty('${i.id}',1)" style="width:26px;height:26px;border-radius:8px;border:1px solid var(--cream-mid);background:var(--white);cursor:pointer;display:flex;align-items:center;justify-content:center;">${icons.plus}</button>
        <button onclick="removeCartItem('${i.id}')" style="width:26px;height:26px;border-radius:8px;border:none;background:#f0dada;cursor:pointer;color:var(--danger);font-weight:700;font-size:15px;line-height:1;">×</button>
      </div>
      <div style="width:72px;text-align:right;font-weight:600;color:${quotePriceMode==='mayoreo'?'#7a6230':'var(--olive)'};font-size:13px;">${fmtMoney(i.price*i.qty)}</div>
    </div>`;}).join('')}
    <div class="divider"></div>
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
      <span style="font-size:13px;color:var(--text-light);">Subtotal</span>
      <span style="font-size:14px;">${fmtMoney(subtotal)}</span>
    </div>
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px;">
      <span style="font-size:13px;color:var(--text-light);flex:1;">Descuento $</span>
      <input id="quoteDiscountInput" type="number" min="0" value="${quoteDiscount||''}" placeholder="0" oninput="window._updateDiscount(this.value)" style="width:90px;font-family:'Jost',sans-serif;font-size:14px;border:1.5px solid var(--cream-mid);border-radius:8px;padding:5px 10px;background:var(--white);color:var(--danger);font-weight:600;outline:none;text-align:right;">
    </div>
    <div style="display:flex;justify-content:space-between;align-items:center;">
      <span style="font-weight:600;">Total</span>
      <span style="font-family:'Playfair Display',serif;font-size:22px;color:${quotePriceMode==='mayoreo'?'#7a6230':'var(--olive)'};" id="quoteTotalFinal">${fmtMoney(total)}</span>
    </div>
  </div>
  <div class="field"><label>Cliente</label><input id="quoteClient" placeholder="Nombre del cliente"></div>
  <div class="field"><label>Nota</label><input id="quoteNote" placeholder="Nota adicional..."></div>
  <div style="display:flex;gap:10px;margin-bottom:24px;">
    <button class="btn btn-outline" onclick="clearCart()">Limpiar</button>
    <button class="btn btn-primary btn-full" onclick="saveQuote()">Guardar cotización</button>
  </div>`:''}
  ${state.quotes.length>0?`
  <div style="font-family:'Playfair Display',serif;font-size:18px;margin-bottom:12px;">Cotizaciones guardadas</div>
  ${(()=>{
    const pending=state.quotes.filter(q=>!q.status||q.status==='pendiente');
    const done=state.quotes.filter(q=>q.status==='vendida'||q.status==='cancelada');
    const sorted=[...pending,...done];
    return sorted.slice(0,40).map(q=>`
  <div class="card quote-card">
    <div class="quote-header">
      <div>
        <div class="quote-client">${q.client||'Sin nombre'}</div>
        <div class="quote-date">${q.date?new Date(q.date).toLocaleDateString('es-MX'):''}${q.priceMode?` · <span style="font-weight:600;color:${q.priceMode==='mayoreo'?'#7a6230':'var(--success)'};">${q.priceMode==='mayoreo'?'📦 Mayoreo':'🛍 Menudeo'}</span>`:''}</div>
      </div>
      <span class="pill ${q.status==='vendida'?'pill-sold':q.status==='cancelada'?'pill-cancelled':'pill-pending'}">${q.status||'pendiente'}</span>
    </div>
    <div class="quote-items">${(q.items||[]).map(i=>`${i.name} ×${i.qty}`).join(', ')}</div>
    <div class="quote-footer">
      <span class="quote-total">${fmtMoney(q.total)}</span>
      <div class="quote-btns">
        <button class="btn btn-sm btn-danger" onclick="deleteQuote('${q.id}')">${icons.trash}</button>
        <button class="btn btn-sm btn-outline" onclick="downloadQuotePDF('${q.id}')">${icons.pdf}</button>
        ${q.status!=='vendida'?`
        <button class="btn btn-sm btn-outline" onclick="editQuote('${q.id}')">${icons.edit}</button>
        <button class="btn btn-sm btn-primary" onclick="convertToSale('${q.id}')">${icons.check} Venta</button>
        <button class="btn btn-sm" style="background:#e0eaf5;color:#3a5080;" onclick="convertToCredit('${q.id}')">💳 Abono</button>
        `:`<span style="font-size:12px;color:var(--success);font-weight:600;padding:4px 8px;">✓ Vendida</span>`}
      </div>
    </div>
  </div>`).join('');
  })()}`:''}`;
}

function renderQuoteGrid() {
  const grid=document.getElementById('quoteGrid');if(!grid)return;
  const skinChips=document.getElementById('quoteSkinChips');
  if(skinChips)skinChips.innerHTML=SKINS.map(s=>`<button class="chip${quoteSkinFilter===s&&quoteSkinActive?' active':''}" onclick="window._quoteSkinFilter('${s}')">${s}</button>`).join('');
  let prods=state.products.filter(p=>(p.name||'').toLowerCase().includes(quoteSearch.toLowerCase()));
  if(quoteCatActive&&quoteCatFilter!=='Todos')prods=prods.filter(p=>p.category===quoteCatFilter);
  if(quoteSkinActive){const specific=prods.filter(p=>Array.isArray(p.skin)?p.skin.includes(quoteSkinFilter):(p.skin||'')===quoteSkinFilter);const todoTipo=prods.filter(p=>Array.isArray(p.skin)?p.skin.includes('Todo tipo'):p.skin==='Todo tipo');prods=[...specific,...todoTipo];}
  if(quoteMlVal)prods=prods.filter(p=>String(p.mlVal)===String(quoteMlVal));
  if(quoteMlUnit)prods=prods.filter(p=>(p.mlUnit||'ml')===quoteMlUnit);
  // NUEVO: filtro coreano
  if(quoteKoreanOnly)prods=prods.filter(p=>p.isKorean===true);

  const anyFilter=quoteCatActive||quoteSkinActive||quoteSearch.length>0||quoteMlVal||quoteMlUnit||quoteKoreanOnly;
  if(!anyFilter){grid.innerHTML=`<div class="empty" style="grid-column:1/-1;">${icons.pkg}<p>Selecciona una categoría o tipo de piel</p></div>`;return;}

  grid.innerHTML=prods.map(p=>{
    const inCart=cartItems.find(i=>i.id===p.id);
    const outOfStock=(p.stock||0)===0;
    const displayPrice=getPriceForMode(p);
    const hasMayoreo=p.priceMayoreo&&p.priceMayoreo>0;
    return `
  <div class="card" style="padding:7px;cursor:pointer;border:2px solid ${inCart?'var(--olive)':'transparent'};transition:border .2s;display:flex;flex-direction:column;height:100%;" onclick="addToCart('${p.id}')">
    <div style="width:100%;aspect-ratio:1;border-radius:8px;overflow:hidden;background:var(--cream-dark);margin-bottom:6px;flex-shrink:0;position:relative;">
      ${p.image?`<img src="${p.image}" style="width:100%;height:100%;object-fit:cover;">`:`<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;">${icons.pkg}</div>`}
      ${outOfStock?`<div style="position:absolute;inset:0;background:rgba(0,0,0,.35);display:flex;align-items:center;justify-content:center;"><span style="color:#fff;font-size:9px;font-weight:700;">SIN STOCK</span></div>`:''}
      ${inCart?`<div style="position:absolute;top:4px;right:4px;background:var(--olive);color:var(--cream);border-radius:20px;font-size:10px;padding:1px 6px;font-weight:700;">×${inCart.qty}</div>`:''}
      ${p.isKorean?`<div style="position:absolute;top:4px;left:4px;font-size:13px;" title="Coreano">🇰🇷</div>`:''}
    </div>
    <div style="flex:1;display:flex;flex-direction:column;">
      <div style="font-size:11px;font-weight:600;color:var(--text);line-height:1.3;margin-bottom:4px;word-break:break-word;">${p.name}</div>
      <div style="margin-top:auto;">
        <div style="display:flex;justify-content:space-between;align-items:center;">
          <span style="color:${quotePriceMode==='mayoreo'?'#7a6230':'var(--olive)'};font-weight:700;font-size:13px;">${fmtMoney(displayPrice)}</span>
          <span style="font-size:10px;font-weight:600;padding:1px 6px;border-radius:20px;${(p.stock||0)===0?'background:#f0dada;color:var(--danger);':(p.stock||0)<=3?'background:#f0ead8;color:#7a6230;':'background:#daeadd;color:var(--success);'}">${p.stock||0}</span>
        </div>
        ${hasMayoreo&&quotePriceMode==='menudeo'?`<div style="font-size:10px;color:#7a6230;margin-top:2px;">May: ${fmtMoney(p.priceMayoreo)}</div>`:''}
        ${hasMayoreo&&quotePriceMode==='mayoreo'?`<div style="font-size:10px;color:var(--olive);margin-top:2px;">Men: ${fmtMoney(p.price)}</div>`:''}
      </div>
    </div>
  </div>`;}).join('')||`<div class="empty" style="grid-column:1/-1;">${icons.pkg}<p>Sin productos</p></div>`;
}

window._quoteSearch=v=>{quoteSearch=v;renderQuoteGrid();};
window._quoteCatFilter=v=>{if(quoteCatFilter===v&&quoteCatActive){quoteCatActive=false;}else{quoteCatFilter=v;quoteCatActive=true;}const chips=document.getElementById('quoteCatChips');if(chips)chips.innerHTML=CATS.map(c=>`<button class="chip${quoteCatActive&&quoteCatFilter===c?' active':''}" onclick="window._quoteCatFilter('${c}')">${c}</button>`).join('');renderQuoteGrid();};
window._quoteSkinFilter=v=>{if(quoteSkinFilter===v&&quoteSkinActive){quoteSkinActive=false;quoteSkinFilter='';}else{quoteSkinFilter=v;quoteSkinActive=true;}renderQuoteGrid();};
window._quoteMlVal=v=>{quoteMlVal=v;renderQuoteGrid();};
window._quoteMlUnit=v=>{quoteMlUnit=v;renderQuoteGrid();};
window._quoteMlClear=()=>{quoteMlVal='';quoteMlUnit='';renderQuoteGrid();};
window._updateDiscount=v=>{const subtotal=cartItems.reduce((s,i)=>s+(i.price*i.qty),0);quoteDiscount=Math.max(0,Math.min(+v||0,subtotal));const el=document.getElementById('quoteTotalFinal');if(el)el.textContent=fmtMoney(subtotal-quoteDiscount);};
// NUEVOS handlers
window._toggleQuoteKorean=()=>{quoteKoreanOnly=!quoteKoreanOnly;const c=document.getElementById('mainContent');c.innerHTML=renderQuote();renderQuoteGrid();};
window._setPriceMode=function(mode){
  if(mode===quotePriceMode)return;
  if(cartItems.length>0){if(!confirm('Cambiar el tipo de precio limpiará el carrito. ¿Continuar?'))return;cartItems=[];quoteDiscount=0;}
  quotePriceMode=mode;
  const c=document.getElementById('mainContent');c.innerHTML=renderQuote();renderQuoteGrid();
};

function _refreshQuoteTab(){if(currentTab!==1)return;const c=document.getElementById('mainContent');c.innerHTML=renderQuote();renderQuoteGrid();}

window.addToCart=function(id){
  const p=state.products.find(x=>x.id===id);if(!p)return;
  const ex=cartItems.find(i=>i.id===id);
  const usePrice=getPriceForMode(p);
  if(ex)ex.qty++;
  else cartItems.push({id:p.id,name:p.name,price:usePrice,cost:p.cost||0,qty:1,priceMode:quotePriceMode});
  if((p.stock||0)===0)toast('Sin stock — cotización preventiva','err');
  if(currentTab===1)_refreshQuoteTab();else renderTab();
};
window.removeCartItem=function(id){cartItems=cartItems.filter(x=>x.id!==id);_refreshQuoteTab();};
window.changeQty=function(id,d){const i=cartItems.find(x=>x.id===id);if(!i)return;i.qty+=d;if(i.qty<=0)cartItems=cartItems.filter(x=>x.id!==id);if(currentTab===1)_refreshQuoteTab();else renderTab();};
window.clearCart=function(){cartItems=[];quoteDiscount=0;quoteSearch='';quoteCatActive=false;quoteSkinActive=false;quoteSkinFilter='';const c=document.getElementById('mainContent');c.innerHTML=renderQuote();renderQuoteGrid();};

window.saveQuote=async function(){
  if(!cartItems.length){toast('Agrega productos primero','err');return;}
  const client=document.getElementById('quoteClient')?.value||'';
  const note=document.getElementById('quoteNote')?.value||'';
  const subtotal=cartItems.reduce((s,i)=>s+(i.price*i.qty),0);
  const discount=Math.max(0,Math.min(quoteDiscount||0,subtotal));
  const total=subtotal-discount;
  await addItem('quotes',{client,note,items:[...cartItems],subtotal,discount,total,status:'pendiente',date:new Date().toISOString(),priceMode:quotePriceMode});
  toast('Cotización guardada ✓');
  cartItems=[];quoteDiscount=0;quoteSearch='';quoteCatActive=false;quoteSkinActive=false;quoteSkinFilter='';
  const c=document.getElementById('mainContent');c.innerHTML=renderQuote();renderQuoteGrid();
};

window.deleteQuote=async function(id){
  if(!confirm('¿Eliminar esta cotización?'))return;
  state.quotes=state.quotes.filter(q=>q.id!==id);
  const c=document.getElementById('mainContent');c.innerHTML=renderQuote();renderQuoteGrid();
  toast('Cotización eliminada');
  deleteItem('quotes',id).catch(()=>toast('Error','err'));
};

window.editQuote=async function(id){
  const q=state.quotes.find(x=>x.id===id);if(!q)return;
  cartItems=(q.items||[]).map(i=>({...i}));quoteDiscount=q.discount||0;quoteSearch='';quoteCatActive=false;quoteSkinActive=false;quoteSkinFilter='';
  if(q.priceMode)quotePriceMode=q.priceMode;
  state.quotes=state.quotes.filter(x=>x.id!==id);deleteItem('quotes',id);
  const c=document.getElementById('mainContent');c.innerHTML=renderQuote();renderQuoteGrid();
  const clientEl=document.getElementById('quoteClient');const noteEl=document.getElementById('quoteNote');
  if(clientEl)clientEl.value=q.client||'';if(noteEl)noteEl.value=q.note||'';
  toast('Cotización cargada para editar');
};

window.convertToSale=async function(id){
  const q=state.quotes.find(x=>x.id===id);if(!q||q.status==='vendida')return;
  await addItem('sales',{client:q.client||'',items:q.items||[],total:q.total||0,date:new Date().toISOString(),priceMode:q.priceMode||'menudeo'});
  await updateItem('quotes',id,{status:'vendida'});
  for(const item of (q.items||[])){const p=state.products.find(x=>x.id===item.id);if(p)await updateItem('products',p.id,{stock:Math.max(0,(p.stock||0)-item.qty)});}
  toast('¡Venta registrada!');const qLocal=state.quotes.find(x=>x.id===id);if(qLocal)qLocal.status='vendida';
};

window.convertToCredit=function(id){
  const q=state.quotes.find(x=>x.id===id);if(!q)return;
  showModal('modalCredit',`
    <div class="modal-header"><div class="modal-title">Registrar como venta a crédito</div><button class="modal-close" onclick="closeModal('modalCredit')">×</button></div>
    <p style="font-size:13px;color:var(--text-light);margin-bottom:16px;">Total de la cotización: <strong style="color:var(--olive);font-size:16px;">${fmtMoney(q.total)}</strong></p>
    <div class="field"><label>Primer abono $</label><input id="creditFirstAbono" type="number" placeholder="0 para registrar sin abono inicial"></div>
    <button class="btn btn-primary btn-full" onclick="saveCreditSale('${id}')">Registrar venta a crédito</button>
  `);
};

window.saveCreditSale=async function(quoteId){
  const q=state.quotes.find(x=>x.id===quoteId);if(!q)return;
  const firstAbono=+document.getElementById('creditFirstAbono').value||0;
  const pagos=firstAbono>0?[{amount:firstAbono,date:new Date().toISOString(),note:'Primer abono'}]:[];
  const pagado=pagos.reduce((s,p)=>s+p.amount,0);
  await addItem('creditSales',{
    client:q.client||'',items:q.items||[],total:q.total||0,pagado,pendiente:q.total-pagado,
    pagos,status:'pendiente',date:new Date().toISOString()
  });
  for(const item of (q.items||[])){const p=state.products.find(x=>x.id===item.id);if(p)await updateItem('products',p.id,{stock:Math.max(0,(p.stock||0)-item.qty)});}
  await updateItem('quotes',quoteId,{status:'vendida'});
  toast('Venta a crédito registrada ✓');
  closeModal('modalCredit');
};

window.downloadQuotePDF=function(id){
  const q=state.quotes.find(x=>x.id===id);if(!q)return;
  const{jsPDF}=window.jspdf;const doc=new jsPDF({format:'a4'});
  doc.setFont('helvetica');doc.setFontSize(22);doc.setTextColor(74,82,64);
  doc.text('Aplo Blossom',105,25,{align:'center'});
  doc.setFontSize(10);doc.setTextColor(138,148,128);doc.text('Cotizacion',105,33,{align:'center'});
  if(q.priceMode){doc.setFontSize(9);doc.setTextColor(q.priceMode==='mayoreo'?122:74,q.priceMode==='mayoreo'?98:130,q.priceMode==='mayoreo'?48:64);doc.text((q.priceMode==='mayoreo'?'Precio Mayoreo':'Precio Menudeo'),105,40,{align:'center'});}
  doc.setFontSize(10);doc.setTextColor(90,88,72);doc.text(`Fecha: ${new Date(q.date||Date.now()).toLocaleDateString('es-MX')}`,20,50);
  if(q.client)doc.text(`Cliente: ${q.client}`,20,57);
  let y=70;doc.setFillColor(74,82,64);doc.rect(20,y-6,170,10,'F');doc.setTextColor(245,240,232);doc.setFontSize(10);
  doc.text('Producto',22,y);doc.text('Cant.',120,y);doc.text('Precio unit.',140,y);doc.text('Subtotal',170,y);
  y+=10;doc.setTextColor(44,44,36);
  for(const item of (q.items||[])){
    const nameLines=doc.splitTextToSize((item.name||'').replace(/[^\x00-\x7F]/g,''),90);
    const rowH=Math.max(22,nameLines.length*4.2+10);
    if(y+rowH>283){doc.addPage();y=20;}
    doc.text(nameLines,22,y+5);doc.text(String(item.qty||0),120,y+rowH/2+2);
    doc.text(fmtMoney(item.price),140,y+rowH/2+2);doc.text(fmtMoney((item.price||0)*(item.qty||0)),170,y+rowH/2+2);
    y+=rowH;doc.setDrawColor(232,223,200);doc.line(20,y,190,y);
  }
  y+=6;if((q.discount||0)>0){doc.setFontSize(10);doc.setTextColor(90,88,72);doc.text(`Subtotal: ${fmtMoney(q.subtotal||q.total||0)}`,190,y,{align:'right'});y+=8;doc.setTextColor(139,58,58);doc.text(`Descuento: -${fmtMoney(q.discount)}`,190,y,{align:'right'});y+=8;}
  doc.setFontSize(13);doc.setTextColor(74,82,64);doc.text(`Total: ${fmtMoney(q.total||0)}`,190,y,{align:'right'});
  if(q.note){y+=12;doc.setFontSize(9);doc.setTextColor(138,148,128);doc.text(`Nota: ${q.note}`,20,y);}
  doc.save(`cotizacion-${q.client||'cliente'}.pdf`);toast('PDF descargado');
};

// ══════════════════════════════════════════
// VENTAS
// ══════════════════════════════════════════
function renderSales() {
  const today=new Date().toDateString();
  const todaySales=state.sales.filter(s=>s.date&&new Date(s.date).toDateString()===today);
  const todayTotal=todaySales.reduce((s,v)=>s+(v.total||0),0);
  const todayProfit=todaySales.reduce((s,v)=>s+(v.items||[]).reduce((ss,i)=>ss+((i.price||0)-(i.cost||0))*i.qty,0),0);
  const totalIngresos=state.sales.reduce((s,v)=>s+(v.total||0),0);
  return `
  <div class="section-title">Ventas</div>
  <div class="summary-grid">
    <div class="summary-card" style="background:#daeadd;"><div class="summary-val" style="color:var(--success);">${fmtMoney(todayTotal)}</div><div class="summary-label">Ventas hoy</div></div>
    <div class="summary-card" style="background:#e8edd8;"><div class="summary-val" style="color:var(--olive);">${fmtMoney(todayProfit)}</div><div class="summary-label">Ganancia hoy</div></div>
    <div class="summary-card" style="background:#f5f0e8;border:1px solid var(--cream-mid);"><div class="summary-val" style="color:var(--text);">${state.sales.length}</div><div class="summary-label">Total ventas</div></div>
    <div class="summary-card" style="background:#f5f0e8;border:1px solid var(--cream-mid);"><div class="summary-val" style="color:var(--gold);">${fmtMoney(totalIngresos)}</div><div class="summary-label">Ingreso total</div></div>
  </div>
  <div style="font-family:'Playfair Display',serif;font-size:18px;margin-bottom:12px;color:var(--text);">Historial</div>
  ${state.sales.length===0?`<div class="empty">${icons.check}<p>Sin ventas aún.</p></div>`:''}
  ${state.sales.slice(0,40).map(s=>`
  <div class="card" style="padding:14px;margin-bottom:10px;">
    <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:6px;">
      <span style="font-weight:600;font-size:15px;">${s.client||'Cliente'}</span>
      <div style="display:flex;align-items:center;gap:6px;">
        ${s.priceMode?`<span style="font-size:10px;font-weight:700;padding:2px 7px;border-radius:20px;${s.priceMode==='mayoreo'?'background:#f0ead8;color:#7a6230;':'background:#daeadd;color:var(--success);'}">${s.priceMode==='mayoreo'?'May':'Men'}</span>`:''}
        <span style="font-size:11px;color:var(--text-light);">${s.date?new Date(s.date).toLocaleDateString('es-MX'):''}</span>
      </div>
    </div>
    <div style="font-size:12px;color:var(--text-light);margin-bottom:8px;">${(s.items||[]).map(i=>`${i.name} ×${i.qty}`).join(', ')}</div>
    <div style="display:flex;justify-content:space-between;align-items:center;">
      <span style="font-family:'Playfair Display',serif;font-size:20px;color:var(--olive);">${fmtMoney(s.total)}</span>
      <div style="display:flex;align-items:center;gap:8px;">
        <span style="font-size:13px;color:var(--success);font-weight:500;">+${fmtMoney((s.items||[]).reduce((ss,i)=>ss+((i.price||0)-(i.cost||0))*i.qty,0))}</span>
        <button class="icon-btn" onclick="deleteSale('${s.id}')" style="background:#f0dada;">${icons.trash}</button>
      </div>
    </div>
  </div>`).join('')}`;
}

window.deleteSale=async function(id){
  const s=state.sales.find(x=>x.id===id);if(!s)return;
  if(!confirm(`¿Eliminar venta de ${s.client||'Cliente'}?`))return;
  const restore=confirm('¿Regresar los productos al stock?\n\nOK = SÍ restaurar\nCancelar = No restaurar');
  if(restore){for(const item of (s.items||[])){const p=state.products.find(x=>x.id===item.id);if(p)await updateItem('products',p.id,{stock:(p.stock||0)+(item.qty||0)});} toast('Venta eliminada · Stock restaurado ✓');}
  else toast('Venta eliminada');
  await deleteItem('sales',id);
};

// ══════════════════════════════════════════
// ABONOS (CRÉDITO)
// ══════════════════════════════════════════
function renderCreditSales() {
  const pending=state.creditSales.filter(c=>c.status!=='pagado');
  const done=state.creditSales.filter(c=>c.status==='pagado');
  const totalPendiente=pending.reduce((s,c)=>s+(c.pendiente||0),0);
  const totalPagosLibres=state.pagosLibres.reduce((s,p)=>s+(p.amount||0),0);
  return `
  <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:18px;">
    <div class="section-title" style="margin-bottom:0;">Abonos</div>
    <button class="btn btn-gold btn-sm" onclick="openPagoLibreModal()">+ Pago recibido</button>
  </div>
  <div class="summary-grid" style="margin-bottom:20px;">
    <div class="summary-card" style="background:#f0ead8;"><div class="summary-val" style="color:#7a6230;">${fmtMoney(totalPendiente)}</div><div class="summary-label">Por cobrar</div></div>
    <div class="summary-card" style="background:#f5f0e8;border:1px solid var(--cream-mid);"><div class="summary-val" style="color:var(--text);">${pending.length}</div><div class="summary-label">Clientes activos</div></div>
    <div class="summary-card" style="background:#daeadd;"><div class="summary-val" style="color:var(--success);">${fmtMoney(state.creditSales.reduce((s,c)=>s+(c.pagado||0),0))}</div><div class="summary-label">Total cobrado</div></div>
    <div class="summary-card" style="background:#e8edd8;"><div class="summary-val" style="color:var(--olive);">${fmtMoney(totalPagosLibres)}</div><div class="summary-label">Pagos recibidos</div></div>
  </div>
  ${state.pagosLibres.length>0?`
  <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
    <div style="font-family:'Playfair Display',serif;font-size:18px;color:var(--text);">Pagos recibidos</div>
  </div>
  <div style="display:flex;flex-direction:column;gap:8px;margin-bottom:24px;">
    ${state.pagosLibres.map(p=>`
    <div class="card" style="padding:14px;display:flex;align-items:center;gap:12px;">
      <div style="width:40px;height:40px;border-radius:10px;background:#daeadd;display:flex;align-items:center;justify-content:center;flex-shrink:0;font-size:18px;">💵</div>
      <div style="flex:1;min-width:0;">
        <div style="font-weight:600;font-size:14px;">${p.person||'Sin nombre'}</div>
        <div style="font-size:12px;color:var(--text-light);">${p.date?new Date(p.date).toLocaleDateString('es-MX'):''}</div>
        ${p.description?`<div style="font-size:12px;color:var(--text-mid);margin-top:3px;">${p.description}</div>`:''}
      </div>
      <div style="display:flex;align-items:center;gap:8px;flex-shrink:0;">
        <span style="font-family:'Playfair Display',serif;font-size:18px;color:var(--success);">+${fmtMoney(p.amount)}</span>
        <button class="icon-btn" onclick="deletePagoLibre('${p.id}')" style="background:#f0dada;">${icons.trash}</button>
      </div>
    </div>`).join('')}
  </div>`:''}
  ${pending.length===0&&done.length===0?`<div class="empty">${icons.pkg}<p>Sin ventas a crédito registradas.</p><p style="font-size:12px;margin-top:8px;">Crea una cotización y usa el botón "💳 Abono"</p></div>`:''}
  ${pending.length>0?`<div style="font-family:'Playfair Display',serif;font-size:18px;margin-bottom:12px;color:var(--text);">Pendientes de cobro</div>`:''}
  ${pending.map(c=>renderCreditCard(c)).join('')}
  ${done.length>0?`<div style="font-family:'Playfair Display',serif;font-size:18px;margin:20px 0 12px;color:var(--text);">Liquidadas</div>`:''}
  ${done.map(c=>renderCreditCard(c,true)).join('')}`;
}

function renderCreditCard(c, done=false) {
  const pct=c.total>0?Math.min(100,Math.round((c.pagado||0)/c.total*100)):0;
  return `
  <div class="card" style="padding:16px;margin-bottom:12px;${done?'opacity:.75':''}">
    <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:10px;">
      <div>
        <div style="font-weight:700;font-size:16px;">${c.client||'Sin nombre'}</div>
        <div style="font-size:12px;color:var(--text-light);">${c.date?new Date(c.date).toLocaleDateString('es-MX'):''}</div>
        <div style="font-size:12px;color:var(--text-light);margin-top:3px;">${(c.items||[]).map(i=>`${i.name} ×${i.qty}`).join(', ')}</div>
      </div>
      <span class="pill ${done?'pill-sold':'pill-pending'}">${done?'Liquidada':'Pendiente'}</span>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-bottom:12px;text-align:center;">
      <div style="background:var(--cream-dark);border-radius:8px;padding:8px;">
        <div style="font-size:10px;color:var(--text-light);margin-bottom:2px;">Total</div>
        <div style="font-family:'Playfair Display',serif;font-size:16px;color:var(--text);">${fmtMoney(c.total)}</div>
      </div>
      <div style="background:#daeadd;border-radius:8px;padding:8px;">
        <div style="font-size:10px;color:var(--text-light);margin-bottom:2px;">Pagado</div>
        <div style="font-family:'Playfair Display',serif;font-size:16px;color:var(--success);">${fmtMoney(c.pagado||0)}</div>
      </div>
      <div style="background:${(c.pendiente||0)>0?'#f0ead8':'#daeadd'};border-radius:8px;padding:8px;">
        <div style="font-size:10px;color:var(--text-light);margin-bottom:2px;">Resta</div>
        <div style="font-family:'Playfair Display',serif;font-size:16px;color:${(c.pendiente||0)>0?'#7a6230':'var(--success)'};">${fmtMoney(c.pendiente||0)}</div>
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
    ${(c.pagos||[]).length>0?`
    <div style="margin-bottom:12px;">
      <div style="font-size:11px;font-weight:600;letter-spacing:.5px;text-transform:uppercase;color:var(--text-light);margin-bottom:6px;">Historial de abonos</div>
      ${(c.pagos||[]).map((p,pi)=>`
      <div class="abono-row">
        <div>
          <span class="abono-badge">Abono #${pi+1}</span>
          ${p.note?`<span style="font-size:12px;color:var(--text-light);margin-left:6px;">${p.note}</span>`:''}
          <div style="font-size:11px;color:var(--text-light);margin-top:2px;">${p.date?new Date(p.date).toLocaleDateString('es-MX',''):''}</div>
        </div>
        <span style="font-weight:700;color:var(--success);font-size:14px;">+${fmtMoney(p.amount)}</span>
      </div>`).join('')}
    </div>`:''}
    <div style="display:flex;gap:8px;flex-wrap:wrap;">
      ${!done?`<button class="btn btn-primary btn-sm" onclick="openAbonoModal('${c.id}')">+ Registrar abono</button>`:''}
      <button class="btn btn-danger btn-sm" onclick="deleteCreditSale('${c.id}')">Eliminar</button>
    </div>
  </div>`;
}

window.openAbonoModal=function(id){
  const c=state.creditSales.find(x=>x.id===id);if(!c)return;
  showModal('modalAbono',`
    <div class="modal-header"><div class="modal-title">Registrar abono</div><button class="modal-close" onclick="closeModal('modalAbono')">×</button></div>
    <p style="font-size:14px;color:var(--text-light);margin-bottom:4px;">Cliente: <strong style="color:var(--text);">${c.client||'Sin nombre'}</strong></p>
    <p style="font-size:14px;color:var(--text-light);margin-bottom:16px;">Saldo pendiente: <strong style="color:var(--danger);">${fmtMoney(c.pendiente||0)}</strong></p>
    <div class="field"><label>Monto del abono $</label><input id="abonoAmount" type="number" placeholder="0" max="${c.pendiente||0}"></div>
    <div class="field"><label>Nota (opcional)</label><input id="abonoNote" placeholder="Ej: Transferencia, efectivo..."></div>
    <button class="btn btn-primary btn-full" onclick="saveAbono('${id}')">Guardar abono</button>
  `);
};

window.saveAbono=async function(id){
  const c=state.creditSales.find(x=>x.id===id);if(!c)return;
  const amount=+document.getElementById('abonoAmount').value;
  const note=document.getElementById('abonoNote').value.trim();
  if(!amount||amount<=0){toast('Ingresa un monto','err');return;}
  if(amount>(c.pendiente||0)){toast(`El abono no puede ser mayor al pendiente (${fmtMoney(c.pendiente)})`,'err');return;}
  const pagos=[...(c.pagos||[]),{amount,note,date:new Date().toISOString()}];
  const pagado=(c.pagado||0)+amount;
  const pendiente=Math.max(0,(c.total||0)-pagado);
  const status=pendiente<=0?'pagado':'pendiente';
  if(status==='pagado'){
    await addItem('sales',{client:c.client||'',items:c.items||[],total:c.total||0,date:new Date().toISOString(),note:'Crédito liquidado'});
    toast('¡Crédito liquidado! Venta registrada ✓');
  } else {
    toast(`Abono de ${fmtMoney(amount)} registrado ✓`);
  }
  await updateItem('creditSales',id,{pagos,pagado,pendiente,status});
  closeModal('modalAbono');
};

window.deleteCreditSale=async function(id){
  if(!confirm('¿Eliminar esta venta a crédito?'))return;
  await deleteItem('creditSales',id);toast('Eliminada');
};

window.openPagoLibreModal=function(){
  showModal('modalPagoLibre',`
    <div class="modal-header"><div class="modal-title">Registrar pago recibido</div><button class="modal-close" onclick="closeModal('modalPagoLibre')">×</button></div>
    <div class="field"><label>Persona / Cliente</label><input id="plPerson" placeholder="Ej: María García"></div>
    <div class="field"><label>Monto recibido $</label><input id="plAmount" type="number" placeholder="0"></div>
    <div class="field"><label>Descripción (opcional)</label><textarea id="plDesc" placeholder="Ej: Pago de deuda de enero, transferencia..."></textarea></div>
    <button class="btn btn-gold btn-full" onclick="savePagoLibre()">Guardar pago</button>
  `);
};
window.savePagoLibre=async function(){
  const person=document.getElementById('plPerson').value.trim();
  const amount=+document.getElementById('plAmount').value;
  const description=document.getElementById('plDesc').value.trim();
  if(!person){toast('Escribe el nombre de la persona','err');return;}
  if(!amount||amount<=0){toast('Ingresa un monto válido','err');return;}
  await addItem('pagosLibres',{person,amount,description,date:new Date().toISOString()});
  toast(`Pago de ${fmtMoney(amount)} registrado ✓`);
  closeModal('modalPagoLibre');
};
window.deletePagoLibre=async function(id){
  if(!confirm('¿Eliminar este pago?'))return;
  await deleteItem('pagosLibres',id);toast('Pago eliminado');
};

// ══════════════════════════════════════════
// REPORTES
// ══════════════════════════════════════════
let reportPeriod='week';
function getFilteredSales(period){const now=new Date(),sales=state.sales;if(period==='week'){const d=new Date(now);d.setDate(d.getDate()-7);return sales.filter(s=>s.date&&new Date(s.date)>=d);}if(period==='month'){const d=new Date(now);d.setMonth(d.getMonth()-1);return sales.filter(s=>s.date&&new Date(s.date)>=d);}return sales;}

function renderReports() {
  const filtered=getFilteredSales(reportPeriod);
  const totalVentas=filtered.reduce((s,v)=>s+(v.total||0),0);
  const totalGanancia=filtered.reduce((s,v)=>s+(v.items||[]).reduce((ss,i)=>ss+((i.price||0)-(i.cost||0))*i.qty,0),0);
  const prodMap={};for(const s of filtered)for(const i of (s.items||[])){if(!prodMap[i.id])prodMap[i.id]={id:i.id,name:i.name,qty:0,revenue:0};prodMap[i.id].qty+=i.qty;prodMap[i.id].revenue+=(i.price||0)*i.qty;}
  const sorted=Object.values(prodMap).sort((a,b)=>b.qty-a.qty);const top10=sorted.slice(0,10);const maxQty=top10[0]?.qty||1;
  const soldIds=new Set(Object.keys(prodMap));const noMove=state.products.filter(p=>!soldIds.has(p.id));
  return `
  <div class="section-title">Reportes</div>
  <div class="period-tabs">
    <button class="period-tab${reportPeriod==='week'?' active':''}" onclick="window._rPeriod('week')">Esta semana</button>
    <button class="period-tab${reportPeriod==='month'?' active':''}" onclick="window._rPeriod('month')">Este mes</button>
    <button class="period-tab${reportPeriod==='all'?' active':''}" onclick="window._rPeriod('all')">Todo</button>
  </div>
  <div class="summary-grid" style="margin-bottom:20px;">
    <div class="summary-card" style="background:#daeadd;"><div class="summary-val" style="color:var(--success);">${fmtMoney(totalVentas)}</div><div class="summary-label">Ingresos</div></div>
    <div class="summary-card" style="background:#e8edd8;"><div class="summary-val" style="color:var(--olive);">${fmtMoney(totalGanancia)}</div><div class="summary-label">Ganancia</div></div>
    <div class="summary-card" style="background:#f5f0e8;border:1px solid var(--cream-mid);"><div class="summary-val" style="color:var(--text);">${filtered.length}</div><div class="summary-label">Ventas</div></div>
    <div class="summary-card" style="background:#f5f0e8;border:1px solid var(--cream-mid);"><div class="summary-val" style="color:var(--gold);">${noMove.length}</div><div class="summary-label">Sin movimiento</div></div>
  </div>
  <div style="font-family:'Playfair Display',serif;font-size:18px;margin-bottom:14px;color:var(--text);">Top 10 más vendidos</div>
  <div class="card" style="padding:16px;margin-bottom:20px;">
    ${top10.length===0?`<div class="empty" style="padding:24px;">${icons.pkg}<p>Sin ventas en este período</p></div>`:''}
    ${top10.map((p,i)=>`<div class="bar-row"><div class="bar-label-row"><span class="bar-name"><span style="color:var(--gold);font-weight:700;margin-right:6px;">${i+1}.</span>${p.name}</span><span class="bar-val">${p.qty} uds · ${fmtMoney(p.revenue)}</span></div><div class="bar-track"><div class="bar-fill" style="width:${Math.round((p.qty/maxQty)*100)}%"></div></div></div>`).join('')}
  </div>
  <div style="font-family:'Playfair Display',serif;font-size:18px;margin-bottom:14px;color:var(--text);">Sin movimiento</div>
  ${noMove.length===0?`<p style="font-size:13px;color:var(--text-light);margin-bottom:20px;">¡Todos tuvieron ventas!</p>`:''}
  <div style="display:flex;flex-direction:column;gap:8px;margin-bottom:20px;">
    ${noMove.map(p=>`<div class="card" style="display:flex;align-items:center;gap:12px;padding:12px;">
      <div style="width:44px;height:44px;border-radius:10px;overflow:hidden;background:var(--cream-dark);flex-shrink:0;display:flex;align-items:center;justify-content:center;">${p.image?`<img src="${p.image}" style="width:100%;height:100%;object-fit:cover;">`:`${icons.pkg}`}</div>
      <div style="flex:1;"><div style="font-weight:600;font-size:14px;">${p.name}</div><div style="font-size:12px;color:var(--text-light);">Stock: ${p.stock||0}</div></div>
      <span class="pill pill-warn">Sin ventas</span>
    </div>`).join('')}
  </div>`;
}
window._rPeriod=v=>{reportPeriod=v;renderTab();};

// ══════════════════════════════════════════
// FINANZAS
// ══════════════════════════════════════════
let finPeriod='month';
function renderFinances() {
  const now=new Date();let filtSales=state.sales,filtExp=state.expenses;
  if(finPeriod==='week'){const d=new Date(now);d.setDate(d.getDate()-7);filtSales=filtSales.filter(s=>s.date&&new Date(s.date)>=d);filtExp=filtExp.filter(e=>e.date&&new Date(e.date)>=d);}
  else if(finPeriod==='month'){const d=new Date(now);d.setMonth(d.getMonth()-1);filtSales=filtSales.filter(s=>s.date&&new Date(s.date)>=d);filtExp=filtExp.filter(e=>e.date&&new Date(e.date)>=d);}
  const ingresos=filtSales.reduce((s,v)=>s+(v.total||0),0);
  const costos=filtSales.reduce((s,v)=>s+(v.items||[]).reduce((ss,i)=>ss+(i.cost||0)*i.qty,0),0);
  const gastos=filtExp.reduce((s,e)=>s+(e.amount||0),0);
  const ganancia=ingresos-costos-gastos;
  const margen=ingresos>0?Math.round((ganancia/ingresos)*100):0;
  return `
  <div class="section-title">Finanzas</div>
  <div class="period-tabs">
    <button class="period-tab${finPeriod==='week'?' active':''}" onclick="window._fPeriod('week')">Esta semana</button>
    <button class="period-tab${finPeriod==='month'?' active':''}" onclick="window._fPeriod('month')">Este mes</button>
    <button class="period-tab${finPeriod==='all'?' active':''}" onclick="window._fPeriod('all')">Todo</button>
  </div>
  <div class="summary-grid">
    <div class="summary-card" style="background:#daeadd;"><div class="summary-val" style="color:var(--success);">${fmtMoney(ingresos)}</div><div class="summary-label">Ingresos</div></div>
    <div class="summary-card" style="background:#f0dada;"><div class="summary-val" style="color:var(--danger);">${fmtMoney(costos+gastos)}</div><div class="summary-label">Egresos</div></div>
    <div class="summary-card" style="background:${ganancia>=0?'#e8edd8':'#f0dada'};"><div class="summary-val" style="color:${ganancia>=0?'var(--olive)':'var(--danger)'};">${fmtMoney(ganancia)}</div><div class="summary-label">Ganancia neta</div></div>
    <div class="summary-card" style="background:#f5f0e8;border:1px solid var(--cream-mid);"><div class="summary-val" style="color:var(--gold);">${margen}%</div><div class="summary-label">Margen</div></div>
  </div>
  ${ingresos>0?`<div class="card" style="padding:16px;margin-bottom:20px;">
    <div style="font-family:'Playfair Display',serif;font-size:16px;margin-bottom:14px;">Distribución</div>
    ${[{label:'Costo de productos',val:costos,color:'#b8c4a0'},{label:'Gastos operativos',val:gastos,color:'#c4a8a0'},{label:'Ganancia neta',val:Math.max(0,ganancia),color:'#7a9870'}].map(b=>`<div class="bar-row"><div class="bar-label-row"><span class="bar-name">${b.label}</span><span class="bar-val">${fmtMoney(b.val)}</span></div><div class="bar-track"><div class="bar-fill" style="width:${ingresos>0?Math.min(100,Math.round((b.val/ingresos)*100)):0}%;background:${b.color};"></div></div></div>`).join('')}
  </div>`:''}
  <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
    <div style="font-family:'Playfair Display',serif;font-size:18px;color:var(--text);">Gastos registrados</div>
    <button class="btn btn-primary btn-sm" onclick="openExpenseModal()">+ Gasto</button>
  </div>
  ${filtExp.length===0?`<div class="empty">${icons.pkg}<p>Sin gastos</p></div>`:''}
  ${filtExp.slice(0,40).map(e=>`
  <div class="card" style="padding:14px;margin-bottom:10px;">
    <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px;">
      <div style="flex:1;min-width:0;">
        <div style="font-weight:600;font-size:14px;margin-bottom:2px;">${e.concept||''}</div>
        <div style="font-size:12px;color:var(--text-light);">${e.category||''} · ${e.date?new Date(e.date).toLocaleDateString('es-MX'):''}</div>
        ${e.description?`<div style="font-size:12px;color:var(--text-mid);margin-top:5px;border-left:2px solid var(--cream-mid);padding-left:8px;">${e.description}</div>`:''}
      </div>
      <div style="display:flex;align-items:center;gap:8px;flex-shrink:0;">
        <span style="font-family:'Playfair Display',serif;font-size:18px;color:var(--danger);">-${fmtMoney(e.amount)}</span>
        <button class="icon-btn" onclick="deleteExpense('${e.id}')" style="background:#f0dada;">${icons.trash}</button>
      </div>
    </div>
  </div>`).join('')}`;
}
window._fPeriod=v=>{finPeriod=v;renderTab();};
window.openExpenseModal=function(){showModal('modalExpense',`
  <div class="modal-header"><div class="modal-title">Registrar gasto</div><button class="modal-close" onclick="closeModal('modalExpense')">×</button></div>
  <div class="field"><label>Concepto</label><input id="eConcept" placeholder="Ej: Compra de productos..."></div>
  <div class="field"><label>Monto $</label><input id="eAmount" type="number" placeholder="0"></div>
  <div class="field"><label>Categoría</label><select id="eCat">${EXPENSE_CATS.map(c=>`<option>${c}</option>`).join('')}</select></div>
  <div class="field"><label>Descripción (opcional)</label><textarea id="eDesc" placeholder="Detalles..."></textarea></div>
  <button class="btn btn-primary btn-full" onclick="saveExpense()">Guardar gasto</button>
`);};
window.saveExpense=async function(){const concept=document.getElementById('eConcept').value.trim();const amount=+document.getElementById('eAmount').value;if(!concept||!amount){toast('Completa los campos','err');return;}const desc=document.getElementById('eDesc')?.value.trim()||'';await addItem('expenses',{concept,amount,category:document.getElementById('eCat').value,description:desc,date:new Date().toISOString()});toast('Gasto registrado');closeModal('modalExpense');};
window.deleteExpense=async function(id){if(!confirm('¿Eliminar este gasto?'))return;await deleteItem('expenses',id);toast('Gasto eliminado');};

// ══════════════════════════════════════════
// CATÁLOGO
// ══════════════════════════════════════════
function renderCatalog() {
  const inStock=state.products.filter(p=>(p.stock||0)>0).length;
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
    ${state.products.map(p=>`
    <div class="card" style="padding:0;overflow:hidden;opacity:${(p.stock||0)===0?'0.5':'1'};">
      <div style="width:100%;height:120px;background:var(--cream-dark);overflow:hidden;display:flex;align-items:center;justify-content:center;">
        ${p.image?`<img src="${p.image}" style="width:100%;height:100%;object-fit:cover;">`:`${icons.pkg}`}
      </div>
      <div style="padding:10px;">
        <div style="font-weight:600;font-size:13px;margin-bottom:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${p.name}${p.isKorean?' 🇰🇷':''}</div>
        <div style="display:flex;justify-content:space-between;align-items:center;margin-top:6px;">
          <span style="font-family:'Playfair Display',serif;font-size:16px;color:var(--olive);">${fmtMoney(p.price)}</span>
          <span class="pill ${(p.stock||0)===0?'pill-low':'pill-ok'}" style="font-size:10px;">${(p.stock||0)===0?'Agotado':'En stock'}</span>
        </div>
        ${p.priceMayoreo?`<div style="font-size:11px;color:#7a6230;margin-top:3px;">May: ${fmtMoney(p.priceMayoreo)}</div>`:''}
      </div>
    </div>`).join('')}
  </div>`;
}

// ══════════════════════════════════════════
// EXPORTAR IMÁGENES — con selector de precio
// ══════════════════════════════════════════
window.openExportImagesModal = function() {
  showModal('modalExportImg',`
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

    const nombre = (p.name || '').toUpperCase();
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

    const descFrases = p.description
      ? p.description.split(/[.,;]/).map(s => s.trim()).filter(Boolean)
      : [p.name || ''];

    const extraItems = [];
    const skinArr = Array.isArray(p.skin)
      ? p.skin.filter(s => s && s !== 'No aplica')
      : (p.skin && p.skin !== 'No aplica' ? [p.skin] : []);
    if (skinArr.length) extraItems.push(skinArr.join(', '));
    const mlVal = String(p.mlVal || '').trim();
    const mlUnit = String(p.mlUnit || '').trim();
    if (mlVal && mlVal !== '0' && mlUnit && mlUnit !== 'N/A') extraItems.push(mlVal + ' ' + mlUnit);
    if (p.isKorean) extraItems.push('🇰🇷 Coreano');

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
      const extraText = extraItems.filter(e => !e.includes('🇰🇷')).join('  ·  ').toUpperCase();
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
  const a = document.createElement('a');
  a.href = URL.createObjectURL(zipBlob);
  const modeLabel = priceMode === 'ambos' ? 'ambos-precios' : priceMode;
  a.download = `catalogo-aploblossom-${modeLabel}.zip`;
  document.body.appendChild(a); a.click();
  setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(a.href); }, 1000);
  toast(`ZIP descargado (${count} imágenes - ${priceMode})`);
};

window.exportStockExcel = function() {
  if(!state.products.length){toast('No hay productos','err');return;}
  const headers=['Nombre','Categoría','Tipo de piel','Cantidad','Unidad','Precio Menudeo ($)','Precio Mayoreo ($)','Costo ($)','Stock','Coreano','Descripción','Imagen (URL)'];
  const escape=v=>{const s=String(v==null?'':v).replace(/"/g,'""');return/[",\n]/.test(s)?'"'+s+'"':s;};
  const lines=[headers.map(escape).join(','),...state.products.map(p=>[
    p.name||'',p.category||'',
    Array.isArray(p.skin)?p.skin.join(', '):(p.skin||''),
    p.mlVal||'',p.mlUnit||'',
    p.price||0, p.priceMayoreo||0, p.cost||0, p.stock||0,
    p.isKorean?'Sí':'No',
    p.description||'',p.image||''
  ].map(escape).join(','))];
  const blob=new Blob(['\uFEFF'+lines.join('\r\n')],{type:'text/csv;charset=utf-8;'});
  const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='inventario-aploblossom-'+new Date().toISOString().slice(0,10)+'.csv';
  document.body.appendChild(a);a.click();document.body.removeChild(a);URL.revokeObjectURL(a.href);
  toast('Inventario exportado ✓');
};

window.exportCatalog = function(onlyInStock) {
  const prods=onlyInStock?state.products.filter(p=>(p.stock||0)>0):state.products;
  if(!prods.length){toast('Sin productos para exportar','err');return;}
  toast('Generando PDF...');
  const{jsPDF}=window.jspdf;const doc=new jsPDF({format:'a4',unit:'mm'});
  const clean=str=>(str||'').replace(/[\u{1F000}-\u{1FFFF}\u{2600}-\u{27FF}]/gu,'').replace(/\s+/g,' ').trim();
  const PW=210,PH=297,ML=12,MR=12,usableW=PW-ML-MR;
  const IMG_W=22,COL_IMG=ML,COL_NAME=ML+IMG_W+5,NAME_W=45,COL_DESC=COL_NAME+NAME_W+5,DESC_W=55,COL_PRICE=COL_DESC+DESC_W+5,COL_MAY=COL_PRICE+28;
  const drawHeader=()=>{doc.setFillColor(74,82,64);doc.rect(0,0,PW,18,'F');doc.setFont('helvetica','bold');doc.setFontSize(13);doc.setTextColor(245,240,232);doc.text('Aplo Blossom',ML,12);doc.setFont('helvetica','normal');doc.setFontSize(7);doc.setTextColor(184,149,90);doc.text(onlyInStock?'Productos en stock':'Catalogo completo',ML,16.5);doc.text(new Date().toLocaleDateString('es-MX',{month:'long',year:'numeric'}),PW-MR,16.5,{align:'right'});};
  const drawTableHeader=y=>{doc.setFillColor(220,213,196);doc.rect(ML,y,usableW,6.5,'F');doc.setFont('helvetica','bold');doc.setFontSize(7);doc.setTextColor(74,82,64);doc.text('Producto',COL_NAME,y+4.5);doc.text('Descripcion',COL_DESC,y+4.5);doc.text('Menudeo',COL_PRICE,y+4.5);doc.text('Mayoreo',COL_MAY,y+4.5);return y+9;};
  drawHeader();let y=drawTableHeader(22);let rowCount=0;
  const addRow=(p,imgData)=>{const IMG_H=22;const LINE_NAME=4.2;const nameClean=clean(p.name);const descClean=clean(p.description);const metaClean=clean([p.category,p.mlVal&&p.mlUnit!=='N/A'?p.mlVal+p.mlUnit:'',p.isKorean?'Coreano':''].filter(Boolean).join(' · '));doc.setFont('helvetica','bold');doc.setFontSize(8);const nameLines=doc.splitTextToSize(nameClean,NAME_W);doc.setFont('helvetica','normal');doc.setFontSize(7);const descLines=descClean?doc.splitTextToSize(descClean,DESC_W):[];const nameH=nameLines.length*LINE_NAME+(metaClean?4.5:0);const descH=descLines.length*3.9;const rowH=Math.max(IMG_H,nameH,descH)+8;if(y+rowH>PH-14){doc.addPage();drawHeader();y=drawTableHeader(22);rowCount=0;}if(rowCount%2===1){doc.setFillColor(250,247,242);doc.rect(ML,y,usableW,rowH,'F');}const imgY=y+(rowH-IMG_H)/2;doc.setFillColor(237,229,212);doc.setDrawColor(210,203,188);doc.rect(COL_IMG,imgY,IMG_W,IMG_H,'FD');if(imgData){try{doc.addImage(imgData,COL_IMG,imgY,IMG_W,IMG_H);}catch(e){}}let tx=y+5;doc.setFont('helvetica','bold');doc.setFontSize(8);doc.setTextColor(30,30,24);nameLines.forEach(l=>{doc.text(l,COL_NAME,tx);tx+=LINE_NAME;});if(metaClean){doc.setFont('helvetica','normal');doc.setFontSize(6.5);doc.setTextColor(110,110,90);doc.text(metaClean,COL_NAME,tx);}let dtx=y+5;doc.setFont('helvetica','normal');doc.setFontSize(7);doc.setTextColor(80,78,68);descLines.slice(0,9).forEach(l=>{doc.text(l,COL_DESC,dtx);dtx+=3.9;});
  doc.setFont('helvetica','bold');doc.setFontSize(9);doc.setTextColor(74,82,64);doc.text(fmtMoney(p.price),COL_PRICE,y+7);
  if(p.priceMayoreo){doc.setFont('helvetica','bold');doc.setFontSize(9);doc.setTextColor(122,98,48);doc.text(fmtMoney(p.priceMayoreo),COL_MAY,y+7);}
  doc.setDrawColor(222,214,200);doc.line(ML,y+rowH,PW-MR,y+rowH);y+=rowH;rowCount++;};

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

  Promise.all(prods.map(loadImg)).then(imgs=>{prods.forEach((p,i)=>addRow(p,imgs[i]));doc.setFont('helvetica','normal');doc.setFontSize(7);doc.setTextColor(160,155,140);doc.text(prods.length+' productos · Aplo Blossom',PW/2,PH-6,{align:'center'});doc.save('catalogo-aploblossom-'+(onlyInStock?'disponible':'completo')+'.pdf');toast('PDF descargado');});
};

// ── MODALES ───────────────────────────────
function showModal(id,html){let overlay=document.getElementById('overlay_'+id);if(!overlay){overlay=document.createElement('div');overlay.id='overlay_'+id;overlay.className='modal-overlay';document.body.appendChild(overlay);}overlay.innerHTML=`<div class="modal-box">${html}</div>`;overlay.style.display='flex';}
window.closeModal=function(id){const el=document.getElementById('overlay_'+id);if(el)el.style.display='none';};
function bindEvents(){}

// ── INITIAL RENDER ────────────────────────
renderTab();
