import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizarPapel, abaDaEtapa, abaInicial, filaDoPapel, ABAS } from '../src/domain/papeis.js';
import { GRUPOS, filtrarServicos } from '../src/domain/grupos.js';

test('papel: minúsculas, sem espaço; vazio ou desconhecido vira admin (vê tudo, nada é bloqueado)', () => {
  assert.equal(normalizarPapel(' Tecnico '), 'tecnico');
  assert.equal(normalizarPapel('RECEPCAO'), 'recepcao');
  assert.equal(normalizarPapel('admin'), 'admin');
  assert.equal(normalizarPapel(undefined), 'admin');
  assert.equal(normalizarPapel('chefe'), 'admin');
});

test('cada etapa do serviço pertence a uma aba da ficha', () => {
  assert.equal(abaDaEtapa('Recebido'), 'recepcao');
  assert.equal(abaDaEtapa('Em diagnóstico'), 'tecnico');
  assert.equal(abaDaEtapa('Em andamento'), 'tecnico');
  assert.equal(abaDaEtapa('No terceiro'), 'tecnico');
  assert.equal(abaDaEtapa('Aguardando aprovação'), 'orcamento');
  assert.equal(abaDaEtapa('Concluído'), 'faturamento');
  assert.equal(abaDaEtapa('Entregue ao cliente'), 'faturamento');
  assert.equal(abaDaEtapa('Sem conserto – devolvido ao cliente'), 'faturamento');
  assert.ok(ABAS.map((a) => a.id).includes('historico'));
});

test('aba em que a ficha abre: técnico e recepção abrem na sua; admin abre na etapa da O.S.', () => {
  assert.equal(abaInicial('tecnico', 'Recebido'), 'tecnico');
  assert.equal(abaInicial('recepcao', 'Concluído'), 'recepcao');
  assert.equal(abaInicial('admin', 'Aguardando aprovação'), 'orcamento');
  assert.equal(abaInicial('admin', 'Concluído'), 'faturamento');
});

const servicos = [
  { id: 'A', status: 'Recebido' },
  { id: 'B', status: 'Em diagnóstico' },
  { id: 'C', status: 'Aguardando aprovação' },
  { id: 'D', status: 'Em andamento' },
  { id: 'E', status: 'Concluído', valorCobrado: 100, pago: false },
  { id: 'F', status: 'Entregue ao cliente', valorCobrado: 200, pago: true },
  { id: 'G', status: 'No terceiro' },
];

test('fila de cada papel', () => {
  const ids = (p) => filaDoPapel(p, servicos).servicos.map((s) => s.id);
  assert.deepEqual(ids('tecnico'), ['B', 'D']);
  assert.deepEqual(ids('recepcao'), ['A', 'E']);
  assert.deepEqual(ids('admin'), ['C', 'E']);
  assert.ok(filaDoPapel('tecnico', servicos).titulo.length > 0);
});

test('grupos dos cartões do painel batem com a contagem do painel', () => {
  const g = (nome) => filtrarServicos(servicos, { grupo: nome }).map((s) => s.id);
  assert.deepEqual(g('em-andamento'), ['A', 'B', 'D']);
  assert.deepEqual(g('no-terceiro'), ['G']);
  assert.deepEqual(g('aguardando-aprovacao'), ['C']);
  assert.deepEqual(g('a-receber'), ['E']);
  assert.deepEqual(g('todos').length, servicos.length);
  assert.ok(Object.keys(GRUPOS).includes('a-receber'));
});

test('filtrarServicos também busca por texto no nome do cliente, equipamento ou número', () => {
  const ctx = {
    clientes: [{ id: 'c1', nome: 'Stage Audio' }],
    equipamentos: [{ id: 'e1', nome: 'Notebook Dell' }],
  };
  const lista = [
    { id: 'OS-0001', status: 'Recebido', clienteId: 'c1', equipamentoId: 'e1' },
    { id: 'OS-0002', status: 'Recebido', clienteId: 'x', equipamentoId: 'y' },
  ];
  assert.deepEqual(filtrarServicos(lista, { grupo: 'todos', q: 'dell' }, ctx).map((s) => s.id), ['OS-0001']);
  assert.deepEqual(filtrarServicos(lista, { grupo: 'todos', q: '0002' }, ctx).map((s) => s.id), ['OS-0002']);
});
