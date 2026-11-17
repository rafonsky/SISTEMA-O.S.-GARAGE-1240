import { store, equipById, clienteById } from '../data/store.js';
import { rotuloStatus } from '../domain/status.js';
import { esc, hojeStr, fmtData } from '../ui.js';
import { resumoPainel, buscarGlobal } from '../domain/painel.js';
import { formatBRL } from '../domain/finance.js';
import { diasRestantes } from '../domain/prazo.js';
import { filaDoPapel, ROTULO_PAPEL } from '../domain/papeis.js';
import { currentUsuario } from '../auth.js';

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
  const cartao = (n, rotulo, grupo) => `<button type="button" class="cartao-painel clicavel" data-grupo="${grupo}"><b>${n}</b><small>${rotulo}</small><span class="cp-seta">Ver lista ›</span></button>`;
  alvo.innerHTML = `
    <div class="cartoes-painel">
      ${cartao(r.emAndamento, 'Em andamento', 'em-andamento')}
      ${cartao(r.noTerceiro, 'No terceiro', 'no-terceiro')}
      ${cartao(r.aguardandoAprovacao, 'Aguardando aprovação', 'aguardando-aprovacao')}
      ${cartao(formatBRL(r.aReceber), 'A receber', 'a-receber')}
    </div>
    ${blocoFila()}
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
  alvo.querySelectorAll('[data-grupo]').forEach((b) => (b.onclick = () => navigate(`servicos/${b.dataset.grupo}`)));
}

// Fila de trabalho de quem está logado (organiza a tela; qualquer pessoa vê tudo no sistema).
function blocoFila() {
  const papel = currentUsuario()?.papel ?? 'admin';
  const { titulo, servicos } = filaDoPapel(papel, store.servicos);
  const itens = servicos.slice(0, 8).map((s) => `<button class="item-atencao" data-os="${esc(s.id)}">
    <span class="os-id">${esc(s.id)}</span>
    <span class="ia-txt"><b>${esc(equipById(s.equipamentoId)?.nome ?? '—')}</b><small>${esc(clienteById(s.clienteId)?.nome ?? '')}</small></span>
    <span class="ia-motivo">${esc(rotuloStatus(s.status))}</span></button>`).join('');
  return `<h3 class="sub-titulo">${esc(titulo)} <small class="papel-selo">${esc(ROTULO_PAPEL[papel])}</small></h3>
    ${servicos.length ? `<div class="lista-atencao">${itens}</div>${servicos.length > 8 ? `<div class="hint">e mais ${servicos.length - 8}. Veja todos na tela Serviços.</div>` : ''}` : '<div class="empty" style="padding:22px;">Nada na sua fila agora.</div>'}`;
}
