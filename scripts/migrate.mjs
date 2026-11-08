// Migra o backup antigo para o esquema novo.
// Ensaio (não escreve nada):  node scripts/migrate.mjs [pasta-do-backup]
// Aplicar no Firestore:       OS_EMAIL=... OS_SENHA=... node scripts/migrate.mjs [pasta] --aplicar
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { transformBackup } from '../src/migration/transform.js';
import { buildLogEntry } from '../src/domain/audit.js';

const args = process.argv.slice(2);
const aplicar = args.includes('--aplicar');
const pastaArg = args.find((a) => !a.startsWith('--'));
const pasta = pastaArg ?? `backup/${readdirSync('backup').sort().at(-1)}`;

const ler = (nome) => JSON.parse(readFileSync(`${pasta}/${nome}.json`, 'utf8'));
const resultado = transformBackup({ clientes: ler('clientes'), equipamentos: ler('equipamentos'), ordens: ler('ordens') });

writeFileSync(`${pasta}/pendencias.json`, JSON.stringify(resultado.pendencias, null, 2));
const porTipo = resultado.pendencias.reduce((a, p) => ((a[p.tipo] = (a[p.tipo] ?? 0) + 1), a), {});
console.log(`Origem: ${pasta}`);
console.log(`Clientes: ${resultado.clientes.length} · Equipamentos: ${resultado.equipamentos.length} · Serviços: ${resultado.servicos.length}`);
console.log('Pendências:', porTipo, `(detalhes em ${pasta}/pendencias.json)`);

if (!aplicar) {
  console.log('\nEnsaio concluído. Nada foi escrito no Firestore. Use --aplicar para gravar.');
  process.exit(0);
}

const { initializeApp } = await import('firebase/app');
const { getAuth, signInWithEmailAndPassword } = await import('firebase/auth');
const { getFirestore, writeBatch, doc } = await import('firebase/firestore');
const { firebaseConfig } = await import('../firebase-config.js');

const app = initializeApp(firebaseConfig);
const cred = await signInWithEmailAndPassword(getAuth(app), process.env.OS_EMAIL, process.env.OS_SENHA);
const db = getFirestore(app);
const usuario = { uid: cred.user.uid, nome: 'Migração v2.0.0' };
const agora = new Date().toISOString();

const itens = [
  ...resultado.clientes.map((d) => ['clientes', d]),
  ...resultado.equipamentos.map((d) => ['equipamentos', d]),
  ...resultado.servicos.map((d) => ['servicos', d]),
];
for (let i = 0; i < itens.length; i += 200) {
  const batch = writeBatch(db);
  for (const [colecao, dado] of itens.slice(i, i + 200)) {
    batch.set(doc(db, colecao, dado.id), dado);
    const log = buildLogEntry({ entidade: colecao, entidadeId: dado.id, acao: 'migrar', antes: null, depois: dado, usuario, agora });
    batch.set(doc(db, 'log', log.id), log);
  }
  await batch.commit();
}
// O próximo número de O.S. continua depois do maior já usado.
const maior = Math.max(0, ...resultado.servicos.map((s) => parseInt(s.id.replace(/\D/g, ''), 10) || 0));
const contador = writeBatch(db);
contador.set(doc(db, 'config', 'counters'), { nextOs: maior }, { merge: true });
await contador.commit();
console.log(`Gravados ${itens.length} documentos (e um log para cada). Próxima O.S.: OS-${String(maior + 1).padStart(4, '0')}.`);
process.exit(0);
