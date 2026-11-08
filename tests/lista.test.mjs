import test from 'node:test';
import assert from 'node:assert/strict';
import { upsertLista } from '../src/domain/lista.js';

test('upsertLista acrescenta o novo e substitui o existente pelo id', () => {
  const lista = [{ id: 'a', v: 1 }, { id: 'b', v: 1 }];
  assert.deepEqual(upsertLista(lista, { id: 'c', v: 9 }).map((x) => x.id), ['a', 'b', 'c']);
  assert.deepEqual(upsertLista(lista, { id: 'a', v: 2 }), [{ id: 'b', v: 1 }, { id: 'a', v: 2 }]);
  assert.equal(lista.length, 2); // não altera a original
});
