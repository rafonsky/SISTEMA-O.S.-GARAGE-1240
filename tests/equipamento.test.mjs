import test from 'node:test';
import assert from 'node:assert/strict';
import { specsLinha, rotuloTipo } from '../src/domain/equipamento.js';

test('specsLinha junta as especificações preenchidas de um equipamento de informática', () => {
  const e = { tipo: 'informatica', specs: { cpu: 'i9-9900K', ram: '32GB', armazenamento: 'SSD 1TB', gpu: '', tela: '', so: 'Windows 11', licenca: 'Digital' } };
  assert.equal(specsLinha(e), 'CPU: i9-9900K · RAM: 32GB · Armaz.: SSD 1TB · SO: Windows 11');
});

test('specsLinha devolve vazio para tipo "outros" ou sem specs', () => {
  assert.equal(specsLinha({ tipo: 'outros', specs: { cpu: 'x' } }), '');
  assert.equal(specsLinha({ tipo: 'informatica' }), '');
  assert.equal(specsLinha(null), '');
});

test('rotuloTipo traduz o tipo para o texto da tela', () => {
  assert.equal(rotuloTipo('informatica'), 'Informática');
  assert.equal(rotuloTipo('outros'), 'Outros');
  assert.equal(rotuloTipo('qualquer'), 'Outros');
});
