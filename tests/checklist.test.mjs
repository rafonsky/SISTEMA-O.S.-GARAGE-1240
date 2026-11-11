import test from 'node:test';
import assert from 'node:assert/strict';
import { itensPara, resumoChecklist, definirResposta, linkDaOs, enderecoSoDoComputador } from '../src/domain/checklist.js';

test('informática e outros equipamentos têm perguntas próprias, e cada pergunta tem id único', () => {
  const info = itensPara('informatica');
  const outros = itensPara('outros');
  assert.ok(info.some((i) => i.id === 'tela'));
  assert.ok(!outros.some((i) => i.id === 'tela'));
  assert.ok(info.some((i) => i.id === 'liga') && outros.some((i) => i.id === 'liga'));
  for (const lista of [info, outros]) {
    assert.equal(new Set(lista.map((i) => i.id)).size, lista.length);
    assert.ok(lista.every((i) => i.pergunta.trim().length > 0));
  }
});

test('ajustes do dono: sem cabo de força, controle remoto e cabos/acessórios; a senha tem campo para digitar', () => {
  const todos = [...itensPara('informatica'), ...itensPara('outros')].map((i) => i.id);
  for (const removido of ['cabo', 'controle', 'acessorios']) assert.ok(!todos.includes(removido), removido);
  assert.ok(todos.includes('fonte'));
  const senha = itensPara('informatica').find((i) => i.id === 'senha');
  assert.equal(senha.campo.nome, 'senhaAcesso');
  assert.ok(senha.campo.rotulo.length > 0);
  assert.equal(itensPara('informatica').filter((i) => i.campo).length, 1);
});

test('tipo desconhecido usa a lista de "outros"', () => {
  assert.deepEqual(itensPara('qualquer'), itensPara('outros'));
});

test('resumo: nada respondido = tudo falta; "não se aplica" conta como respondido', () => {
  const itens = itensPara('informatica');
  const vazio = resumoChecklist('informatica', {});
  assert.equal(vazio.total, itens.length);
  assert.equal(vazio.respondidos, 0);
  assert.equal(vazio.completo, false);
  assert.equal(vazio.faltam.length, itens.length);

  const tudo = Object.fromEntries(itens.map((i) => [i.id, 'na']));
  const cheio = resumoChecklist('informatica', tudo);
  assert.equal(cheio.completo, true);
  assert.equal(cheio.faltam.length, 0);
});

test('resumo ignora respostas inválidas e ids que não são mais perguntas', () => {
  const r = resumoChecklist('outros', { liga: 'talvez', fantasma: 'sim' });
  assert.equal(r.respondidos, 0);
});

test('resumo aceita serviço sem checklist (undefined/null)', () => {
  assert.equal(resumoChecklist('informatica', undefined).respondidos, 0);
  assert.equal(resumoChecklist('informatica', null).completo, false);
});

test('definirResposta não altera o original, troca a resposta e tocar de novo limpa', () => {
  const a = {};
  const b = definirResposta(a, 'liga', 'sim');
  assert.deepEqual(a, {});
  assert.deepEqual(b, { liga: 'sim' });
  assert.deepEqual(definirResposta(b, 'liga', 'nao'), { liga: 'nao' });
  assert.deepEqual(definirResposta(b, 'liga', 'sim'), {});
});

test('definirResposta recusa valor inválido', () => {
  assert.throws(() => definirResposta({}, 'liga', 'talvez'));
});

test('linkDaOs monta o endereço que o QR abre, sem query nem hash antigos', () => {
  assert.equal(
    linkDaOs({ origin: 'https://rafonsky.github.io', pathname: '/SISTEMA-O.S.-GARAGE-1240/' }, 'OS-0007'),
    'https://rafonsky.github.io/SISTEMA-O.S.-GARAGE-1240/#/servico/OS-0007',
  );
  assert.equal(linkDaOs({ origin: 'http://192.168.0.5:5173', pathname: '/' }, 'OS-0001'), 'http://192.168.0.5:5173/#/servico/OS-0001');
});

test('endereço de localhost só funciona no próprio computador', () => {
  assert.equal(enderecoSoDoComputador('localhost'), true);
  assert.equal(enderecoSoDoComputador('127.0.0.1'), true);
  assert.equal(enderecoSoDoComputador('192.168.0.5'), false);
  assert.equal(enderecoSoDoComputador('rafonsky.github.io'), false);
});
