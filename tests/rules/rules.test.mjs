import test, { before, after, beforeEach } from 'node:test';
import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';

let env;

before(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-os-garage',
    firestore: { rules: readFileSync('firestore.rules', 'utf8'), host: '127.0.0.1', port: 8080 },
  });
});

after(async () => {
  await env.cleanup();
});

beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await db.doc('usuarios/membro').set({ nome: 'Rafael', email: 'r@x.com', role: 'admin' });
    await db.doc('clientes/c1').set({ nome: 'Stage' });
    await db.doc('tecnicos/t1').set({ nome: 'Antigo', senha: 'segredo' });
    await db.doc('config/auth').set({ adminPassword: 'segredo' });
    await db.doc('log/l1').set({ entidade: 'servicos' });
  });
});

const membro = () => env.authenticatedContext('membro').firestore();
const logadoSemCadastro = () => env.authenticatedContext('intruso').firestore();
const anonimo = () => env.unauthenticatedContext().firestore();

test('visitante sem login não lê clientes', async () => {
  await assertFails(anonimo().doc('clientes/c1').get());
});

test('logado sem documento em usuarios não lê nem escreve serviços', async () => {
  await assertFails(logadoSemCadastro().doc('clientes/c1').get());
  await assertFails(logadoSemCadastro().doc('servicos/OS-0001').set({ status: 'Recebido' }));
});

test('membro lê e escreve serviços, clientes e equipamentos', async () => {
  const db = membro();
  await assertSucceeds(db.doc('clientes/c1').get());
  await assertSucceeds(db.doc('servicos/OS-0001').set({ status: 'Recebido' }));
  await assertSucceeds(db.doc('equipamentos/e1').set({ nome: 'Dell' }));
  await assertSucceeds(db.doc('config/counters').set({ nextOs: 1 }));
});

test('membro cria log, mas não altera nem apaga', async () => {
  const db = membro();
  await assertSucceeds(db.doc('log/l2').set({ entidade: 'servicos' }));
  await assertSucceeds(db.doc('log/l1').get());
  await assertFails(db.doc('log/l1').update({ entidade: 'outro' }));
  await assertFails(db.doc('log/l1').delete());
});

test('coleções legadas (tecnicos, config/auth, ordens) ficam fechadas até para membros', async () => {
  const db = membro();
  await assertFails(db.doc('tecnicos/t1').get());
  await assertFails(db.doc('config/auth').get());
  await assertFails(db.doc('ordens/OS-0001').get());
});

test('usuário lê só o próprio documento em usuarios e não escreve nele', async () => {
  const db = membro();
  await assertSucceeds(db.doc('usuarios/membro').get());
  await assertFails(db.doc('usuarios/outro').get());
  await assertFails(db.doc('usuarios/membro').set({ role: 'admin' }));
});
