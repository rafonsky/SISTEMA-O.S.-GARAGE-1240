import { STATUS_LIST } from '../domain/status.js';
import { normalizeNome } from '../domain/serial.js';

const SPECS = ['cpu', 'ram', 'armazenamento', 'gpu', 'tela', 'so', 'licenca'];
const s = (v) => (v === undefined || v === null ? '' : String(v).trim());

const ehLinhaDePlanilha = (nome) =>
  /^(observa[cç][aã]o|legenda)\s*:/i.test(nome) || /\(\d{2}\)\s*\d{4,5}-\d{4}/.test(nome);

function dataValida(d) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return false;
  const [a, m, dia] = d.split('-').map(Number);
  const dt = new Date(Date.UTC(a, m - 1, dia));
  return dt.getUTCFullYear() === a && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === dia;
}

function parseValor(v) {
  let t = s(v).replace(/[^\d,.-]/g, '');
  if (!t) return null;
  if (t.includes(',')) t = t.replace(/\./g, '').replace(',', '.');
  const n = parseFloat(t);
  return Number.isFinite(n) ? n : null;
}

export function transformBackup({ clientes = [], equipamentos = [], ordens = [] }) {
  const pendencias = [];
  const pend = (tipo, id, detalhe) => pendencias.push({ tipo, id, detalhe });

  const outClientes = clientes.map(({ pin, ...resto }) => resto);
  outClientes.forEach((c) => {
    if (/\bteste\b/i.test(s(c.nome))) pend('possivel-teste', c.id, `Cliente "${c.nome}" parece ser de teste.`);
  });

  // --- equipamentos ---
  const remap = new Map(); // id antigo -> id mantido
  const porChave = new Map();
  const outEquip = [];
  for (const e of equipamentos) {
    const nome = s(e.nome);
    if (ehLinhaDePlanilha(nome)) {
      pend('linha-lixo', e.id, `"${nome}" parece linha de planilha, não um equipamento; não foi migrado.`);
      continue;
    }
    let patrimonio = s(e.patrimonio);
    if (/^s\/?n$/i.test(patrimonio)) patrimonio = '';
    const chave = patrimonio ? `${e.clienteId}|${normalizeNome(nome)}|${patrimonio.toLowerCase()}` : null;
    if (chave && porChave.has(chave)) {
      remap.set(e.id, porChave.get(chave));
      continue;
    }
    const novo = {
      id: e.id,
      clienteId: e.clienteId,
      nome,
      tipo: ['Notebook', 'Desktop'].includes(e.tipo) ? 'informatica' : 'outros',
      serie: '',
      serieNorm: '',
      patrimonio,
      marca: s(e.marca),
      modelo: s(e.modelo),
      specs: Object.fromEntries(SPECS.map((k) => [k, s(e[k])])),
      acessorios: s(e.acessorios),
      obs: s(e.obs),
    };
    outEquip.push(novo);
    remap.set(e.id, e.id);
    if (chave) porChave.set(chave, e.id);
    if (/\bteste\b/i.test(nome)) pend('possivel-teste', e.id, `"${nome}" parece ser de teste.`);
  }

  const grupos = new Map();
  for (const e of outEquip) {
    const k = `${e.clienteId}|${normalizeNome(e.nome)}`;
    grupos.set(k, [...(grupos.get(k) ?? []), e]);
  }
  for (const grupo of grupos.values()) {
    if (grupo.length > 1) {
      const ids = grupo.map((g) => g.id).join(', ');
      pend('possivel-duplicado', grupo[1].id, `${grupo.length} equipamentos "${grupo[0].nome}" do mesmo cliente (${ids}); confira se são aparelhos diferentes.`);
    }
  }

  // --- serviços ---
  const idsEquip = new Set(outEquip.map((e) => e.id));
  const servicos = [];
  for (const o of ordens) {
    const equipamentoId = remap.get(o.equipamentoId);
    if (!equipamentoId || !idsEquip.has(equipamentoId)) {
      pend('servico-sem-equipamento', o.id, `A O.S. ${o.id} aponta para um equipamento que não existe mais; não foi migrada.`);
      continue;
    }
    const datas = {};
    for (const campo of ['dataEntrada', 'dataConclusao', 'previsaoEntrega']) {
      const d = s(o[campo]);
      if (d && !dataValida(d)) {
        pend('data-invalida', o.id, `${campo} "${d}" inválida; campo deixado em branco.`);
        datas[campo] = '';
      } else datas[campo] = d;
    }
    if (!datas.dataEntrada && datas.dataConclusao) datas.dataEntrada = datas.dataConclusao;

    let status = s(o.status);
    if (status === 'Em análise') status = 'Em diagnóstico';
    if (!STATUS_LIST.includes(status)) {
      pend('status-desconhecido', o.id, `Status "${status}" não existe mais; ficou como "Recebido".`);
      status = 'Recebido';
    }

    let relato = s(o.defeitoRelatado) || s(o.defeito);
    if (!relato) {
      pend('relato-vazio', o.id, 'Sem relato do cliente; preencher.');
      relato = '(não informado)';
    }

    const garantia = Number(s(o.garantiaDias));
    servicos.push({
      id: o.id,
      clienteId: o.clienteId,
      equipamentoId,
      status,
      relatoCliente: relato,
      diagnostico: s(o.diagnosticoTecnico),
      acoes: [],
      recomendacoes: [],
      ...datas,
      dataInicio: '',
      valorCobrado: parseValor(o.valorOrcamento),
      pago: false,
      dataPagamento: '',
      garantiaDias: Number.isFinite(garantia) && garantia > 0 ? garantia : null,
      garantiaObs: s(o.garantiaObs),
      terceiro: null,
      pecas: s(o.pecas),
      obs: s(o.obs),
      checklistEntrada: Array.isArray(o.checklistEntrada) ? o.checklistEntrada : [],
      checklistObs: s(o.checklistObs),
      fotoEntradaUrl: s(o.fotoEntradaUrl),
      tecnicoResponsavel: s(o.tecnicoResponsavel),
      historico: Array.isArray(o.historico) ? o.historico : [],
    });
  }

  return { clientes: outClientes, equipamentos: outEquip, servicos, pendencias };
}
