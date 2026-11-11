import test from 'node:test';
import assert from 'node:assert/strict';
import { dimensoesReduzidas, caminhoDaFoto, nomeDoArquivo, removerFoto, MAX_FOTOS } from '../src/domain/fotos.js';

test('foto grande é reduzida mantendo a proporção; foto pequena não é ampliada', () => {
  assert.deepEqual(dimensoesReduzidas(4000, 3000, 1280), { largura: 1280, altura: 960 });
  assert.deepEqual(dimensoesReduzidas(3000, 4000, 1280), { largura: 960, altura: 1280 });
  assert.deepEqual(dimensoesReduzidas(800, 600, 1280), { largura: 800, altura: 600 });
  assert.deepEqual(dimensoesReduzidas(1280, 1280, 1280), { largura: 1280, altura: 1280 });
});

test('dimensões inválidas viram 1×1 em vez de quebrar', () => {
  assert.deepEqual(dimensoesReduzidas(0, 0, 1280), { largura: 1, altura: 1 });
  assert.deepEqual(dimensoesReduzidas(NaN, 100, 1280), { largura: 1, altura: 1 });
});

test('caminho da foto fica dentro da pasta da O.S. e é único', () => {
  const a = caminhoDaFoto('OS-0007', 1700000000000, 'abc123');
  assert.equal(a, 'servicos/OS-0007/1700000000000-abc123.jpg');
  assert.notEqual(a, caminhoDaFoto('OS-0007', 1700000000001, 'abc123'));
});

test('nome do arquivo some com caracteres perigosos e tem limite', () => {
  assert.equal(nomeDoArquivo('IMG 2026/11:07.jpg'), 'IMG 2026-11-07.jpg');
  assert.equal(nomeDoArquivo(''), 'foto');
  assert.ok(nomeDoArquivo('a'.repeat(300)).length <= 80);
});

test('removerFoto tira só a escolhida e não altera a lista original', () => {
  const lista = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
  assert.deepEqual(removerFoto(lista, 'b'), [{ id: 'a' }, { id: 'c' }]);
  assert.equal(lista.length, 3);
  assert.deepEqual(removerFoto(undefined, 'x'), []);
});

test('há um limite de fotos por O.S.', () => {
  assert.ok(MAX_FOTOS >= 10);
});
