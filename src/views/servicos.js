import { store, equipById, clienteById } from '../data/store.js';
import { esc, fmtData, semAcento } from '../ui.js';
import { GRUPOS, filtrarServicos } from '../domain/grupos.js';
import { formatBRL } from '../domain/finance.js';

let grupo = 'todos';
let busca = '';
let ir = null;

export async function render(container, { param, navigate }) {
  ir = navigate;
  if (param && GRUPOS[param]) grupo = param;
  container.innerHTML = `
    <div class="page-head">
      <div><h2>Serviços</h2><p id="sv-contagem"></p></div>
      <button class="btn-small-primary btn-grande" id="sl-novo">+ Novo serviço</button>
    </div>
    <div class="chips" id="sl-chips"></div>
    <div class="filter-bar"><input class="search-input" id="sl-busca" placeholder="Buscar por número, cliente ou equipamento…" value="${esc(busca)}" autocomplete="off"></div>
    <div id="sl-tabela"></div>`;
  document.getElementById('sl-novo').onclick = () => navigate('servico/novo');
  document.getElementById('sl-busca').oninput = (e) => { busca = e.target.value; desenharTabela(); };
  desenharChips();
  desenharTabela();
}

export function update(container) {
  if (document.getElementById('sl-tabela')) { desenharChips(); desenharTabela(); }
}

function desenharChips() {
  const alvo = document.getElementById('sl-chips');
  alvo.innerHTML = Object.entries(GRUPOS).map(([id, g]) =>
    `<button type="button" class="chip ${id === grupo ? 'ativo' : ''}" data-g="${id}">${esc(g.rotulo)} <b>${filtrarServicos(store.servicos, { grupo: id }).length}</b></button>`).join('');
  alvo.querySelectorAll('[data-g]').forEach((b) => (b.onclick = () => { grupo = b.dataset.g; desenharChips(); desenharTabela(); }));
}

function desenharTabela() {
  const lista = filtrarServicos(store.servicos, { grupo, q: busca }, store).sort((a, b) => b.id.localeCompare(a.id));
  document.getElementById('sv-contagem').textContent = `${lista.length} de ${store.servicos.length} serviço${store.servicos.length === 1 ? '' : 's'}`;
  const alvo = document.getElementById('sl-tabela');
  if (!lista.length) { alvo.innerHTML = '<div class="empty">Nenhum serviço neste filtro.</div>'; return; }
  alvo.innerHTML = `
    <table><thead><tr><th>O.S.</th><th>Equipamento</th><th>Cliente</th><th>Status</th><th>Entrada</th><th>Valor</th></tr></thead>
    <tbody>${lista.map((s) => `
      <tr class="linha-link" data-os="${esc(s.id)}" tabindex="0">
        <td data-label="O.S."><b>${esc(s.id)}</b></td>
        <td data-label="Equipamento">${esc(equipById(s.equipamentoId)?.nome ?? '—')}</td>
        <td data-label="Cliente">${esc(clienteById(s.clienteId)?.nome ?? '—')}</td>
        <td data-label="Status">${esc(s.status)}</td>
        <td data-label="Entrada">${esc(fmtData(s.dataEntrada)) || '—'}</td>
        <td data-label="Valor">${s.valorCobrado != null && s.valorCobrado !== '' ? `${esc(formatBRL(s.valorCobrado))}${s.pago ? ' ✔' : ''}` : '—'}</td>
      </tr>`).join('')}</tbody></table>`;
  alvo.querySelectorAll('[data-os]').forEach((tr) => {
    tr.onclick = () => ir(`servico/${tr.dataset.os}`);
    tr.onkeydown = (e) => { if (e.key === 'Enter') ir(`servico/${tr.dataset.os}`); };
  });
}
