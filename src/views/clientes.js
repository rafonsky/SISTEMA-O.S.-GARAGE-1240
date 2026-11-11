import { store, repo, clienteById } from '../data/store.js';
import { esc, toast, openModal, closeModal, confirmar, semAcento } from '../ui.js';

let busca = '';

// Usada pelos links da ficha do serviço: abre a lista já filtrada pelo cliente.
export function definirBusca(texto) {
  busca = texto;
}

export async function render(container) {
  container.innerHTML = `
    <div class="page-head"><div><h2>Clientes</h2><p id="cli-contagem"></p></div></div>
    <div class="filter-bar">
      <input class="search-input" id="cli-busca" placeholder="Buscar nome, telefone, e-mail ou CPF/CNPJ…" value="${esc(busca)}">
      <button class="btn-small-primary" id="cli-novo">+ Novo cliente</button>
    </div>
    <div id="cli-tabela"></div>`;
  document.getElementById('cli-busca').oninput = (e) => { busca = e.target.value; desenharTabela(); };
  document.getElementById('cli-novo').onclick = () => abrirFormCliente(null);
  desenharTabela();
}

export function update() {
  if (document.getElementById('cli-tabela')) desenharTabela();
}

function desenharTabela() {
  const q = semAcento(busca);
  const lista = store.clientes
    .filter((c) => !q || semAcento([c.nome, c.telefone, c.email, c.documento].join(' ')).includes(q))
    .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
  document.getElementById('cli-contagem').textContent = `${store.clientes.length} cliente${store.clientes.length === 1 ? '' : 's'}`;
  const alvo = document.getElementById('cli-tabela');
  if (!lista.length) { alvo.innerHTML = '<div class="empty">Nenhum cliente encontrado.</div>'; return; }
  alvo.innerHTML = `
    <table><thead><tr><th>Cliente</th><th>Telefone</th><th>E-mail</th><th>Equip.</th><th>Serviços</th><th></th></tr></thead>
    <tbody>${lista.map((c) => `
      <tr>
        <td data-label="Cliente"><b>${esc(c.nome)}</b></td>
        <td data-label="Telefone">${esc(c.telefone) || '—'}</td>
        <td data-label="E-mail">${esc(c.email) || '—'}</td>
        <td data-label="Equip.">${store.equipamentos.filter((e) => e.clienteId === c.id).length}</td>
        <td data-label="Serviços">${store.servicos.filter((s) => s.clienteId === c.id).length}</td>
        <td data-label="">
          <button class="row-btn" data-editar="${esc(c.id)}">Editar</button>
          <button class="row-btn row-btn-danger" data-excluir="${esc(c.id)}">Excluir</button>
        </td>
      </tr>`).join('')}</tbody></table>`;
  alvo.querySelectorAll('[data-editar]').forEach((b) => (b.onclick = () => abrirFormCliente(b.dataset.editar)));
  alvo.querySelectorAll('[data-excluir]').forEach((b) => (b.onclick = () => excluir(b.dataset.excluir)));
}

async function excluir(id) {
  const c = clienteById(id);
  if (!(await confirmar(`Excluir ${c.nome}?`, 'Só é possível se o cliente não tiver equipamentos nem serviços.', 'Excluir', true))) return;
  try {
    await repo.removeCliente(id);
    toast('Cliente excluído.');
  } catch (e) {
    toast(e.message);
  }
}

export function abrirFormCliente(id, aoSalvar) {
  const editando = !!id;
  const c = editando ? clienteById(id) : { nome: '', telefone: '', email: '', documento: '', endereco: '' };
  const m = openModal(`
    <h3>${editando ? 'Editar cliente' : 'Novo cliente'}</h3>
    <div class="field"><label>Nome</label><input type="text" id="c-nome" value="${esc(c.nome)}" style="font-family:var(--font-body);"></div>
    <div class="field"><label>Telefone</label><input type="text" id="c-tel" value="${esc(c.telefone)}" inputmode="tel" placeholder="(41) 9xxxx-xxxx" style="font-family:var(--font-body);"></div>
    <div class="field"><label>E-mail</label><input type="text" id="c-email" value="${esc(c.email)}" inputmode="email" style="font-family:var(--font-body);"></div>
    <div class="field"><label>CPF / CNPJ</label><input type="text" id="c-doc" value="${esc(c.documento)}" style="font-family:var(--font-body);"></div>
    <div class="field"><label>Endereço</label><input type="text" id="c-end" value="${esc(c.endereco)}" style="font-family:var(--font-body);"></div>
    <div class="err" id="c-erro"></div>
    <div class="modal-actions">
      <button class="btn-secondary" id="c-cancelar">Cancelar</button>
      <button class="btn-small-primary" id="c-salvar">${editando ? 'Salvar' : 'Cadastrar'}</button>
    </div>`);
  m.querySelector('#c-cancelar').onclick = closeModal;
  m.querySelector('#c-salvar').onclick = async (ev) => {
    const botao = ev.currentTarget;
    botao.disabled = true;
    try {
      const salvo = await repo.saveCliente({
        ...(editando ? c : {}),
        nome: m.querySelector('#c-nome').value.trim(),
        telefone: m.querySelector('#c-tel').value.trim(),
        email: m.querySelector('#c-email').value.trim(),
        documento: m.querySelector('#c-doc').value.trim(),
        endereco: m.querySelector('#c-end').value.trim(),
      });
      closeModal();
      toast(editando ? 'Cliente atualizado.' : 'Cliente cadastrado.');
      aoSalvar?.(salvo);
    } catch (e) {
      m.querySelector('#c-erro').textContent = e.message;
      botao.disabled = false;
    }
  };
}
