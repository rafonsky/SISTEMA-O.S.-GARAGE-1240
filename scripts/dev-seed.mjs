// Prepara os EMULADORES locais para desenvolvimento: cria um usuário de teste e carrega os dados
// do backup já migrados. Não toca no Firebase de verdade.
// Uso (com os emuladores rodando): node scripts/dev-seed.mjs
import { readFileSync, readdirSync } from 'node:fs';
import { initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { transformBackup } from '../src/migration/transform.js';

const EMAIL = 'dev@teste.com';
const SENHA = 'senha123';

const resp = await fetch('http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: EMAIL, password: SENHA, returnSecureToken: true }),
});
const corpo = await resp.json();
const uid = corpo.localId;
if (!uid) {
  console.log('Usuário de teste já existe; nada a fazer no Auth.');
}

const env = await initializeTestEnvironment({
  projectId: 'demo-os-garage',
  // Mantém as regras REAIS no emulador; o seed escreve com withSecurityRulesDisabled.
  firestore: { host: '127.0.0.1', port: 8080, rules: readFileSync('firestore.rules', 'utf8') },
});

let uidFinal = uid;
if (!uidFinal) {
  const login = await fetch('http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=fake', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password: SENHA, returnSecureToken: true }),
  });
  uidFinal = (await login.json()).localId;
}

const pasta = `backup/${readdirSync('backup').sort().at(-1)}`;
const ler = (n) => JSON.parse(readFileSync(`${pasta}/${n}.json`, 'utf8'));
const dados = transformBackup({ clientes: ler('clientes'), equipamentos: ler('equipamentos'), ordens: ler('ordens') });

await env.withSecurityRulesDisabled(async (ctx) => {
  const db = ctx.firestore();
  await db.doc(`usuarios/${uidFinal}`).set({ nome: 'Rafael (teste)', email: EMAIL, role: 'admin' });
  for (const [col, lista] of [['clientes', dados.clientes], ['equipamentos', dados.equipamentos], ['servicos', dados.servicos]]) {
    for (const d of lista) await db.doc(`${col}/${d.id}`).set(d);
  }
  await db.doc('config/counters').set({ nextOs: 21 });
});
console.log(`Pronto. Entre com ${EMAIL} / ${SENHA}. ${dados.clientes.length} clientes, ${dados.equipamentos.length} equipamentos, ${dados.servicos.length} serviços.`);
await env.cleanup();
process.exit(0);
