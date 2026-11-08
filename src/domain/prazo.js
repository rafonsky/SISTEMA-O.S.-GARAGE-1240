import { STATUS_ABERTOS } from './status.js';

const DIA_MS = 24 * 60 * 60 * 1000;

function utc(dataStr) {
  const [a, m, d] = String(dataStr).split('-').map(Number);
  return Date.UTC(a, m - 1, d);
}

export function diffDias(de, ate) {
  return Math.round((utc(ate) - utc(de)) / DIA_MS);
}

export function diasRestantes(terceiro, hoje) {
  if (!terceiro?.enviadoEm || !terceiro?.prazoDias) return null;
  return Number(terceiro.prazoDias) - diffDias(terceiro.enviadoEm, hoje);
}

export function precisaAtencao(servico, hoje) {
  const aberto = STATUS_ABERTOS.includes(servico.status);
  if (aberto) {
    const restantes = diasRestantes(servico.terceiro, hoje);
    if (restantes !== null && restantes < 0) return { motivo: 'Prazo do terceiro estourado' };
    if (servico.previsaoEntrega && servico.previsaoEntrega < hoje) return { motivo: 'Previsão de entrega vencida' };
  }
  const entregue = ['Concluído', 'Entregue ao cliente'].includes(servico.status);
  if (entregue && servico.pago !== true && Number(servico.valorCobrado) > 0) return { motivo: 'Concluído e não pago' };
  return null;
}
