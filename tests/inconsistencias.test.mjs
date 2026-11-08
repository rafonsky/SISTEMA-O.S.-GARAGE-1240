import test from 'node:test';
import assert from 'node:assert/strict';
import { findInconsistencias } from '../src/domain/inconsistencias.js';
import { dataValida } from '../src/domain/datas.js';

const limpo = () => ({
  clientes: [{ id: 'c1', nome: 'Stage' }],
  equipamentos: [{ id: 'e1', clienteId: 'c1', nome: 'Dell G15', tipo: 'informatica', serie: 'ABC1', serieNorm: 'ABC1' }],
  servicos: [{ id: 'OS-0001', clienteId: 'c1', equipamentoId: 'e1', status: 'Concluído', valorCobrado: 100, relatoCliente: 'x', dataEntrada: '2026-11-01', dataConclusao: '2026-11-02' }],
});

const tipos = (d) => findInconsistencias(d).map((i) => i.tipo);

test('dados limpos não geram nenhuma inconsistência', () => {
  assert.deepEqual(findInconsistencias(limpo()), []);
});

test('dataValida rejeita formato errado e dia inexistente', () => {
  assert.equal(dataValida('2026-11-07'), true);
  assert.equal(dataValida('2026-02-31'), false);
  assert.equal(dataValida('31/02/2026'), false);
});

test('serviço apontando para equipamento inexistente', () => {
  const d = limpo();
  d.servicos[0].equipamentoId = 'fantasma';
  assert.deepEqual(tipos(d), ['servico-sem-equipamento']);
});

test('equipamento apontando para cliente inexistente', () => {
  const d = limpo();
  d.equipamentos[0].clienteId = 'fantasma';
  d.servicos[0].clienteId = 'fantasma';
  assert.ok(tipos(d).includes('equipamento-sem-cliente'));
});

test('equipamentos duplicados por série ou, sem série, por nome', () => {
  const d = limpo();
  d.equipamentos.push({ id: 'e2', clienteId: 'c1', nome: 'Outro', tipo: 'outros', serie: 'abc-1', serieNorm: 'ABC1' });
  d.equipamentos.push({ id: 'e3', clienteId: 'c1', nome: 'Acer', tipo: 'outros', serie: '', serieNorm: '' });
  d.equipamentos.push({ id: 'e4', clienteId: 'c1', nome: ' acer ', tipo: 'outros', serie: '', serieNorm: '' });
  const duplicados = findInconsistencias(d).filter((i) => i.tipo === 'equipamento-duplicado').map((i) => i.id);
  assert.deepEqual(duplicados.sort(), ['e2', 'e4']);
});

test('serviço concluído sem valor cobrado', () => {
  const d = limpo();
  d.servicos[0].valorCobrado = null;
  assert.deepEqual(tipos(d), ['concluido-sem-valor']);
});

test('terceiro sem data de envio ou sem prazo', () => {
  const d = limpo();
  d.servicos[0].status = 'No terceiro';
  d.servicos[0].terceiro = { nome: 'Oficina X', enviadoEm: '', prazoDias: null };
  assert.deepEqual(tipos(d), ['terceiro-sem-prazo']);
});

test('data inválida em qualquer campo de data', () => {
  const d = limpo();
  d.servicos[0].previsaoEntrega = '2026-02-31';
  assert.deepEqual(tipos(d), ['data-invalida']);
});
