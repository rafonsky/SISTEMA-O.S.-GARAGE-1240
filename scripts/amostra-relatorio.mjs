// Gera um relatório de exemplo (PC Gigabyte) para conferir o visual: node scripts/amostra-relatorio.mjs saida.pdf
import { readFileSync, writeFileSync } from 'node:fs';
import { jsPDF } from 'jspdf';
import { buildRelatorioModel } from '../src/pdf/modelo.js';
import { renderRelatorioPDF } from '../src/pdf/render.js';

const saida = process.argv[2] ?? 'amostra-relatorio.pdf';
const logoDataUrl = `data:image/png;base64,${readFileSync('assets/logo-pdf.png').toString('base64')}`;

const modelo = buildRelatorioModel({
  servico: {
    id: 'OS-0013', status: 'Concluído',
    relatoCliente: 'O Windows iniciava e reiniciava logo em seguida, caindo em loop no Reparo Automático (erro CRITICAL_PROCESS_DIED).',
    diagnostico: 'O XMP estava ativo a 3600 MHz / 1,344 V com 4 pentes, um cenário instável na Z390. O CSM (modo Legacy) estava ativado e a ordem de boot estava com o SSD Gigabyte em 1º lugar. chkdsk e sfc não encontraram problemas: SSD íntegro.',
    acoes: [
      'Boot #1 ajustado para Windows Boot Manager (Samsung 970 EVO Plus)',
      'CSM desativado (boot UEFI)',
      'Cada pente de memória testado individualmente: nenhum com defeito',
      'MemTest86 sem erros a 2666 MHz (4 passadas, 48/48 testes)',
      'XMP reconfigurado para 3200 MHz / 1,35 V e testado no MemTest86 sem erros',
      'SSD reorganizado: C: com 150 GB, partição de Recuperação recriada e nova partição Backup (E:) com cerca de 80 GB',
      'Nova imagem completa do sistema criada no Macrium Reflect na partição Backup',
    ],
    recomendacoes: [
      'Manter a memória em 3200 MHz. Não reativar o perfil XMP de 3600 MHz.',
      'Não apagar nem formatar a partição Backup do SSD Samsung, onde fica a imagem do sistema.',
      'Copiar a imagem também para o disco de 1 TB ou para um disco externo, para proteção contra falha do SSD.',
    ],
    dataInicio: '2026-11-05', dataConclusao: '2026-11-07', valorCobrado: 300, garantiaDias: 30,
  },
  equipamento: { nome: 'PC Gigabyte Z390 Aorus Ultra', tipo: 'informatica', specs: { cpu: 'Intel Core i9-9900K', ram: '32 GB DDR4 (4 × 8 GB XPG)', armazenamento: 'SSD Samsung 970 EVO Plus 250 GB + SSD Gigabyte 1 TB', gpu: 'GeForce RTX' } },
  cliente: { nome: 'Stage Audio Visual' },
  hoje: '2026-11-07',
});

const doc = renderRelatorioPDF(modelo, { jsPDF, logoDataUrl });
writeFileSync(saida, Buffer.from(doc.output('arraybuffer')));
console.log(`Gerado ${saida} (${doc.getNumberOfPages()} página(s))`);
