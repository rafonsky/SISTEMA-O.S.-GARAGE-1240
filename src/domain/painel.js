import { totalAReceber } from './finance.js';
import { precisaAtencao } from './prazo.js';
import { normalizeSerial, semAcento } from './serial.js';

const GRUPO_ANDAMENTO = ['Recebido', 'Em diagnóstico', 'Em andamento', 'Aguardando peça'];
const PRIORIDADE = ['Prazo do terceiro estourado', 'Previsão de entrega vencida', 'Concluído e não pago'];

export function resumoPainel(servicos, hoje) {
  const conta = (lista) => servicos.filter((s) => lista.includes(s.status)).length;
  const atencao = servicos
    .map((servico) => ({ servico, motivo: precisaAtencao(servico, hoje)?.motivo }))
    .filter((a) => a.motivo)
    .sort((a, b) => PRIORIDADE.indexOf(a.motivo) - PRIORIDADE.indexOf(b.motivo));
  return {
    emAndamento: conta(GRUPO_ANDAMENTO),
    noTerceiro: conta(['No terceiro']),
    aguardandoAprovacao: conta(['Aguardando aprovação']),
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

  for (const s of servicos) {
    if (semAcento(`${s.id} ${nomeEquip(s.equipamentoId)} ${nomeCliente(s.clienteId)}`).includes(q)) {
      resultados.push({ tipo: 'servico', id: s.id, titulo: `${s.id} · ${nomeEquip(s.equipamentoId)}`, detalhe: `${nomeCliente(s.clienteId)} · ${s.status}`, rota: `servico/${s.id}` });
    }
  }
  for (const e of equipamentos) {
    const texto2 = semAcento(`${e.nome} ${e.serie ?? ''} ${e.patrimonio ?? ''} ${e.marca ?? ''} ${e.modelo ?? ''} ${nomeCliente(e.clienteId)}`);
    if (texto2.includes(q) || (qSerie && (e.serieNorm ?? '').includes(qSerie))) {
      resultados.push({ tipo: 'equipamento', id: e.id, titulo: e.nome, detalhe: `${nomeCliente(e.clienteId)}${e.serie ? ` · série ${e.serie}` : ''}`, rota: 'equipamentos' });
    }
  }
  for (const c of clientes) {
    if (semAcento(`${c.nome} ${c.telefone ?? ''} ${c.email ?? ''}`).includes(q)) {
      resultados.push({ tipo: 'cliente', id: c.id, titulo: c.nome, detalhe: 'Cliente', rota: 'clientes' });
    }
  }
  return resultados.slice(0, limite);
}
