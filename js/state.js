// Estado compartido de toda la app — se llena solo, vía los listeners de Firestore
export const state = {
  products: [], quotes: [], sales: [], expenses: [],
  deposits: [], creditSales: [], pagosLibres: [], saldoBase: 0
};
export let lowStockThreshold = parseInt(localStorage.getItem('lowStockThreshold') || '5');