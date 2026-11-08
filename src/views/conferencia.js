import { store } from '../data/store.js';
import { esc } from '../ui.js';
import { findInconsistencias, ROTULOS_INCONSISTENCIA } from '../domain/inconsistencias.js';

export async function render(container, { navigate }) {
  container.innerHTML = `
    <div class="page-head"><div><h2>Conferência de dados</h2>
      <p>Aponta o que está fora do padrão, para a bagunça aparecer cedo e não só quando um relatório não bate.</p></div></div>
    <div id="conf-corpo"></div>`;
  desenhar(navigate);
}

export function update(container, { navigate }) {
  if (document.getElementById('conf-corpo')) desenhar(navigate);
}

function desenhar(navigate) {
  const itens = findInconsistencias(store);
  const alvo = document.getElementById('conf-corpo');
  if (!itens.length) {
    alvo.innerHTML = '<div class="empty" style="padding:40px;">Tudo certo. Nenhuma inconsistência encontrada.</div>';
    return;
  }
  const grupos = Object.keys(ROTULOS_INCONSISTENCIA)
    .map((tipo) => ({ tipo, lista: itens.filter((i) => i.tipo === tipo) }))
    .filter((g) => g.lista.length);
  alvo.innerHTML = `<p class="hint" style="margin:0 0 14px;">${itens.length} ponto(s) para conferir.</p>` + grupos.map((g) => `
    <div class="bloco">
      <h3 class="sub-titulo">${esc(ROTULOS_INCONSISTENCIA[g.tipo])} <span class="contagem-grupo">${g.lista.length}</span></h3>
      ${g.lista.map((i) => `
        <div class="conf-item">
          <span>${esc(i.mensagem)}</span>
          <button class="row-btn" data-tipo="${esc(g.tipo)}" data-id="${esc(i.id)}">Abrir</button>
        </div>`).join('')}
    </div>`).join('');
  alvo.querySelectorAll('[data-id]').forEach((b) => (b.onclick = () => {
    const servico = ['servico-sem-equipamento', 'concluido-sem-valor', 'terceiro-sem-prazo', 'data-invalida'].includes(b.dataset.tipo);
    navigate(servico ? `servico/${b.dataset.id}` : 'equipamentos');
  }));
}
