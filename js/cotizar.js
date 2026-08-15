import { state } from './state.js';
import { fmtMoney, toast, showModal, icons, CATS, SKINS } from './utils.js';
import { addItem, updateItem, deleteItem } from './firebase.js';

// ══════════════════════════════════════════
// COTIZAR — con modo Mayoreo / Menudeo
// ══════════════════════════════════════════
let quoteSearch='',quoteCatFilter='Todos',quoteCatActive=false,quoteSkinFilter='',quoteSkinActive=false,quoteMlVal='',quoteMlUnit='';
let quoteDiscount=0;
let quoteKoreanOnly=false;
let quotePriceMode='menudeo';   // 'menudeo' | 'mayoreo'

// Carrito — exportado con binding vivo: main.js lo usa para el guard
// del listener de 'quotes' (no pisar el carrito mientras se edita).
export let cartItems = [];

// Helper: precio según modo
function getPriceForMode(p) {
  if(quotePriceMode==='mayoreo') return p.priceMayoreo||p.price||0;
  return p.price||0;
}

export function renderQuote() {
  const subtotal=cartItems.reduce((s,i)=>s+(i.price*i.qty),0);
  const discountAmt=quoteDiscount>0?Math.min(quoteDiscount,subtotal):0;
  const total=subtotal-discountAmt;
  return `
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

export function renderQuoteGrid() {
  const grid=document.getElementById('quoteGrid');if(!grid)return;
  const skinChips=document.getElementById('quoteSkinChips');
  if(skinChips)skinChips.innerHTML=SKINS.map(s=>`<button class="chip${quoteSkinFilter===s&&quoteSkinActive?' active':''}" onclick="window._quoteSkinFilter('${s}')">${s}</button>`).join('');
  let prods=state.products.filter(p=>(p.name||'').toLowerCase().includes(quoteSearch.toLowerCase()));
  if(quoteCatActive&&quoteCatFilter!=='Todos')prods=prods.filter(p=>p.category===quoteCatFilter);
  if(quoteSkinActive){const specific=prods.filter(p=>Array.isArray(p.skin)?p.skin.includes(quoteSkinFilter):(p.skin||'')===quoteSkinFilter);const todoTipo=prods.filter(p=>Array.isArray(p.skin)?p.skin.includes('Todo tipo'):p.skin==='Todo tipo');prods=[...specific,...todoTipo];}
  if(quoteMlVal)prods=prods.filter(p=>String(p.mlVal)===String(quoteMlVal));
  if(quoteMlUnit)prods=prods.filter(p=>(p.mlUnit||'ml')===quoteMlUnit);
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
window._toggleQuoteKorean=()=>{quoteKoreanOnly=!quoteKoreanOnly;const c=document.getElementById('mainContent');c.innerHTML=renderQuote();renderQuoteGrid();};
window._setPriceMode=function(mode){
  if(mode===quotePriceMode)return;
  if(cartItems.length>0){if(!confirm('Cambiar el tipo de precio limpiará el carrito. ¿Continuar?'))return;cartItems=[];quoteDiscount=0;}
  quotePriceMode=mode;
  const c=document.getElementById('mainContent');c.innerHTML=renderQuote();renderQuoteGrid();
};

// Refresca solo la pestaña Cotizar. Simplificado respecto al original:
// solo se llama desde acciones que únicamente pueden dispararse mientras
// esta pestaña está visible (no requiere leer currentTab de main.js).
function _refreshQuoteTab(){
  const c=document.getElementById('mainContent');
  if(!c) return;
  c.innerHTML=renderQuote();
  renderQuoteGrid();
}

// ── BUG FIX: guardamos category, isKorean e isMini en cada item del carrito ──
window.addToCart=function(id){
  const p=state.products.find(x=>x.id===id);if(!p)return;
  const ex=cartItems.find(i=>i.id===id);
  const usePrice=getPriceForMode(p);
  if(ex)ex.qty++;
  else cartItems.push({
    id:p.id,
    name:p.name,
    price:usePrice,
    cost:p.cost||0,
    qty:1,
    priceMode:quotePriceMode,
    category:p.category||'',
    isKorean:p.isKorean||false,
    isMini:p.isMini||false
  });
  if((p.stock||0)===0)toast('Sin stock — cotización preventiva','err');
  _refreshQuoteTab();
};
window.removeCartItem=function(id){cartItems=cartItems.filter(x=>x.id!==id);_refreshQuoteTab();};
window.changeQty=function(id,d){const i=cartItems.find(x=>x.id===id);if(!i)return;i.qty+=d;if(i.qty<=0)cartItems=cartItems.filter(x=>x.id!==id);_refreshQuoteTab();};
window.clearCart=function(){cartItems=[];quoteDiscount=0;quoteSearch='';quoteCatActive=false;quoteSkinActive=false;quoteSkinFilter='';_refreshQuoteTab();};

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
  _refreshQuoteTab();
};

window.deleteQuote=async function(id){
  if(!confirm('¿Eliminar esta cotización?'))return;
  state.quotes=state.quotes.filter(q=>q.id!==id);
  _refreshQuoteTab();
  toast('Cotización eliminada');
  deleteItem('quotes',id).catch(()=>toast('Error','err'));
};

window.editQuote=async function(id){
  const q=state.quotes.find(x=>x.id===id);if(!q)return;
  cartItems=(q.items||[]).map(i=>({...i}));quoteDiscount=q.discount||0;quoteSearch='';quoteCatActive=false;quoteSkinActive=false;quoteSkinFilter='';
  if(q.priceMode)quotePriceMode=q.priceMode;
  state.quotes=state.quotes.filter(x=>x.id!==id);deleteItem('quotes',id);
  _refreshQuoteTab();
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