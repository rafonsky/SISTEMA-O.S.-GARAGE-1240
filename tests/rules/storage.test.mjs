import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';

let env;
const CAMINHO = 'servicos/OS-0001/foto.jpg';
const bytes = () => new Uint8Array([0xff, 0xd8, 0xff, 0xd9]);

before(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-os-garage',
    firestore: { rules: readFileSync('firestore.rules', 'utf8'), host: '127.0.0.1', port: 8080 },
    storage: { rules: readFileSync('storage.rules', 'utf8'), host: '127.0.0.1', port: 9199 },
  });
  await env.withSecurityRulesDisabled(async (ctx) => {
    await ctx.firestore().doc('usuarios/membro').set({ nome: 'Rafael', role: 'admin' });
    await ctx.storage().ref(CAMINHO).put(bytes(), { contentType: 'image/jpeg' });
  });
});

after(async () => {
  await env.cleanup();
  process.exit(0);
});

test('membro liberado lê foto', async () => {
  await assertSucceeds(env.authenticatedContext('membro').storage().ref(CAMINHO).getDownloadURL());
});

test('membro liberado envia foto', async () => {
  await assertSucceeds(env.authenticatedContext('membro').storage().ref('servicos/OS-0002/nova.jpg').put(bytes(), { contentType: 'image/jpeg' }));
});

test('membro liberado apaga foto', async () => {
  await assertSucceeds(env.authenticatedContext('membro').storage().ref('servicos/OS-0002/nova.jpg').delete());
});

test('usuário logado sem documento em usuarios não lê nem envia', async () => {
  const st = env.authenticatedContext('intruso').storage();
  await assertFails(st.ref(CAMINHO).getDownloadURL());
  await assertFails(st.ref('servicos/OS-0003/x.jpg').put(bytes(), { contentType: 'image/jpeg' }));
});

test('visitante sem login não lê nem envia', async () => {
  const st = env.unauthenticatedContext().storage();
  await assertFails(st.ref(CAMINHO).getDownloadURL());
  await assertFails(st.ref('servicos/OS-0003/x.jpg').put(bytes(), { contentType: 'image/jpeg' }));
});
