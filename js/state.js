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

db.collection('config').doc('costoInsumos').get().then(snap => {
  costoInsumos = snap.exists ? (snap.data().value || 0) : 0;
  window._renderCurrentTab?.();
});
