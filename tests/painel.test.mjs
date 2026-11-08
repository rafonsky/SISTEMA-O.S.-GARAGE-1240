import test from 'node:test';
import assert from 'node:assert/strict';
import { resumoPainel, buscarGlobal } from '../src/domain/painel.js';

const dados = () => ({
  clientes: [{ id: 'c1', nome: 'Stage Audio Visual' }, { id: 'c2', nome: 'Grand Mercure' }],
  equipamentos: [
    { id: 'e1', clienteId: 'c1', nome: 'Acer Nitro', serie: 'abc-123', serieNorm: 'ABC123', patrimonio: '05' },
    { id: 'e2', clienteId: 'c2', nome: 'Placa de captura', serie: '', serieNorm: '', patrimonio: '' },
  ],
  servicos: [
    { id: 'OS-0001', clienteId: 'c1', equipamentoId: 'e1', status: 'Em andamento', relatoCliente: 'x' },
    { id: 'OS-0002', clienteId: 'c2', equipamentoId: 'e2', status: 'No terceiro', relatoCliente: 'y', terceiro: { enviadoEm: '2026-01-01', prazoDias: 60 } },
    { id: 'OS-0003', clienteId: 'c1', equipamentoId: 'e1', status: 'Aguardando aprovação', relatoCliente: 'z' },
    { id: 'OS-0004', clienteId: 'c1', equipamentoId: 'e1', status: 'Concluído', valorCobrado: 300, pago: false, relatoCliente: 'w' },
    { id: 'OS-0005', clienteId: 'c1', equipamentoId: 'e1', status: 'Concluído', valorCobrado: 100, pago: true, relatoCliente: 'v' },
  ],
});

test('resumoPainel conta cada grupo e soma o que falta receber', () => {
  const r = resumoPainel(dados().servicos, '2026-11-08');
  assert.equal(r.emAndamento, 1);
  assert.equal(r.noTerceiro, 1);
  assert.equal(r.aguardandoAprovacao, 1);
  assert.equal(r.aReceber, 300);
});

test('resumoPainel lista o que precisa de atenção, o mais urgente primeiro', () => {
  const r = resumoPainel(dados().servicos, '2026-11-08');
  assert.deepEqual(r.atencao.map((a) => a.servico.id), ['OS-0002', 'OS-0004']);
  assert.equal(r.atencao[0].motivo, 'Prazo do terceiro estourado');
  assert.equal(r.atencao[1].motivo, 'Concluído e não pago');
});

test('buscarGlobal acha equipamento pela série mesmo sem hífen', () => {
  const r = buscarGlobal(dados(), 'abc123');
  assert.equal(r[0].tipo, 'equipamento');
  assert.equal(r[0].id, 'e1');
});

test('buscarGlobal acha serviço pelo número e cliente pelo nome sem acento', () => {
  const d = dados();
  assert.equal(buscarGlobal(d, 'os-0002')[0].id, 'OS-0002');
  assert.ok(buscarGlobal(d, 'GRAND mercure').some((x) => x.tipo === 'cliente' && x.id === 'c2'));
});

test('buscarGlobal com texto vazio devolve lista vazia e respeita o limite', () => {
  assert.deepEqual(buscarGlobal(dados(), '  '), []);
  assert.equal(buscarGlobal(dados(), 'o', 2).length, 2);
});
