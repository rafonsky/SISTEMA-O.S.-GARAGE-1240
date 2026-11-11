// Papéis organizam o trabalho (qual aba abre, qual fila aparece); NÃO escondem nem bloqueiam nada.
import { filtrarServicos } from './grupos.js';

export const PAPEIS = ['admin', 'tecnico', 'recepcao'];

export const ABAS = [
  { id: 'recepcao', rotulo: 'Recepção', dono: 'recepção' },
  { id: 'tecnico', rotulo: 'Técnico', dono: 'técnico' },
  { id: 'orcamento', rotulo: 'Orçamento', dono: 'administração' },
  { id: 'faturamento', rotulo: 'Faturamento', dono: 'administração' },
  { id: 'historico', rotulo: 'Histórico', dono: 'todos' },
];

export const ROTULO_PAPEL = { admin: 'Administração', tecnico: 'Técnico', recepcao: 'Recepção' };

export function normalizarPapel(role) {
  const r = String(role ?? '').trim().toLowerCase();
  return PAPEIS.includes(r) ? r : 'admin';
}

const ABA_DA_ETAPA = {
  Recebido: 'recepcao',
  'Em diagnóstico': 'tecnico',
  'Em andamento': 'tecnico',
  'Aguardando peça': 'tecnico',
  'No terceiro': 'tecnico',
  'Aguardando aprovação': 'orcamento',
};

export const abaDaEtapa = (status) => ABA_DA_ETAPA[status] ?? 'faturamento';

export function abaInicial(papel, status) {
  if (papel === 'tecnico') return 'tecnico';
  if (papel === 'recepcao') return 'recepcao';
  return abaDaEtapa(status);
}

const eIgual = (...status) => (s) => status.includes(s.status);

// O que cada pessoa tem para fazer agora. Só organiza a tela inicial; qualquer um vê tudo no sistema.
export function filaDoPapel(papel, servicos) {
  if (papel === 'tecnico') {
    return { titulo: 'Para você trabalhar', servicos: servicos.filter(eIgual('Em diagnóstico', 'Em andamento', 'Aguardando peça')) };
  }
  if (papel === 'recepcao') {
    return { titulo: 'Para a recepção', servicos: servicos.filter(eIgual('Recebido', 'Concluído')) };
  }
  const aReceber = new Set(filtrarServicos(servicos, { grupo: 'a-receber' }).map((s) => s.id));
  return {
    titulo: 'Para decidir e cobrar',
    servicos: servicos.filter((s) => s.status === 'Aguardando aprovação' || aReceber.has(s.id)),
  };
}
