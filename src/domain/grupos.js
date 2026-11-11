// Grupos de serviços usados pelos cartões do painel e pelos filtros da tela Serviços.
// Os mesmos grupos alimentam as contagens do painel, para o número do cartão bater com a lista.
import { semAcento } from './serial.js';

const temNumero = (v) => v !== undefined && v !== null && v !== '' && Number.isFinite(Number(v));

export const GRUPOS = {
  todos: { rotulo: 'Todos', filtro: () => true },
  'em-andamento': { rotulo: 'Em andamento', filtro: (s) => ['Recebido', 'Em diagnóstico', 'Em andamento', 'Aguardando peça'].includes(s.status) },
  'no-terceiro': { rotulo: 'No terceiro', filtro: (s) => s.status === 'No terceiro' },
  'aguardando-aprovacao': { rotulo: 'Aguardando aprovação', filtro: (s) => s.status === 'Aguardando aprovação' },
  'a-receber': {
    rotulo: 'A receber',
    filtro: (s) => ['Concluído', 'Entregue ao cliente'].includes(s.status) && s.pago !== true && temNumero(s.valorCobrado),
  },
  encerrados: {
    rotulo: 'Encerrados',
    filtro: (s) => ['Concluído', 'Entregue ao cliente', 'Sem conserto – peças aproveitadas', 'Sem conserto – devolvido ao cliente'].includes(s.status),
  },
};

// ctx = { clientes, equipamentos } só é preciso para a busca por texto.
export function filtrarServicos(servicos, { grupo = 'todos', q = '' } = {}, ctx = {}) {
  const base = (GRUPOS[grupo] ?? GRUPOS.todos).filtro;
  const termo = semAcento(q).trim();
  const nomeDe = (lista, id) => lista?.find((x) => x.id === id)?.nome ?? '';
  return servicos.filter((s) => {
    if (!base(s)) return false;
    if (!termo) return true;
    return semAcento(`${s.id} ${nomeDe(ctx.equipamentos, s.equipamentoId)} ${nomeDe(ctx.clientes, s.clienteId)}`).includes(termo);
  });
}
