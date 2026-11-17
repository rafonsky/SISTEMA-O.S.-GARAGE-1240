import test from 'node:test';
import assert from 'node:assert/strict';
import { STATUS_LIST, STATUS_FECHADOS, STATUS_ABERTOS, ETAPAS, rotuloStatus, dataDeConclusao } from '../src/domain/status.js';
import { validateServico } from '../src/domain/validators.js';
import { filtrarServicos } from '../src/domain/grupos.js';
import { totalAReceber } from '../src/domain/finance.js';
import { findInconsistencias } from '../src/domain/inconsistencias.js';
import { abaDaEtapa } from '../src/domain/papeis.js';
import { statusParaCliente } from '../src/pdf/modelo.js';

const R = 'Recusado pelo cliente';
const os = (extra) => ({ id: 'OS-0001', clienteId: 'c1', equipamentoId: 'e1', relatoCliente: 'x', dataEntrada: '2026-11-01', status: R, ...extra });

test('"Recusado pelo cliente" é um status válido e fechado, fora do caminho normal de etapas', () => {
  assert.ok(STATUS_LIST.includes(R));
  assert.ok(STATUS_FECHADOS.includes(R));
  assert.ok(!STATUS_ABERTOS.includes(R));
  assert.ok(!ETAPAS.includes(R));
  assert.equal(validateServico(os()).ok, true);
  assert.equal(rotuloStatus(R), R);
});

test('aparece em Encerrados e não em Aguardando aprovação', () => {
  const lista = [os()];
  assert.equal(filtrarServicos(lista, { grupo: 'encerrados' }).length, 1);
  assert.equal(filtrarServicos(lista, { grupo: 'aguardando-aprovacao' }).length, 0);
});

test('sem valor, não entra em "A receber"; com taxa de diagnóstico não paga, entra', () => {
  assert.equal(filtrarServicos([os()], { grupo: 'a-receber' }).length, 0);
  const comTaxa = os({ valorCobrado: 50, pago: false });
  assert.equal(filtrarServicos([comTaxa], { grupo: 'a-receber' }).length, 1);
  assert.equal(totalAReceber([comTaxa]), 50);
  assert.equal(totalAReceber([{ ...comTaxa, pago: true }]), 0);
});

test('recusado sem valor não gera "concluído sem valor" na Conferência', () => {
  const d = { clientes: [{ id: 'c1', nome: 'A' }], equipamentos: [{ id: 'e1', clienteId: 'c1', nome: 'N', serie: 'S1' }], servicos: [os()] };
  assert.deepEqual(findInconsistencias(d), []);
});

test('abre na aba Faturamento e o PDF do cliente mostra o status como está', () => {
  assert.equal(abaDaEtapa(R), 'faturamento');
  assert.equal(statusParaCliente(R), R);
});

test('data de conclusão: preenchida ao recusar, sem sobrescrever a que já existe', () => {
  assert.equal(dataDeConclusao(R, '', '2026-11-17'), '2026-11-17');
  assert.equal(dataDeConclusao(R, '2026-11-10', '2026-11-17'), '2026-11-10');
  assert.equal(dataDeConclusao('Concluído', '', '2026-11-17'), '2026-11-17');
  assert.equal(dataDeConclusao('Entregue ao cliente', '', '2026-11-17'), '2026-11-17');
  assert.equal(dataDeConclusao('Em andamento', '', '2026-11-17'), '');
});
