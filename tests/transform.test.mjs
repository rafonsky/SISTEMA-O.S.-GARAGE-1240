import test from 'node:test';
import assert from 'node:assert/strict';
import { transformBackup } from '../src/migration/transform.js';

const base = () => ({
  clientes: [{ id: 'c1', nome: 'Stage', pin: '2026', telefone: '', email: '', documento: '', endereco: '' }],
  equipamentos: [
    { id: 'e1', clienteId: 'c1', nome: 'Dell G15', tipo: 'Notebook', patrimonio: '02', cpu: 'i7', ram: '16GB', armazenamento: 'SSD 512', gpu: 'RTX', tela: '15', so: 'Win 11', licenca: 'Digital', acessorios: '', obs: '', marca: '', modelo: '' },
    { id: 'e2', clienteId: 'c1', nome: ' dell  g15 ', tipo: 'Notebook', patrimonio: '02' },
    { id: 'e3', clienteId: 'c1', nome: 'Alienware - aurora', tipo: 'Desktop', patrimonio: '' },
    { id: 'e4', clienteId: 'c1', nome: 'Alienware - aurora', tipo: 'Desktop', patrimonio: '' },
    { id: 'e5', clienteId: 'c1', nome: 'Observação: os desktops sem número...', tipo: 'Notebook', patrimonio: '' },
    { id: 'e6', clienteId: 'c1', nome: 'Rafael / Eduardo  —  (41) 9131-2064  —  garage1240.oficial@gmail.com', tipo: 'Outro', patrimonio: '' },
    { id: 'e7', clienteId: 'c1', nome: 'Del G15 (teste)', tipo: 'Periférico', patrimonio: '100' },
    { id: 'e8', clienteId: 'c1', nome: 'Acer i3', tipo: 'Notebook', patrimonio: 's/n' },
  ],
  ordens: [
    { id: 'OS-0001', clienteId: 'c1', equipamentoId: 'e2', status: 'Entregue ao cliente', defeitoRelatado: 'Formatar', diagnosticoTecnico: 'Formatado', valorOrcamento: 'R$ 150,00', dataEntrada: '', dataConclusao: '2026-07-25', historico: [{ data: '2026-07-25', status: 'Entregue ao cliente', texto: 'ok' }] },
    { id: 'OS-0002', clienteId: 'c1', equipamentoId: 'e3', status: 'Aguardando aprovação', defeito: 'não liga', valorOrcamento: '100', dataEntrada: '2026-07-24' },
    { id: 'OS-0003', clienteId: 'c1', equipamentoId: 'nao-existe', status: 'Entregue ao cliente', defeitoRelatado: 'x', valorOrcamento: '' },
    { id: 'OS-0004', clienteId: 'c1', equipamentoId: 'e4', status: 'Sem conserto – peças aproveitadas', defeitoRelatado: '', dataEntrada: '31/02/2026', dataConclusao: '2026-08-06', previsaoEntrega: '2026-07-27' },
  ],
});

const get = (r, tipo) => r.pendencias.filter((p) => p.tipo === tipo);

test('remove o PIN dos clientes', () => {
  const r = transformBackup(base());
  assert.equal(r.clientes.length, 1);
  assert.ok(!('pin' in r.clientes[0]));
});

test('equipamento: specs aninhadas, tipo traduzido e série vazia', () => {
  const e = transformBackup(base()).equipamentos.find((x) => x.id === 'e1');
  assert.deepEqual(e.specs, { cpu: 'i7', ram: '16GB', armazenamento: 'SSD 512', gpu: 'RTX', tela: '15', so: 'Win 11', licenca: 'Digital' });
  assert.equal(e.tipo, 'informatica');
  assert.equal(e.serie, '');
  assert.equal(e.serieNorm, '');
});

test('tipos Desktop e Periférico: Desktop vira informatica, Periférico vira outros', () => {
  const r = transformBackup(base());
  assert.equal(r.equipamentos.find((x) => x.id === 'e3').tipo, 'informatica');
  assert.equal(r.equipamentos.find((x) => x.id === 'e7').tipo, 'outros');
});

test('linhas de planilha viram pendência e não entram como equipamento', () => {
  const r = transformBackup(base());
  assert.ok(!r.equipamentos.some((x) => x.id === 'e5' || x.id === 'e6'));
  assert.equal(get(r, 'linha-lixo').length, 2);
});

test('mesmo cliente, nome e patrimônio preenchido: junta e reaponta a O.S.', () => {
  const r = transformBackup(base());
  assert.ok(!r.equipamentos.some((x) => x.id === 'e2'));
  assert.equal(r.servicos.find((s) => s.id === 'OS-0001').equipamentoId, 'e1');
});

test('nomes iguais sem patrimônio NÃO são juntados, apenas sinalizados', () => {
  const r = transformBackup(base());
  assert.ok(r.equipamentos.some((x) => x.id === 'e3'));
  assert.ok(r.equipamentos.some((x) => x.id === 'e4'));
  assert.ok(get(r, 'possivel-duplicado').length >= 1);
});

test('item com "teste" no nome é migrado mas sinalizado', () => {
  const r = transformBackup(base());
  assert.ok(r.equipamentos.some((x) => x.id === 'e7'));
  assert.equal(get(r, 'possivel-teste').some((p) => p.id === 'e7'), true);
});

test('patrimônio "s/n" vira vazio', () => {
  assert.equal(transformBackup(base()).equipamentos.find((x) => x.id === 'e8').patrimonio, '');
});

test('valor do orçamento vira número', () => {
  const r = transformBackup(base());
  assert.equal(r.servicos.find((s) => s.id === 'OS-0001').valorCobrado, 150);
  assert.equal(r.servicos.find((s) => s.id === 'OS-0002').valorCobrado, 100);
});

test('ordem sem equipamento não entra e vira pendência', () => {
  const r = transformBackup(base());
  assert.ok(!r.servicos.some((s) => s.id === 'OS-0003'));
  assert.equal(get(r, 'servico-sem-equipamento')[0].id, 'OS-0003');
});

test('data inválida vira pendência mas o serviço é migrado; entrada vazia usa a conclusão', () => {
  const r = transformBackup(base());
  const s4 = r.servicos.find((s) => s.id === 'OS-0004');
  assert.ok(s4);
  assert.equal(get(r, 'data-invalida').some((p) => p.id === 'OS-0004'), true);
  assert.equal(r.servicos.find((s) => s.id === 'OS-0001').dataEntrada, '2026-07-25');
});

test('campo "defeito" antigo vira relatoCliente; vazio vira texto padrão com pendência', () => {
  const r = transformBackup(base());
  assert.equal(r.servicos.find((s) => s.id === 'OS-0002').relatoCliente, 'não liga');
  assert.equal(r.servicos.find((s) => s.id === 'OS-0004').relatoCliente, '(não informado)');
  assert.equal(get(r, 'relato-vazio').some((p) => p.id === 'OS-0004'), true);
});

test('novos campos do serviço têm valor padrão e o histórico é preservado', () => {
  const s = transformBackup(base()).servicos.find((x) => x.id === 'OS-0001');
  assert.deepEqual(s.acoes, []);
  assert.deepEqual(s.recomendacoes, []);
  assert.equal(s.terceiro, null);
  assert.equal(s.pago, false);
  assert.equal(s.diagnostico, 'Formatado');
  assert.equal(s.historico.length, 1);
});
