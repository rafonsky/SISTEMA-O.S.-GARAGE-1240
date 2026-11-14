// Desenha o relatório de serviço em PDF a partir do modelo (ver modelo.js).
// Não depende do navegador: recebe o construtor jsPDF e, opcionalmente, o logo como data URL.

const MARGEM = 16;
const LARGURA = 210;
const ALTURA = 297;
const DIREITA = LARGURA - MARGEM;
const RESERVA_RODAPE = 34;
const AMBAR = [224, 99, 26]; // laranja da marca
const CINZA = [110, 110, 110];

// Quebra o texto (em negrito, 11 pt) em linhas que cabem na largura da coluna.
export function linhasDaColuna(doc, valor, largura) {
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  return doc.splitTextToSize(String(valor), largura);
}

export function renderRelatorioPDF(modelo, { jsPDF, logoDataUrl } = {}) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  let y = 14;

  const garantirEspaco = (altura) => {
    if (y + altura > ALTURA - RESERVA_RODAPE) {
      doc.addPage();
      y = 18;
    }
  };
  const texto = (t, x, yy, { tamanho = 10, negrito = false, cor = [30, 30, 30], alinhar = 'left' } = {}) => {
    doc.setFont('helvetica', negrito ? 'bold' : 'normal');
    doc.setFontSize(tamanho);
    doc.setTextColor(...cor);
    doc.text(t, x, yy, { align: alinhar });
  };

  /* ---- cabeçalho ---- */
  if (logoDataUrl) {
    doc.addImage(logoDataUrl, 'PNG', MARGEM, 10, 52, (52 * 183) / 669);
  } else {
    texto('GARAGE 1240', MARGEM, 18, { tamanho: 18, negrito: true });
    texto('Informática e Audiovisual', MARGEM, 23, { tamanho: 8, cor: CINZA });
  }
  texto(modelo.titulo, DIREITA, 14, { tamanho: 9, cor: CINZA, alinhar: 'right' });
  texto(modelo.numero, DIREITA, 21, { tamanho: 14, negrito: true, alinhar: 'right' });
  texto(`Emitido em ${modelo.dataEmissao}`, DIREITA, 26, { tamanho: 8, cor: CINZA, alinhar: 'right' });
  doc.setDrawColor(...AMBAR);
  doc.setLineWidth(0.7);
  doc.line(MARGEM, 31, DIREITA, 31);
  y = 40;

  /* ---- cliente / período / status ---- */
  const colunas = [
    ['CLIENTE', modelo.cliente.nome, MARGEM, 72],
    ['PERÍODO DO SERVIÇO', modelo.periodo, MARGEM + 78, 51],
    ['STATUS', modelo.status, MARGEM + 135, DIREITA - (MARGEM + 135)],
  ];
  let maisLinhas = 1;
  for (const [rotulo, valor, x, largura] of colunas) {
    texto(rotulo, x, y, { tamanho: 7.5, cor: CINZA });
    const linhas = linhasDaColuna(doc, valor, largura);
    maisLinhas = Math.max(maisLinhas, linhas.length);
    linhas.forEach((l, i) => texto(l, x, y + 5.5 + i * 5, { tamanho: 11, negrito: true }));
  }
  y += 9 + maisLinhas * 5;

  /* ---- equipamento ---- */
  const linhasSpecs = modelo.equipamento.linhaSpecs ? doc.splitTextToSize(modelo.equipamento.linhaSpecs, DIREITA - MARGEM - 8) : [];
  const alturaCaixa = 13 + linhasSpecs.length * 4.6;
  doc.setFillColor(245, 243, 238);
  doc.roundedRect(MARGEM, y, DIREITA - MARGEM, alturaCaixa, 2, 2, 'F');
  texto('EQUIPAMENTO', MARGEM + 4, y + 5, { tamanho: 7.5, cor: CINZA });
  texto(modelo.equipamento.nome, MARGEM + 4, y + 10.5, { tamanho: 11.5, negrito: true });
  linhasSpecs.forEach((l, i) => texto(l, MARGEM + 4, y + 15.5 + i * 4.6, { tamanho: 9, cor: [70, 70, 70] }));
  y += alturaCaixa + 9;

  /* ---- seções ---- */
  for (const secao of modelo.secoes) {
    garantirEspaco(16);
    texto(secao.titulo, MARGEM, y, { tamanho: 11.5, negrito: true });
    doc.setDrawColor(225, 220, 208);
    doc.setLineWidth(0.3);
    doc.line(MARGEM, y + 1.8, DIREITA, y + 1.8);
    y += 8;
    if (secao.tipo === 'texto') {
      for (const l of doc.splitTextToSize(secao.conteudo, DIREITA - MARGEM)) {
        garantirEspaco(5);
        texto(l, MARGEM, y, { tamanho: 10 });
        y += 4.8;
      }
    } else {
      for (const item of secao.conteudo) {
        const linhas = doc.splitTextToSize(item, DIREITA - MARGEM - 6);
        garantirEspaco(linhas.length * 4.8);
        texto('•', MARGEM + 1, y, { tamanho: 10 });
        for (const l of linhas) {
          texto(l, MARGEM + 6, y, { tamanho: 10 });
          y += 4.8;
        }
        y += 0.8;
      }
    }
    y += 5;
  }

  /* ---- rodapé (última página) ---- */
  const topoRodape = ALTURA - 26;
  doc.setDrawColor(200, 200, 200);
  doc.setLineWidth(0.3);
  doc.line(MARGEM, topoRodape, DIREITA, topoRodape);
  let yr = topoRodape + 6;
  if (modelo.garantiaTexto) {
    texto(modelo.garantiaTexto, MARGEM, yr, { tamanho: 9, negrito: true });
    yr += 5;
  }
  texto(modelo.contato, MARGEM, yr, { tamanho: 8, cor: CINZA });
  if (modelo.valor) {
    texto('VALOR DO SERVIÇO', DIREITA, topoRodape + 5, { tamanho: 7.5, cor: CINZA, alinhar: 'right' });
    texto(modelo.valor, DIREITA, topoRodape + 12, { tamanho: 16, negrito: true, alinhar: 'right' });
  }
  return doc;
}
