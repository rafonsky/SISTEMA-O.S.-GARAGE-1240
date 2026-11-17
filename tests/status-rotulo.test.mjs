import test from 'node:test';
import assert from 'node:assert/strict';
import { rotuloStatus, STATUS_LIST } from '../src/domain/status.js';
import { statusParaCliente } from '../src/pdf/modelo.js';

test('"Concluído" aparece como "Pronto para retirada"; o valor guardado não muda', () => {
  assert.equal(rotuloStatus('Concluído'), 'Pronto para retirada');
  assert.ok(STATUS_LIST.includes('Concluído'));
  assert.ok(!STATUS_LIST.includes('Pronto para retirada'));
});

test('os demais status mantêm o próprio nome', () => {
  for (const s of STATUS_LIST.filter((x) => x !== 'Concluído')) assert.equal(rotuloStatus(s), s);
  assert.equal(rotuloStatus('qualquer coisa'), 'qualquer coisa');
});

test('o PDF do cliente também mostra "Pronto para retirada"', () => {
  assert.equal(statusParaCliente('Concluído'), 'Pronto para retirada');
  assert.equal(statusParaCliente('No terceiro'), 'Em andamento');
});
