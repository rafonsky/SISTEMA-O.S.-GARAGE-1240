// Parte do navegador: busca os dados, monta o PDF e baixa (computador) ou compartilha (celular).
import { servicoById, equipById, clienteById } from '../data/store.js';
import { hojeStr } from '../domain/datas.js';
import { buildRelatorioModel } from './modelo.js';
import { renderRelatorioPDF } from './render.js';

async function carregarLogo() {
  try {
    const resp = await fetch('assets/logo-pdf.png');
    const blob = await resp.blob();
    return await new Promise((ok, falha) => {
      const leitor = new FileReader();
      leitor.onload = () => ok(leitor.result);
      leitor.onerror = falha;
      leitor.readAsDataURL(blob);
    });
  } catch {
    return undefined; // sem logo, o relatório usa o nome em texto
  }
}

export async function montarRelatorioPDF(servicoId) {
  const jsPDF = window.jspdf?.jsPDF;
  if (!jsPDF) throw new Error('A biblioteca de PDF ainda está carregando. Tente de novo em instantes.');
  const servico = servicoById(servicoId);
  if (!servico) throw new Error('Serviço não encontrado.');
  const modelo = buildRelatorioModel({
    servico,
    equipamento: equipById(servico.equipamentoId),
    cliente: clienteById(servico.clienteId),
    hoje: hojeStr(),
  });
  const doc = renderRelatorioPDF(modelo, { jsPDF, logoDataUrl: await carregarLogo() });
  return { doc, nome: `relatorio-${servico.id}.pdf` };
}

export async function gerarRelatorio(servicoId) {
  const { doc, nome } = await montarRelatorioPDF(servicoId);
  const celular = window.matchMedia?.('(pointer: coarse)').matches;
  if (celular && navigator.canShare) {
    const arquivo = new File([doc.output('blob')], nome, { type: 'application/pdf' });
    if (navigator.canShare({ files: [arquivo] })) {
      try {
        await navigator.share({ files: [arquivo], title: nome });
        return;
      } catch (e) {
        if (e.name === 'AbortError') return; // a pessoa fechou o menu de compartilhar
      }
    }
  }
  doc.save(nome);
}
