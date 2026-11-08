import test from 'node:test';
import assert from 'node:assert/strict';
import { STATUS_LIST, STATUS_ABERTOS, ETAPAS } from '../src/domain/status.js';
import { normalizeSerial } from '../src/domain/serial.js';
import { validateCliente, validateEquipamento, validateServico, findDuplicateEquip } from '../src/domain/validators.js';
import { calcMargem, totalAReceber } from '../src/domain/finance.js';
import { diasRestantes, precisaAtencao } from '../src/domain/prazo.js';
import { diffCampos, buildLogEntry } from '../src/domain/audit.js';

test('status: lista completa e etapas válidas', () => {
  assert.equal(STATUS_LIST.length, 10);
  assert.ok(STATUS_LIST.includes('No terceiro'));
  assert.ok(ETAPAS.every((e) => STATUS_LIST.includes(e)));
  assert.ok(!STATUS_ABERTOS.includes('Concluído'));
  assert.ok(STATUS_ABERTOS.includes('No terceiro'));
});

test('normalizeSerial padroniza maiúsculas e separadores', () => {
  assert.equal(normalizeSerial('abc-123 x.9'), 'ABC123X9');
  assert.equal(normalizeSerial(''), '');
  assert.equal(normalizeSerial(undefined), '');
});

test('findDuplicateEquip acha série igual digitada diferente no mesmo cliente', () => {
  const lista = [{ id: 'e1', clienteId: 'c1', nome: 'Dell', serie: 'abc-123' }];
  const dup = findDuplicateEquip(lista, { id: 'e2', clienteId: 'c1', nome: 'Outro nome', serie: 'ABC 123' });
  assert.equal(dup.id, 'e1');
});

test('findDuplicateEquip ignora clientes diferentes', () => {
  const lista = [{ id: 'e1', clienteId: 'c1', nome: 'Dell', serie: 'abc-123' }];
  assert.equal(findDuplicateEquip(lista, { id: 'e2', clienteId: 'c2', nome: 'Dell', serie: 'ABC123' }), null);
});

test('findDuplicateEquip sem série compara nome; nomes diferentes não duplicam', () => {
  const lista = [{ id: 'e1', clienteId: 'c1', nome: 'Acer Nitro', serie: '' }];
  assert.equal(findDuplicateEquip(lista, { id: 'e2', clienteId: 'c1', nome: ' acer  nitro ', serie: '' }).id, 'e1');
  assert.equal(findDuplicateEquip(lista, { id: 'e3', clienteId: 'c1', nome: 'Lenovo', serie: '' }), null);
});

test('findDuplicateEquip não acusa o próprio equipamento ao editar', () => {
  const lista = [{ id: 'e1', clienteId: 'c1', nome: 'Dell', serie: 'abc' }];
  assert.equal(findDuplicateEquip(lista, { id: 'e1', clienteId: 'c1', nome: 'Dell', serie: 'abc' }), null);
});

test('validateCliente exige nome', () => {
  assert.equal(validateCliente({ nome: '' }).ok, false);
  assert.equal(validateCliente({ nome: 'Stage' }).ok, true);
});

test('validateEquipamento exige nome, cliente e tipo válido', () => {
  assert.equal(validateEquipamento({ nome: 'X', clienteId: 'c1', tipo: 'informatica' }).ok, true);
  assert.equal(validateEquipamento({ nome: 'X', clienteId: 'c1', tipo: 'audio' }).ok, false);
  assert.equal(validateEquipamento({ nome: '', clienteId: 'c1', tipo: 'outros' }).ok, false);
});

test('validateServico rejeita status inválido e valor negativo', () => {
  const base = { clienteId: 'c1', equipamentoId: 'e1', relatoCliente: 'liga e desliga', dataEntrada: '2026-11-01', status: 'Recebido' };
  assert.equal(validateServico(base).ok, true);
  assert.equal(validateServico({ ...base, status: 'Inventado' }).ok, false);
  assert.equal(validateServico({ ...base, valorCobrado: -5 }).ok, false);
  assert.equal(validateServico({ ...base, relatoCliente: '' }).ok, false);
});

test('calcMargem', () => {
  assert.equal(calcMargem({ valorCobrado: 650, terceiro: { custo: 400 } }), 250);
  assert.equal(calcMargem({ valorCobrado: 650, terceiro: null }), null);
  assert.equal(calcMargem({ valorCobrado: 650, terceiro: {} }), null);
});

test('totalAReceber soma só concluídos e não pagos', () => {
  const s = [
    { status: 'Concluído', valorCobrado: 100, pago: true },
    { status: 'Concluído', valorCobrado: 300, pago: false },
    { status: 'Em andamento', valorCobrado: 999 },
  ];
  assert.equal(totalAReceber(s), 300);
});

test('diasRestantes do terceiro', () => {
  assert.equal(diasRestantes({ enviadoEm: '2026-10-04', prazoDias: 60 }, '2026-11-08'), 25);
  assert.equal(diasRestantes({ prazoDias: 60 }, '2026-11-08'), null);
  assert.ok(diasRestantes({ enviadoEm: '2026-01-01', prazoDias: 60 }, '2026-11-08') < 0);
});

test('precisaAtencao aponta o motivo certo', () => {
  const hoje = '2026-11-08';
  assert.equal(precisaAtencao({ status: 'No terceiro', terceiro: { enviadoEm: '2026-01-01', prazoDias: 60 } }, hoje).motivo, 'Prazo do terceiro estourado');
  assert.equal(precisaAtencao({ status: 'Em andamento', previsaoEntrega: '2026-11-01' }, hoje).motivo, 'Previsão de entrega vencida');
  assert.equal(precisaAtencao({ status: 'Concluído', valorCobrado: 100, pago: false }, hoje).motivo, 'Concluído e não pago');
  assert.equal(precisaAtencao({ status: 'Em andamento', previsaoEntrega: '2026-12-01' }, hoje), null);
});

test('diffCampos detecta campo aninhado alterado e ignora iguais', () => {
  const r = diffCampos({ a: 1, terceiro: { custo: 1 } }, { a: 1, terceiro: { custo: 2 } });
  assert.deepEqual(r, [{ campo: 'terceiro.custo', antes: 1, depois: 2 }]);
});

test('buildLogEntry monta a entrada com quem, quando e o que mudou', () => {
  const e = buildLogEntry({
    entidade: 'servicos', entidadeId: 'OS-0001', acao: 'editar',
    antes: { status: 'Recebido' }, depois: { status: 'Concluído' },
    usuario: { uid: 'u1', nome: 'Rafael' }, agora: '2026-11-08T10:00:00.000Z',
  });
  assert.equal(e.em, '2026-11-08T10:00:00.000Z');
  assert.deepEqual(e.por, { uid: 'u1', nome: 'Rafael' });
  assert.equal(e.entidadeId, 'OS-0001');
  assert.deepEqual(e.mudancas, [{ campo: 'status', antes: 'Recebido', depois: 'Concluído' }]);
  assert.ok(e.id);
});

test('buildLogEntry de exclusão não deixa undefined', () => {
  const e = buildLogEntry({ entidade: 'clientes', entidadeId: 'c1', acao: 'excluir', antes: { nome: 'X' }, depois: null, usuario: { uid: 'u', nome: 'R' }, agora: '2026-11-08T10:00:00.000Z' });
  assert.deepEqual(e.mudancas, [{ campo: 'nome', antes: 'X', depois: null }]);
});
