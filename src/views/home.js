import { store, equipById, clienteById } from '../data/store.js';
import { esc, hojeStr, fmtData } from '../ui.js';
import { resumoPainel, buscarGlobal } from '../domain/painel.js';
import { formatBRL } from '../domain/finance.js';
import { diasRestantes } from '../domain/prazo.js';

let termo = '';

export async function render(container, { navigate }) {
  container.innerHTML = `
    <div class="page-head">
      <div><h2>Início</h2><p>O que precisa de você agora.</p></div>
      <button class="btn-small-primary btn-grande" id="h-novo">+ Novo serviço</button>
    </div>
    <div class="busca-wrap">
      <input class="search-input busca-grande" id="h-busca" placeholder="Buscar cliente, equipamento, nº de série ou O.S.…" value="${esc(termo)}" autocomplete="off">
      <div class="resultados" id="h-resultados"></div>
    </div>
    <div id="h-painel"></div>`;
  document.getElementById('h-novo').onclick = () => navigate('servico/novo');
  document.getElementById('h-busca').oninput = (e) => { termo = e.target.value; desenharBusca(navigate); };
  desenharPainel(navigate);
  desenharBusca(navigate);
}

export function update(container, { navigate }) {
  if (document.getElementById('h-painel')) { desenharPainel(navigate); desenharBusca(navigate); }
}

function desenharBusca(navigate) {
  const alvo = document.getElementById('h-resultados');
  if (!alvo) return;
  const lista = buscarGlobal(store, termo);
  if (!termo.trim()) { alvo.innerHTML = ''; alvo.style.display = 'none'; return; }
  alvo.style.display = 'block';
  alvo.innerHTML = lista.length
    ? lista.map((r, i) => `<button class="resultado" data-i="${i}"><span class="res-tipo">${{ servico: 'O.S.', equipamento: 'Equip.', cliente: 'Cliente' }[r.tipo]}</span>
        <span class="res-txt"><b>${esc(r.titulo)}</b><small>${esc(r.detalhe)}</small></span></button>`).join('')
    : '<div class="resultado-vazio">Nada encontrado.</div>';
  alvo.querySelectorAll('[data-i]').forEach((b) => (b.onclick = async () => {
    const r = lista[Number(b.dataset.i)];
    if (r.tipo === 'equipamento') (await import('./equipamentos.js')).definirBusca(r.busca);
    navigate(r.rota);
  }));
}

function desenharPainel(navigate) {
  const hoje = hojeStr();
  const r = resumoPainel(store.servicos, hoje);
  const alvo = document.getElementById('h-painel');
  const cartao = (n, rotulo) => `<div class="cartao-painel"><b>${n}</b><small>${rotulo}</small></div>`;
  alvo.innerHTML = `
    <div class="cartoes-painel">
      ${cartao(r.emAndamento, 'Em andamento')}
      ${cartao(r.noTerceiro, 'No terceiro')}
      ${cartao(r.aguardandoAprovacao, 'Aguardando aprovação')}
      ${cartao(formatBRL(r.aReceber), 'A receber')}
    </div>
    <h3 class="sub-titulo">Precisa de atenção</h3>
    ${r.atencao.length ? `<div class="lista-atencao">${r.atencao.map(({ servico: s, motivo }) => {
      const e = equipById(s.equipamentoId);
      const rest = s.terceiro ? diasRestantes(s.terceiro, hoje) : null;
      const extra = motivo.startsWith('Prazo') && rest !== null ? ` (há ${-rest} dia(s))` : motivo.startsWith('Previsão') ? ` (${fmtData(s.previsaoEntrega)})` : '';
      return `<button class="item-atencao" data-os="${esc(s.id)}">
        <span class="os-id">${esc(s.id)}</span>
        <span class="ia-txt"><b>${esc(e?.nome ?? '—')}</b><small>${esc(clienteById(s.clienteId)?.nome ?? '')}</small></span>
        <span class="ia-motivo">${esc(motivo)}${esc(extra)}</span></button>`;
    }).join('')}</div>` : '<div class="empty" style="padding:28px;">Tudo em dia. Nada precisando de atenção.</div>'}`;
  alvo.querySelectorAll('[data-os]').forEach((b) => (b.onclick = () => navigate(`servico/${b.dataset.os}`)));
}
