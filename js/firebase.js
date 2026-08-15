const firebaseConfig = {
  apiKey: "AIzaSyCSBO1WxMpDFakY-6zgygJAu6n6Hyp3W80",
  authDomain: "aplo-blossom.firebaseapp.com",
  projectId: "aplo-blossom",
  storageBucket: "aplo-blossom.firebasestorage.app",
  messagingSenderId: "636625295603",
  appId: "1:636625295603:web:5551ef6fb1790069017f86"
};
firebase.initializeApp(firebaseConfig);
export const db = firebase.firestore();

export async function addItem(col, data) {
  return await db.collection(col).add({...data, createdAt: firebase.firestore.FieldValue.serverTimestamp()});
}
export async function updateItem(col, id, data) { return await db.collection(col).doc(id).update(data); }
export async function deleteItem(col, id) { return await db.collection(col).doc(id).delete(); }
export function listenCol(col, cb) {
  return db.collection(col).onSnapshot(snap => cb(snap.docs.map(d=>({id:d.id,...d.data()}))));
}






