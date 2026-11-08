// Exporta os dados ATUAIS do Firestore para backup/AAAA-MM-DD/ (pasta fora do git).
// Uso: node scripts/backup.mjs
import { mkdirSync, writeFileSync } from 'node:fs';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously } from 'firebase/auth';
import { getFirestore, collection, getDocs, doc, getDoc } from 'firebase/firestore';
import { firebaseConfig } from '../firebase-config.js';

const app = initializeApp(firebaseConfig);
await signInAnonymously(getAuth(app));
const db = getFirestore(app);

const dir = `backup/${new Date().toISOString().slice(0, 10)}`;
mkdirSync(dir, { recursive: true });

for (const nome of ['clientes', 'equipamentos', 'ordens', 'tecnicos']) {
  const snap = await getDocs(collection(db, nome));
  const dados = snap.docs.map((d) => d.data());
  writeFileSync(`${dir}/${nome}.json`, JSON.stringify(dados, null, 2));
  console.log(`${nome}: ${dados.length}`);
}
const auth = await getDoc(doc(db, 'config', 'auth'));
writeFileSync(`${dir}/config.json`, JSON.stringify(auth.exists() ? auth.data() : {}, null, 2));
console.log(`config/auth: ${auth.exists() ? 'ok' : 'vazio'}`);
console.log(`Backup salvo em ${dir}/`);
process.exit(0);
