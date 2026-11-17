import { rotuloStatus } from './status.js';
import { totalAReceber } from './finance.js';
import { precisaAtencao } from './prazo.js';
import { normalizeSerial, semAcento } from './serial.js';
import { filtrarServicos } from './grupos.js';

const PRIORIDADE = ['Prazo do terceiro estourado', 'Previsão de entrega vencida', 'Concluído e não pago'];

export function resumoPainel(servicos, hoje) {
  const conta = (grupo) => filtrarServicos(servicos, { grupo }).length;
  const atencao = servicos
    .map((servico) => ({ servico, motivo: precisaAtencao(servico, hoje)?.motivo }))
    .filter((a) => a.motivo)
    .sort((a, b) => PRIORIDADE.indexOf(a.motivo) - PRIORIDADE.indexOf(b.motivo));
  return {
    emAndamento: conta('em-andamento'),
    noTerceiro: conta('no-terceiro'),
    aguardandoAprovacao: conta('aguardando-aprovacao'),
    aReceber: totalAReceber(servicos),
    atencao,
  };
}

export function buscarGlobal({ clientes, equipamentos, servicos }, texto, limite = 20) {
  const q = semAcento(texto).trim();
  if (!q) return [];
  const qSerie = normalizeSerial(texto);
  const nomeCliente = (id) => clientes.find((c) => c.id === id)?.nome ?? '';
  const nomeEquip = (id) => equipamentos.find((e) => e.id === id)?.nome ?? '';
  const resultados = [];

  const serieDe = (id) => equipamentos.find((e) => e.id === id)?.serieNorm ?? '';
  for (const s of servicos) {
    const achouSerie = qSerie && serieDe(s.equipamentoId).includes(qSerie);
    if (achouSerie || semAcento(`${s.id} ${nomeEquip(s.equipamentoId)} ${nomeCliente(s.clienteId)}`).includes(q)) {
      resultados.push({ tipo: 'servico', id: s.id, titulo: `${s.id} · ${nomeEquip(s.equipamentoId)}`, detalhe: `${nomeCliente(s.clienteId)} · ${rotuloStatus(s.status)}`, rota: `servico/${s.id}` });
    }
  }
  for (const e of equipamentos) {
    const texto2 = semAcento(`${e.nome} ${e.serie ?? ''} ${e.patrimonio ?? ''} ${e.marca ?? ''} ${e.modelo ?? ''} ${nomeCliente(e.clienteId)}`);
    if (texto2.includes(q) || (qSerie && (e.serieNorm ?? '').includes(qSerie))) {
      resultados.push({ tipo: 'equipamento', id: e.id, titulo: e.nome, detalhe: `${nomeCliente(e.clienteId)}${e.serie ? ` · série ${e.serie}` : ''}`, rota: 'equipamentos', busca: e.serie || e.nome });
    }
  }
  for (const c of clientes) {
    if (semAcento(`${c.nome} ${c.telefone ?? ''} ${c.email ?? ''}`).includes(q)) {
      resultados.push({ tipo: 'cliente', id: c.id, titulo: c.nome, detalhe: 'Cliente', rota: 'clientes' });
    }
  }
  const ordem = { equipamento: 0, servico: 1, cliente: 2 }; // o aparelho primeiro, depois os serviços dele
  return resultados.sort((a, b) => ordem[a.tipo] - ordem[b.tipo]).slice(0, limite);
}
