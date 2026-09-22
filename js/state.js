import { db } from './firebase.js';

export const state = {
  products: [], quotes: [], sales: [], expenses: [],
  deposits: [], creditSales: [], pagosLibres: [], saldoBase: 0
};
export let lowStockThreshold = parseInt(localStorage.getItem('lowStockThreshold') || '5');

// ══════════════════════════════════════════
// COSTO FIJO DE INSUMOS (global, editable desde Inventario)
// ══════════════════════════════════════════
export let costoInsumos = 0;
export function setCostoInsumos(v) { costoInsumos = v; }

// ══════════════════════════════════════════
// COSTO REAL DE UN KIT (suma de costos de sus componentes)
// Se calcula siempre en vivo a partir de los productos actuales,
// para que nunca quede desactualizado aunque cambie el costo
// de un producto individual después de armar el kit.
// ══════════════════════════════════════════
export function computeKitCost(kitItems) {
  return (kitItems || []).reduce((sum, item) => {
    const p = state.products.find(x => x.id === item.id);
    return sum + (p ? (p.cost || 0) * (item.qty || 0) : 0);
  }, 0);
}

db.collection('config').doc('costoInsumos').get().then(snap => {
  costoInsumos = snap.exists ? (snap.data().value || 0) : 0;
  window._renderCurrentTab?.();
});
