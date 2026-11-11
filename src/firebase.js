import { initializeApp } from 'firebase/app';
import { getAuth, connectAuthEmulator } from 'firebase/auth';
import { getFirestore, connectFirestoreEmulator } from 'firebase/firestore';
import { getStorage, connectStorageEmulator } from 'firebase/storage';
import { firebaseConfig } from '../firebase-config.js';

// Modo de desenvolvimento: abrir http://localhost:PORTA/?emulador usa os emuladores locais
// (nenhum dado real é tocado). Em qualquer outro endereço, usa o Firebase de verdade.
const local = ['localhost', '127.0.0.1'].includes(location.hostname);
export const usandoEmulador = local && new URLSearchParams(location.search).has('emulador');

const app = initializeApp(usandoEmulador ? { ...firebaseConfig, projectId: 'demo-os-garage', storageBucket: 'demo-os-garage.appspot.com' } : firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);

if (usandoEmulador) {
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  connectFirestoreEmulator(db, '127.0.0.1', 8080);
  connectStorageEmulator(storage, '127.0.0.1', 9199);
}
