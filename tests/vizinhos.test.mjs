import test from 'node:test';
import assert from 'node:assert/strict';
import { vizinhos } from '../src/domain/vizinhos.js';

const todas = [{ id: 'OS-0010' }, { id: 'OS-0002' }, { id: 'OS-0003' }];

test('sem fila, usa todas as O.S. em ordem numérica', () => {
  assert.deepEqual(vizinhos(todas, 'OS-0003'), { anterior: 'OS-0002', proxima: 'OS-0010' });
});

test('na primeira não há anterior; na última não há próxima', () => {
  assert.deepEqual(vizinhos(todas, 'OS-0002'), { anterior: null, proxima: 'OS-0003' });
  assert.deepEqual(vizinhos(todas, 'OS-0010'), { anterior: 'OS-0003', proxima: null });
});

test('com fila (vinda da Conferência), segue a ordem da fila', () => {
  assert.deepEqual(vizinhos(todas, 'OS-0010', ['OS-0010', 'OS-0003']), { anterior: null, proxima: 'OS-0003' });
});

test('fila que não contém a O.S. atual é ignorada', () => {
  assert.deepEqual(vizinhos(todas, 'OS-0003', ['OS-0099']), { anterior: 'OS-0002', proxima: 'OS-0010' });
});

test('fila ignora ids que não existem mais', () => {
  assert.deepEqual(vizinhos(todas, 'OS-0002', ['OS-0002', 'OS-0777', 'OS-0003']), { anterior: null, proxima: 'OS-0003' });
});
