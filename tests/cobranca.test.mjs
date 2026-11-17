import test from 'node:test';
import assert from 'node:assert/strict';
import { aplicarCobranca, FORMAS_PAGAMENTO } from '../src/domain/cobranca.js';

const base = { id: 'OS-0001', status: 'Concluído', valorCobrado: null, pago: false, dataPagamento: '', formaPagamento: '' };

test('só salvar o valor: guarda o valor e deixa a O.S. a receber', () => {
  const r = aplicarCobranca(base, { valor: '150,50', pago: false }, '2026-11-17');
  assert.equal(r.ok, true);
  assert.equal(r.servico.valorCobrado, 150.5);
  assert.equal(r.servico.pago, false);
  assert.equal(r.servico.dataPagamento, '');
});

test('valor + pago: marca como pago com a data de hoje e a forma escolhida', () => {
  const r = aplicarCobranca(base, { valor: '200', pago: true, forma: 'PIX' }, '2026-11-17');
  assert.deepEqual([r.servico.valorCobrado, r.servico.pago, r.servico.dataPagamento, r.servico.formaPagamento], [200, true, '2026-11-17', 'PIX']);
});

test('pago sem informar a forma deixa a forma vazia', () => {
  const r = aplicarCobranca(base, { valor: '10', pago: true }, '2026-11-17');
  assert.equal(r.servico.formaPagamento, '');
});

test('valor vazio, negativo ou texto é recusado, com mensagem', () => {
  for (const valor of ['', '  ', '-5', 'abc', null]) {
    const r = aplicarCobranca(base, { valor, pago: true }, '2026-11-17');
    assert.equal(r.ok, false);
    assert.match(r.erro, /valor/i);
  }
});

test('valor zero é aceito (cortesia)', () => {
  assert.equal(aplicarCobranca(base, { valor: '0', pago: false }, '2026-11-17').servico.valorCobrado, 0);
});

test('forma fora da lista é recusada', () => {
  assert.equal(aplicarCobranca(base, { valor: '10', pago: true, forma: 'Fiado' }, '2026-11-17').ok, false);
  assert.ok(FORMAS_PAGAMENTO.includes('PIX'));
});

test('não altera o objeto original e preserva os outros campos', () => {
  const r = aplicarCobranca({ ...base, obs: 'x' }, { valor: '10', pago: false }, '2026-11-17');
  assert.equal(r.servico.obs, 'x');
  assert.equal(base.valorCobrado, null);
});
