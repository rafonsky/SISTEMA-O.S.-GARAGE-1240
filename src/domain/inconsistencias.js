import { dataValida } from './datas.js';
import { normalizeNome, normalizeSerial } from './serial.js';

const CAMPOS_DATA = ['dataEntrada', 'dataInicio', 'previsaoEntrega', 'dataConclusao', 'dataPagamento'];
const temValor = (v) => v !== null && v !== undefined && v !== '';

export const ROTULOS_INCONSISTENCIA = {
  'servico-sem-equipamento': 'Serviços sem equipamento',
  'equipamento-sem-cliente': 'Equipamentos sem cliente',
  'equipamento-duplicado': 'Equipamentos possivelmente duplicados',
  'concluido-sem-valor': 'Serviços concluídos sem valor cobrado',
  'terceiro-sem-prazo': 'Terceirizados sem data de envio ou prazo',
  'data-invalida': 'Datas inválidas',
};

export function findInconsistencias({ clientes, equipamentos, servicos }) {
  const lista = [];
  const add = (tipo, id, mensagem, extra = {}) => lista.push({ tipo, id, mensagem, ...extra });
  const equipIds = new Set(equipamentos.map((e) => e.id));
  const clienteIds = new Set(clientes.map((c) => c.id));

  for (const s of servicos) {
    if (!equipIds.has(s.equipamentoId)) add('servico-sem-equipamento', s.id, `${s.id} aponta para um equipamento que não existe.`);
    if (['Concluído', 'Entregue ao cliente'].includes(s.status) && !temValor(s.valorCobrado)) {
      add('concluido-sem-valor', s.id, `${s.id} está concluído, mas sem valor cobrado.`);
    }
    if (s.terceiro && (!s.terceiro.enviadoEm || !s.terceiro.prazoDias)) {
      add('terceiro-sem-prazo', s.id, `${s.id} é terceirizado, mas falta a data de envio ou o prazo.`);
    }
    const ruins = CAMPOS_DATA.filter((c) => temValor(s[c]) && !dataValida(s[c]));
    if (ruins.length) add('data-invalida', s.id, `${s.id} tem data inválida em: ${ruins.join(', ')}.`);
  }

  const vistos = new Map();
  for (const e of equipamentos) {
    if (!clienteIds.has(e.clienteId)) add('equipamento-sem-cliente', e.id, `${e.nome} aponta para um cliente que não existe.`, { equipamentoIds: [e.id] });
    const serie = normalizeSerial(e.serie);
    const chave = `${e.clienteId}|${serie ? `s:${serie}` : `n:${normalizeNome(e.nome)}|p:${normalizeNome(e.patrimonio)}`}`;
    if (vistos.has(chave)) {
      add('equipamento-duplicado', e.id, `${e.nome} parece repetido (já existe ${vistos.get(chave).nome}).`, { equipamentoIds: [vistos.get(chave).id, e.id] });
    } else {
      vistos.set(chave, e);
    }
  }
  return lista;
}
