import { state, lowStockThreshold, costoInsumos, setCostoInsumos } from './state.js';
import { fmtMoney, toast, showModal, icons, CATS, SKINS } from './utils.js';
import { updateItem, deleteItem, addItem, db } from './firebase.js';

// ══════════════════════════════════════════
// CLOUDFLARE R2 — subida de imágenes
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
        w = Math.round(w * scale); h = Math.round(h * scale);
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

export async function uploadToR2(file) {
  const compressed = await compressImage(file);
  const key = `products/${Date.now()}-${Math.random().toString(36).slice(2)}.jpg`;
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

// ══════════════════════════════════════════
// INVENTARIO — filtros y listado
// ══════════════════════════════════════════
let invFilter='Todos', invSearch='', invSkinFilter='', invMlVal='', invMlUnit='', invFilterActive=false;
let invKoreanOnly=false;
let editingProduct = null;

export function renderInventory() {
  return `
  <div class="card" style="padding:14px;margin-bottom:14px;background:var(--cream-dark);">
    <div style="font-size:11px;font-weight:600;text-transform:uppercase;color:var(--text-light);margin-bottom:8px;">
      Costo fijo de insumos (se suma al precio en Cotizar y Catálogo)
    </div>
    <div style="display:flex;gap:8px;align-items:center;">
      <input id="costoInsumosInput" type="number" min="0" value="${costoInsumos}" placeholder="0"
        style="flex:1;font-family:'Jost',sans-serif;font-size:14px;border:1.5px solid var(--cream-mid);border-radius:8px;padding:8px 12px;">
      <button class="btn btn-primary btn-sm" onclick="window._saveCostoInsumos()">Guardar</button>
    </div>
  </div>
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

export function renderInvList() {
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
  if(!invFilterActive && !invKoreanOnly) { el.innerHTML=`<div class="empty">${icons.pkg}<p>Selecciona una categoría o tipo de piel para ver productos</p></div>`; return; }
  if(invKoreanOnly && !invFilterActive) prods = allProds;

  el.innerHTML=(prods.length===0?`<div class="empty">${icons.pkg}<p>Sin productos</p></div>`:'')+
  prods.map(p=>`
  <div class="card product-card">
    <div class="product-img">${p.image?`<img src="${p.image}" alt="${p.name}">`:`<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;">${icons.pkg}</div>`}</div>
    <div class="product-info">
      <div class="product-name">${p.name}${p.isKit?` <span class="pill pill-warn" style="font-size:10px;padding:1px 7px;">Kit</span>`:''}${p.isKorean?` <span style="font-size:12px;" title="Producto coreano">🇰🇷</span>`:''}${p.isMini?` <span style="font-size:12px;" title="Skincare Mini">🧴</span>`:''}</div>
      <div class="product-meta">${p.category||''}${p.mlVal&&p.mlUnit!=='N/A'?' · '+p.mlVal+p.mlUnit:''}</div>
      <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
        <span class="product-price">${fmtMoney(p.price)}</span>
        ${p.priceMayoreo?`<span style="font-size:11px;color:#7a6230;font-weight:600;">May: ${fmtMoney(p.priceMayoreo)}</span>`:''}
        <span class="pill ${(p.stock||0)<=3?'pill-low':(p.stock||0)<=8?'pill-warn':'pill-ok'}">${p.stock||0} uds</span>
      </div>
      ${costoInsumos>0?`<div style="font-size:11px;color:var(--text-light);width:100%;">+ insumos: ${fmtMoney((p.price||0)+costoInsumos)}</div>`:''}
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

window._saveCostoInsumos = async function(){
  const val = +document.getElementById('costoInsumosInput').value || 0;
  await db.collection('config').doc('costoInsumos').set({value: val});
  setCostoInsumos(val);
  toast('Costo de insumos actualizado ✓');
  window._renderCurrentTab?.();
};

// ══════════════════════════════════════════
// MODAL DE PRODUCTO
// ══════════════════════════════════════════
window.openProductModal = function(id) {
  editingProduct = id?state.products.find(p=>p.id===id):null;
  const p = editingProduct||{};
  showModal('modalProduct',`
    <div class="modal-header"><div class="modal-title">${id?'Editar producto':'Nuevo producto'}</div><button class="modal-close" onclick="closeModal('modalProduct')">×</button></div>
    <label for="imgFileInput" class="img-upload" id="imgUploadLabel">
      ${p.image ? `<img src="${p.image}" style="width:100%;height:100%;object-fit:cover;">` : `<div style="display:flex;flex-direction:column;align-items:center;gap:8px;">${icons.camera}<span>Subir foto</span></div>`}
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
      <div style="font-size:11px;font-weight:600;letter-spacing:.5px;text-transform:uppercase;color:var(--text-light);margin-bottom:10px;">Precios</div>
      <div class="three-col">
        <div class="field" style="margin-bottom:0;"><label style="color:var(--olive);">Menudeo $</label><input id="pPrice" type="number" value="${p.price||''}" placeholder="0" style="border-color:var(--olive-pale);font-weight:600;color:var(--olive);"></div>
        <div class="field" style="margin-bottom:0;"><label style="color:#7a6230;">Mayoreo $</label><input id="pPriceMayoreo" type="number" value="${p.priceMayoreo||''}" placeholder="0" style="border-color:#c8a86a;font-weight:600;color:#7a6230;"></div>
        <div class="field" style="margin-bottom:0;"><label style="color:var(--text-light);">Costo $</label><input id="pCost" type="number" value="${p.cost||''}" placeholder="0"></div>
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
    <div class="field">
      <label>Descripción (una idea por renglón)</label>
      <textarea id="pDesc" placeholder="Escribe una línea, presiona Enter para pasar a la siguiente..."
        style="width:100%;height:130px;font-family:'Jost',sans-serif;font-size:14px;border:1.5px solid var(--cream-mid);border-radius:var(--radius-sm);padding:10px 14px;line-height:1.6;resize:none;white-space:pre-wrap;box-sizing:border-box;outline:none;"
      >${p.description||''}</textarea>
    </div>
    <div style="display:flex;align-items:center;gap:10px;padding:12px;background:var(--cream-dark);border-radius:var(--radius-sm);margin-bottom:10px;">
      <input type="checkbox" id="pIsKorean" ${p.isKorean?'checked':''} style="width:18px;height:18px;accent-color:var(--olive);cursor:pointer;">
      <label for="pIsKorean" style="cursor:pointer;font-size:14px;font-weight:500;color:var(--text);display:flex;align-items:center;gap:6px;">🇰🇷 Producto coreano</label>
    </div>
    <div style="display:flex;align-items:center;gap:10px;padding:12px;background:var(--cream-dark);border-radius:var(--radius-sm);margin-bottom:14px;">
      <input type="checkbox" id="pIsMini" ${p.isMini?'checked':''} style="width:18px;height:18px;accent-color:var(--olive);cursor:pointer;">
      <label for="pIsMini" style="cursor:pointer;font-size:14px;font-weight:500;color:var(--text);display:flex;align-items:center;gap:6px;">🧴 Skincare Mini (proveedor WhatsApp)</label>
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
    priceMayoreo:+document.getElementById('pPriceMayoreo').value||0,
    cost:+document.getElementById('pCost').value||0,
    stock:+document.getElementById('pStock').value||0,
    description:document.getElementById('pDesc').value,
    image:document.getElementById('pImgData').value||'',
    isKorean:document.getElementById('pIsKorean').checked,
    isMini:document.getElementById('pIsMini').checked
  };
  if(id){await updateItem('products',id,data);toast('Producto actualizado');}
  else{await addItem('products',data);toast('Producto agregado');}
  closeModal('modalProduct');
};

window.deleteProduct=async function(id){
  if(!confirm('¿Eliminar este producto?'))return;
  await deleteItem('products',id);toast('Producto eliminado');closeModal('modalProduct');
};

// ══════════════════════════════════════════
// KITS
// ══════════════════════════════════════════
window._kitItems=[];

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
    <div class="field"><label>Descripción</label>
      <textarea id="kitDesc" style="width:100%;height:90px;font-family:'Jost',sans-serif;font-size:14px;border:1.5px solid var(--cream-mid);border-radius:var(--radius-sm);padding:10px 14px;resize:none;box-sizing:border-box;">${k.description||''}</textarea>
    </div>
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
    <div style="background:var(--cream-dark);border-radius:var(--radius-sm);padding:12px;margin-bottom:14px;">
      <div style="font-size:12px;color:var(--text-light);margin-bottom:4px;">Precio individual sumado</div>
      <div id="kitPriceSum" style="font-family:'Playfair Display',serif;font-size:20px;color:var(--text-mid);">$0</div>
      <div class="two-col" style="margin-top:12px;">
        <div class="field" style="margin-bottom:0;"><label style="color:var(--olive);">Precio menudeo $</label><input id="kitPrice" type="number" value="${k.price||''}" placeholder="0" style="border-color:var(--olive-pale);font-weight:600;color:var(--olive);"></div>
        <div class="field" style="margin-bottom:0;"><label style="color:#7a6230;">Precio mayoreo $</label><input id="kitPriceMayoreo" type="number" value="${k.priceMayoreo||''}" placeholder="0" style="border-color:#c8a86a;font-weight:600;color:#7a6230;"></div>
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
window._kitSearchInput=function(val){const dd=document.getElementById('kitSearchDropdown');if(!dd)return;const regularProds=state.products.filter(p=>!p.isKit);const q=val.trim().toLowerCase();const filtered=q?regularProds.filter(p=>(p.name||'').toLowerCase().includes(q)):regularProds;if(!filtered.length){dd.innerHTML='<div style="padding:10px 14px;font-size:13px;color:var(--text-light);">Sin resultados</div>';dd.style.display='block';return;}dd.innerHTML=filtered.slice(0,20).map(p=>`<div onmousedown="window._addKitItem('${p.id}')" style="padding:9px 14px;cursor:pointer;font-size:13px;border-bottom:1px solid var(--cream-mid);display:flex;justify-content:space-between;"><span>${p.name}</span><span style="font-size:11px;color:var(--text-light);">${p.stock||0} uds</span></div>`).join('');dd.style.display='block';};
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
  const data={
    name,isKit:true,category:'Kits',
    skin:Array.from(document.querySelectorAll('#kitSkinChips .chip.active')).map(b=>b.textContent).filter(Boolean),
    description:document.getElementById('kitDesc').value,
    price:+document.getElementById('kitPrice').value||0,
    priceMayoreo:+document.getElementById('kitPriceMayoreo').value||0,
    stock:+document.getElementById('kitStock').value||0,cost:0,
    kitItems:[...window._kitItems],
    image:document.getElementById('kitImgData').value||''
  };
  if(id){await updateItem('products',id,data);toast('Kit actualizado');}
  else{await addItem('products',data);toast('Kit creado');}
  closeModal('modalKit');
};

// ══════════════════════════════════════════
// AJUSTAR STOCK
// ══════════════════════════════════════════
window.openStockModal=function(id){
  const p=state.products.find(x=>x.id===id);
  window._stockMode = '+';
  showModal('modalStock',`
    <div class="modal-header"><div class="modal-title">${p.name}</div><button class="modal-close" onclick="closeModal('modalStock')">×</button></div>
    <p style="color:var(--text-light);font-size:14px;margin-bottom:20px;">Stock actual: <strong style="color:var(--olive)">${p.stock||0}</strong> unidades</p>
    <div class="field">
      <label>Cantidad</label>
      <div style="display:flex;align-items:center;gap:8px;">
        <button type="button" onclick="window._setStockMode('-')" id="stockMinus" class="btn btn-outline btn-sm">−</button>
        <input id="stockDelta" type="number" min="0" placeholder="Cantidad" style="flex:1;text-align:center;">
        <button type="button" onclick="window._setStockMode('+')" id="stockPlus" class="btn btn-primary btn-sm">+</button>
      </div>
    </div>
    <button class="btn btn-primary btn-full" onclick="applyStock('${id}')">Actualizar stock</button>
  `);
};
window._setStockMode=function(mode){
  window._stockMode = mode;
  const minus=document.getElementById('stockMinus'), plus=document.getElementById('stockPlus');
  if(mode==='-'){minus.classList.add('btn-danger');minus.classList.remove('btn-outline');plus.classList.add('btn-outline');plus.classList.remove('btn-primary');}
  else{plus.classList.add('btn-primary');plus.classList.remove('btn-outline');minus.classList.add('btn-outline');minus.classList.remove('btn-danger');}
};
window.applyStock=async function(id){
  const raw = Math.abs(parseInt(document.getElementById('stockDelta').value) || 0);
  if(!raw){toast('Ingresa una cantidad','err');return;}
  const delta = (window._stockMode === '-') ? -raw : raw;
  const p=state.products.find(x=>x.id===id);
  const newStock=Math.max(0,(p.stock||0)+delta);
  await updateItem('products',id,{stock:newStock});
  toast(`Stock: ${delta>0?'+':''}${delta}`);
  closeModal('modalStock');
};

// ══════════════════════════════════════════
// STOCK BAJO
// ══════════════════════════════════════════
export function showLowStockModal() {
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
}
window.showLowStockModal = showLowStockModal;
