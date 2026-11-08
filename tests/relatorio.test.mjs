import test from 'node:test';
import assert from 'node:assert/strict';
import { buildRelatorioModel } from '../src/pdf/modelo.js';
import { periodoTexto, fmtData } from '../src/domain/datas.js';

const cliente = { id: 'c1', nome: 'Stage Audio Visual' };

const pc = {
  servico: {
    id: 'OS-0013', status: 'Concluído', relatoCliente: 'O Windows reiniciava em loop (CRITICAL_PROCESS_DIED).',
    diagnostico: 'Memória instável com XMP a 3600 MHz; CSM ativo.',
    acoes: ['Boot ajustado para o Windows Boot Manager', 'Memórias testadas, sem erros (MemTest86)'],
    recomendacoes: ['Manter a memória em 3200 MHz'],
    dataEntrada: '2026-11-05', dataInicio: '2026-11-05', dataConclusao: '2026-11-07', valorCobrado: 300, garantiaDias: 30, garantiaObs: '',
  },
  equipamento: { nome: 'PC Gigabyte Z390 Aorus Ultra', tipo: 'informatica', specs: { cpu: 'Intel Core i9-9900K', ram: '32 GB DDR4', armazenamento: 'SSD 250 GB + 1 TB', gpu: 'GeForce RTX' } },
  cliente,
  hoje: '2026-11-07',
};

const acer = {
  servico: {
    id: 'OS-0014', status: 'Concluído', relatoCliente: 'Atualizar o Windows e refazer a imagem limpa.', diagnostico: '',
    acoes: ['Windows atualizado', 'Imagem limpa criada no Macrium Reflect'], recomendacoes: [],
    dataEntrada: '2026-11-06', dataConclusao: '2026-11-06', valorCobrado: 100,
  },
  equipamento: { nome: 'Notebook Acer Nitro 01', tipo: 'informatica', specs: {} },
  cliente,
  hoje: '2026-11-07',
};

test('periodoTexto: intervalo no mesmo mês, data única e meses diferentes', () => {
  assert.equal(periodoTexto('2026-11-05', '2026-11-07'), '05 a 07/11/2026');
  assert.equal(periodoTexto('2026-11-06', '2026-11-06'), '06/11/2026');
  assert.equal(periodoTexto('', '2026-11-06'), '06/11/2026');
  assert.equal(periodoTexto('2026-10-28', '2026-11-02'), '28/10/2026 a 02/11/2026');
  assert.equal(periodoTexto('', ''), '—');
  assert.equal(fmtData('2026-11-07'), '07/11/2026');
});

test('relatório do PC: período, valor, equipamento e as quatro seções', () => {
  const m = buildRelatorioModel(pc);
  assert.equal(m.numero, 'OS-0013');
  assert.equal(m.periodo, '05 a 07/11/2026');
  assert.equal(m.valor, 'R$ 300,00');
  assert.equal(m.dataEmissao, '07/11/2026');
  assert.equal(m.equipamento.linhaSpecs, 'CPU: Intel Core i9-9900K · RAM: 32 GB DDR4 · Armaz.: SSD 250 GB + 1 TB · GPU: GeForce RTX');
  assert.deepEqual(m.secoes.map((s) => s.titulo), ['Problema', 'Diagnóstico', 'Ações realizadas', 'Recomendações']);
  assert.deepEqual(m.secoes[2].conteudo, pc.servico.acoes);
  assert.equal(m.garantiaTexto, 'Garantia: 30 dias');
});

test('relatório do notebook Acer: sem seções vazias e sem garantia', () => {
  const m = buildRelatorioModel(acer);
  assert.deepEqual(m.secoes.map((s) => s.titulo), ['Problema', 'Ações realizadas']);
  assert.equal(m.garantiaTexto, null);
  assert.equal(m.periodo, '06/11/2026');
  assert.equal(m.equipamento.linhaSpecs, '');
});

test('o relatório do cliente nunca contém custo, margem, terceiro nem observação interna', () => {
  const m = buildRelatorioModel({
    ...pc,
    servico: { ...pc.servico, valorCobrado: 650, obs: 'cliente reclama muito', terceiro: { nome: 'Oficina X', custo: 400, contato: '4199999' } },
  });
  const texto = JSON.stringify(m);
  assert.doesNotMatch(texto, /custo|margem|terceiro|Oficina X|4199999|reclama/i);
  assert.equal(m.valor, 'R$ 650,00');
});

test('sem valor cobrado o relatório não mostra valor', () => {
  const m = buildRelatorioModel({ ...acer, servico: { ...acer.servico, valorCobrado: null } });
  assert.equal(m.valor, null);
});

test('FINAL: status interno "No terceiro" aparece ao cliente como "Em andamento"', () => {
  const m = buildRelatorioModel({ ...pc, servico: { ...pc.servico, status: 'No terceiro' } });
  assert.equal(m.status, 'Em andamento');
  assert.doesNotMatch(JSON.stringify(m), /terceiro/i);
});
