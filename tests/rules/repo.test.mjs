import test, { before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { initializeApp } from 'firebase/app';
import { getAuth, connectAuthEmulator, createUserWithEmailAndPassword } from 'firebase/auth';
import { getFirestore, connectFirestoreEmulator, doc, getDoc, getDocs, collection } from 'firebase/firestore';
import { createRepo } from '../../src/data/repo.js';

let env, db, repo, uid;

before(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-os-garage',
    firestore: { rules: readFileSync('firestore.rules', 'utf8'), host: '127.0.0.1', port: 8080 },
  });
  const app = initializeApp({ projectId: 'demo-os-garage', apiKey: 'fake' }, 'repo-test');
  const auth = getAuth(app);
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  const cred = await createUserWithEmailAndPassword(auth, `repo${Date.now()}@teste.com`, 'senha123');
  uid = cred.user.uid;
  db = getFirestore(app);
  connectFirestoreEmulator(db, '127.0.0.1', 8080);
  repo = createRepo({ db, getUsuario: () => ({ uid, nome: 'Rafael' }) });
});

after(async () => {
  await env.cleanup();
  process.exit(0);
});

beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    await ctx.firestore().doc(`usuarios/${uid}`).set({ nome: 'Rafael', role: 'admin' });
  });
});

const servicoBase = () => ({
  clienteId: 'c1', equipamentoId: 'e1', relatoCliente: 'liga e desliga',
  dataEntrada: '2026-11-08', status: 'Recebido',
});

const logs = async () => (await getDocs(collection(db, 'log'))).docs.map((d) => d.data());

test('serviço novo recebe OS-0001 e gera log "criar"', async () => {
  const salvo = await repo.saveServico(servicoBase());
  assert.equal(salvo.id, 'OS-0001');
  const [l] = await logs();
  assert.equal(l.acao, 'criar');
  assert.equal(l.entidadeId, 'OS-0001');
  assert.equal(l.por.nome, 'Rafael');
});

test('editar um campo gera log só com aquele campo', async () => {
  const salvo = await repo.saveServico(servicoBase());
  await repo.saveServico({ ...salvo, status: 'Concluído' });
  const editar = (await logs()).find((l) => l.acao === 'editar');
  assert.deepEqual(editar.mudancas, [{ campo: 'status', antes: 'Recebido', depois: 'Concluído' }]);
});

test('dois serviços novos ao mesmo tempo recebem números diferentes', async () => {
  const [a, b] = await Promise.all([repo.saveServico(servicoBase()), repo.saveServico(servicoBase())]);
  assert.notEqual(a.id, b.id);
  assert.deepEqual([a.id, b.id].sort(), ['OS-0001', 'OS-0002']);
});

test('serviço inválido é recusado com mensagem em português', async () => {
  await assert.rejects(repo.saveServico({ ...servicoBase(), relatoCliente: '' }), /relato/i);
});

test('não exclui equipamento que tem serviço vinculado', async () => {
  await repo.saveEquipamento({ id: 'e1', clienteId: 'c1', nome: 'Dell', tipo: 'informatica' });
  await repo.saveServico(servicoBase());
  await assert.rejects(repo.removeEquipamento('e1'), /servi[cç]o/i);
  assert.equal((await getDoc(doc(db, 'equipamentos/e1'))).exists(), true);
});

test('excluir serviço registra log "excluir" com o conteúdo anterior', async () => {
  const salvo = await repo.saveServico(servicoBase());
  await repo.removeServico(salvo.id);
  assert.equal((await getDoc(doc(db, `servicos/${salvo.id}`))).exists(), false);
  const ex = (await logs()).find((l) => l.acao === 'excluir');
  assert.equal(ex.entidadeId, salvo.id);
  assert.ok(ex.mudancas.some((m) => m.campo === 'status' && m.antes === 'Recebido' && m.depois === null));
});

test('FINAL: contador atrasado não sobrescreve uma O.S. que já existe', async () => {
  await env.withSecurityRulesDisabled(async (ctx) => {
    const d = ctx.firestore();
    await d.doc('servicos/OS-0001').set({ id: 'OS-0001', relatoCliente: 'ORIGINAL', status: 'Recebido' });
    await d.doc('config/counters').set({ nextOs: 0 });
  });
  const novo = await repo.saveServico(servicoBase());
  assert.equal(novo.id, 'OS-0002');
  const original = await getDoc(doc(db, 'servicos/OS-0001'));
  assert.equal(original.data().relatoCliente, 'ORIGINAL');
});
