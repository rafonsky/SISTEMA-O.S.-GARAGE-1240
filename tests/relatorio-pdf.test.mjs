import test from 'node:test';
import assert from 'node:assert/strict';
import { jsPDF } from 'jspdf';
import { buildRelatorioModel } from '../src/pdf/modelo.js';
import { renderRelatorioPDF } from '../src/pdf/render.js';

const base = {
  servico: {
    id: 'OS-0013', status: 'Concluído', relatoCliente: 'O Windows reiniciava em loop.', diagnostico: 'Memória instável com XMP.',
    acoes: ['Boot ajustado', 'Memórias testadas'], recomendacoes: ['Manter a memória em 3200 MHz'],
    dataInicio: '2026-11-05', dataConclusao: '2026-11-07', valorCobrado: 300, garantiaDias: 30,
  },
  equipamento: { nome: 'PC Gigabyte', tipo: 'informatica', specs: { cpu: 'i9-9900K', ram: '32 GB' } },
  cliente: { nome: 'Stage Audio Visual' },
  hoje: '2026-11-07',
};

test('relatório curto vira um PDF válido de uma página', () => {
  const doc = renderRelatorioPDF(buildRelatorioModel(base), { jsPDF });
  assert.equal(doc.getNumberOfPages(), 1);
  assert.equal(Buffer.from(doc.output('arraybuffer')).subarray(0, 5).toString(), '%PDF-');
});

test('relatório com muitas ações continua para a página seguinte', () => {
  const longo = { ...base, servico: { ...base.servico, acoes: Array.from({ length: 80 }, (_, i) => `Ação número ${i + 1} realizada com sucesso no equipamento`) } };
  const doc = renderRelatorioPDF(buildRelatorioModel(longo), { jsPDF });
  assert.ok(doc.getNumberOfPages() >= 2);
});

test('relatório sem valor, sem garantia e sem seções opcionais não quebra', () => {
  const minimo = { ...base, servico: { id: 'OS-0001', status: 'Recebido', relatoCliente: 'Não liga.', acoes: [], recomendacoes: [], dataEntrada: '2026-11-01' } };
  const doc = renderRelatorioPDF(buildRelatorioModel(minimo), { jsPDF });
  assert.equal(doc.getNumberOfPages(), 1);
});
