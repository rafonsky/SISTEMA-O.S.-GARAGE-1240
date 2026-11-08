// Monta o CONTEÚDO do relatório que vai para o cliente. Função pura.
// Regra: nada interno entra aqui (custo do terceiro, margem, observação interna).
import { fmtData, periodoTexto } from '../domain/datas.js';
import { specsLinha } from '../domain/equipamento.js';

export const CONTATO = 'Rafael / Eduardo · (41) 9131-2064 · garage1240.oficial@gmail.com';

const temValor = (v) => v !== null && v !== undefined && v !== '' && Number.isFinite(Number(v));
const moeda = (v) => Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }).replace(/ /g, ' ');

export function buildRelatorioModel({ servico: s, equipamento, cliente, hoje }) {
  const secoes = [{ titulo: 'Problema', tipo: 'texto', conteudo: s.relatoCliente }];
  if (s.diagnostico) secoes.push({ titulo: 'Diagnóstico', tipo: 'texto', conteudo: s.diagnostico });
  if (s.acoes?.length) secoes.push({ titulo: 'Ações realizadas', tipo: 'lista', conteudo: [...s.acoes] });
  if (s.recomendacoes?.length) secoes.push({ titulo: 'Recomendações', tipo: 'lista', conteudo: [...s.recomendacoes] });

  let garantiaTexto = null;
  if (Number(s.garantiaDias) > 0) {
    garantiaTexto = `Garantia: ${s.garantiaDias} dias${s.garantiaObs ? ` — ${s.garantiaObs}` : ''}`;
  }

  return {
    titulo: 'Relatório de Serviço',
    numero: s.id,
    dataEmissao: fmtData(hoje),
    cliente: { nome: cliente?.nome ?? '—' },
    periodo: periodoTexto(s.dataInicio || s.dataEntrada, s.dataConclusao),
    status: s.status,
    equipamento: { nome: equipamento?.nome ?? '—', linhaSpecs: specsLinha(equipamento) },
    secoes,
    garantiaTexto,
    contato: CONTATO,
    valor: temValor(s.valorCobrado) ? moeda(s.valorCobrado) : null,
  };
}
