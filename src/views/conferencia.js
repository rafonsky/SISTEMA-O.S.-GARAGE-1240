import { store, repo, servicoById } from '../data/store.js';
import { esc, toast, hojeStr } from '../ui.js';
import { aplicarCobranca, FORMAS_PAGAMENTO } from '../domain/cobranca.js';
import { definirFila } from '../domain/vizinhos.js';
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
  // Atualização de fora (outro aparelho) não pode apagar o que está sendo digitado nas linhas.
  const digitado = {};
  alvo.querySelectorAll('[data-cobranca]').forEach((l) => { digitado[l.dataset.cobranca] = { valor: l.querySelector('[data-valor]').value, forma: l.querySelector('[data-forma]').value }; });
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
      ${g.lista.map((i) => (g.tipo === 'concluido-sem-valor' ? linhaCobranca(i, digitado[i.id]) : `
        <div class="conf-item">
          <span>${esc(i.mensagem)}</span>
          <button class="row-btn" data-tipo="${esc(g.tipo)}" data-id="${esc(i.id)}">Abrir</button>
        </div>`)).join('')}
    </div>`).join('');
  alvo.querySelectorAll('[data-acao]').forEach((b) => (b.onclick = () => cobrar(b)));
  alvo.querySelectorAll('[data-tipo]').forEach((b) => (b.onclick = () => {
    const servico = ['servico-sem-equipamento', 'concluido-sem-valor', 'terceiro-sem-prazo', 'data-invalida'].includes(b.dataset.tipo);
    if (servico) {
      const tiposDeServico = Object.keys(ROTULOS_INCONSISTENCIA).filter((t) => ['servico-sem-equipamento', 'concluido-sem-valor', 'terceiro-sem-prazo', 'data-invalida'].includes(t));
      definirFila([...new Set(grupos.filter((g) => tiposDeServico.includes(g.tipo)).flatMap((g) => g.lista.map((i) => i.id)))]);
    }
    navigate(servico ? `servico/${b.dataset.id}` : 'equipamentos');
  }));
}

// Linha com valor e pagamento ali mesmo, para não precisar abrir a ficha só para isso.
function linhaCobranca(item, digitado = { valor: '', forma: '' }) {
  return `
    <div class="conf-item conf-cobranca" data-cobranca="${esc(item.id)}">
      <span>${esc(item.mensagem)}</span>
      <span class="conf-campos">
        <input class="input" data-valor inputmode="decimal" placeholder="Valor (R$)" aria-label="Valor cobrado de ${esc(item.id)}" value="${esc(digitado.valor)}">
        <select class="select" data-forma aria-label="Forma de pagamento de ${esc(item.id)}"><option value="">Forma…</option>${FORMAS_PAGAMENTO.map((f) => `<option ${f === digitado.forma ? 'selected' : ''}>${esc(f)}</option>`).join('')}</select>
        <button class="btn-small-primary" data-acao="pago" data-id="${esc(item.id)}">Pago</button>
        <button class="btn-secondary" data-acao="valor" data-id="${esc(item.id)}">Salvar valor</button>
        <button class="row-btn" data-tipo="concluido-sem-valor" data-id="${esc(item.id)}">Abrir</button>
      </span>
    </div>`;
}

async function cobrar(botao) {
  const linha = botao.closest('[data-cobranca]');
  const servico = servicoById(botao.dataset.id);
  if (!servico) { toast('Serviço não encontrado.'); return; }
  const r = aplicarCobranca(servico, {
    valor: linha.querySelector('[data-valor]').value,
    forma: linha.querySelector('[data-forma]').value,
    pago: botao.dataset.acao === 'pago',
  }, hojeStr());
  if (!r.ok) { toast(r.erro); linha.querySelector('[data-valor]').focus(); return; }
  linha.querySelectorAll('button').forEach((b) => { b.disabled = true; });
  try {
    await repo.saveServico(r.servico);
    toast(botao.dataset.acao === 'pago' ? `${servico.id} salvo como pago.` : `${servico.id}: valor salvo.`);
  } catch (e) {
    linha.querySelectorAll('button').forEach((b) => { b.disabled = false; });
    toast(e.message);
  }
}
