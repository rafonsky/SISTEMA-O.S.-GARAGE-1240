import { store, repo, equipById, clienteById } from '../data/store.js';
import { esc, toast, openModal, closeModal, confirmar, semAcento, fmtData } from '../ui.js';
import { formatBRL } from '../domain/finance.js';
import { specsLinha, rotuloTipo } from '../domain/equipamento.js';
import { findDuplicateEquip } from '../domain/validators.js';
import { normalizeSerial } from '../domain/serial.js';
import { TIPOS_EQUIPAMENTO, rotuloStatus } from '../domain/status.js';
import { abrirFormCliente } from './clientes.js';

const filtros = { q: '', cliente: '', tipo: '' };

// Usada pela busca da tela inicial: abre a lista já filtrada pelo aparelho.
export function definirBusca(texto) {
  filtros.q = texto;
  filtros.cliente = '';
  filtros.tipo = '';
}

export async function render(container, { navigate }) {
  const clientes = [...store.clientes].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
  container.innerHTML = `
    <div class="page-head"><div><h2>Equipamentos</h2><p id="eq-contagem"></p></div></div>
    <div class="filter-bar">
      <input class="search-input" id="eq-busca" placeholder="Buscar nome, nº de série, patrimônio ou cliente…" value="${esc(filtros.q)}">
      <select class="select" id="eq-f-cliente"><option value="">Todos os clientes</option>
        ${clientes.map((c) => `<option value="${esc(c.id)}" ${filtros.cliente === c.id ? 'selected' : ''}>${esc(c.nome)}</option>`).join('')}</select>
      <select class="select" id="eq-f-tipo"><option value="">Todos os tipos</option>
        ${TIPOS_EQUIPAMENTO.map((t) => `<option value="${t}" ${filtros.tipo === t ? 'selected' : ''}>${rotuloTipo(t)}</option>`).join('')}</select>
      <button class="btn-small-primary" id="eq-novo">+ Novo equipamento</button>
    </div>
    <div id="eq-tabela"></div>`;
  document.getElementById('eq-busca').oninput = (e) => { filtros.q = e.target.value; desenharTabela(navigate); };
  document.getElementById('eq-f-cliente').onchange = (e) => { filtros.cliente = e.target.value; desenharTabela(navigate); };
  document.getElementById('eq-f-tipo').onchange = (e) => { filtros.tipo = e.target.value; desenharTabela(navigate); };
  document.getElementById('eq-novo').onclick = () => abrirFormEquipamento(null, filtros.cliente || store.clientes[0]?.id || '');
  desenharTabela(navigate);
}

export function update(container, { navigate }) {
  if (document.getElementById('eq-tabela')) desenharTabela(navigate);
}

function desenharTabela(navigate) {
  const q = semAcento(filtros.q);
  const qSerie = normalizeSerial(filtros.q);
  const lista = store.equipamentos
    .filter((e) => {
      const texto = semAcento([e.nome, e.serie, e.patrimonio, e.marca, e.modelo, clienteById(e.clienteId)?.nome].join(' '));
      const achou = !q || texto.includes(q) || (qSerie && (e.serieNorm ?? '').includes(qSerie));
      return achou &&(!filtros.cliente || e.clienteId === filtros.cliente) && (!filtros.tipo || e.tipo === filtros.tipo);
    })
    .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
  document.getElementById('eq-contagem').textContent = `${lista.length} de ${store.equipamentos.length} equipamento(s)`;
  const alvo = document.getElementById('eq-tabela');
  if (!lista.length) { alvo.innerHTML = '<div class="empty">Nenhum equipamento encontrado.</div>'; return; }
  alvo.innerHTML = `
    <table><thead><tr><th>Equipamento</th><th>Tipo</th><th>Cliente</th><th>Série</th><th>Patrimônio</th><th>Serviços</th><th></th></tr></thead>
    <tbody>${lista.map((e) => {
      const n = store.servicos.filter((s) => s.equipamentoId === e.id).length;
      const specs = specsLinha(e);
      return `<tr>
        <td data-label="Equipamento"><b>${esc(e.nome)}</b>${specs ? `<br><span style="font-size:11px; color:var(--text-dim);">${esc(specs)}</span>` : ''}</td>
        <td data-label="Tipo">${esc(rotuloTipo(e.tipo))}</td>
        <td data-label="Cliente">${esc(clienteById(e.clienteId)?.nome ?? '—')}</td>
        <td data-label="Série"><span class="pin-code">${esc(e.serie) || '—'}</span></td>
        <td data-label="Patrimônio">${esc(e.patrimonio) || '—'}</td>
        <td data-label="Serviços">${n ? `<button class="row-btn" data-historico="${esc(e.id)}">${n}</button>` : '0'}</td>
        <td data-label="">
          <button class="row-btn" data-editar="${esc(e.id)}">Editar</button>
          <button class="row-btn" data-novo-servico="${esc(e.id)}">+ Serviço</button>
          <button class="row-btn row-btn-danger" data-excluir="${esc(e.id)}">Excluir</button>
        </td>
      </tr>`;
    }).join('')}</tbody></table>`;
  alvo.querySelectorAll('[data-editar]').forEach((b) => (b.onclick = () => abrirFormEquipamento(b.dataset.editar)));
  alvo.querySelectorAll('[data-novo-servico]').forEach((b) => (b.onclick = () => navigate(`servico/novo?equip=${encodeURIComponent(b.dataset.novoServico)}`)));
  alvo.querySelectorAll('[data-historico]').forEach((b) => (b.onclick = () => abrirHistorico(b.dataset.historico, navigate)));
  alvo.querySelectorAll('[data-excluir]').forEach((b) => (b.onclick = () => excluir(b.dataset.excluir)));
}

function abrirHistorico(id, navigate) {
  const e = equipById(id);
  const lista = store.servicos.filter((s) => s.equipamentoId === id).sort((a, b) => String(b.dataEntrada ?? '').localeCompare(String(a.dataEntrada ?? '')));
  const m = openModal(`
    <h3>Histórico · ${esc(e.nome)}</h3>
    ${lista.map((s) => `<button class="resultado" data-os="${esc(s.id)}"><span class="res-tipo">${esc(s.id)}</span>
      <span class="res-txt"><b>${esc(rotuloStatus(s.status))}</b><small>${esc(fmtData(s.dataEntrada))}${s.valorCobrado ? ` · ${esc(formatBRL(s.valorCobrado))}` : ''} — ${esc((s.relatoCliente ?? '').slice(0, 70))}</small></span></button>`).join('')}
    <div class="modal-actions"><button class="btn-secondary" id="hist-fechar">Fechar</button></div>`);
  m.querySelector('#hist-fechar').onclick = closeModal;
  m.querySelectorAll('[data-os]').forEach((b) => (b.onclick = () => { closeModal(); navigate(`servico/${b.dataset.os}`); }));
}

async function excluir(id) {
  const e = equipById(id);
  if (!(await confirmar(`Excluir ${e.nome}?`, 'Só é possível se não houver serviços vinculados.', 'Excluir', true))) return;
  try {
    await repo.removeEquipamento(id);
    toast('Equipamento excluído.');
  } catch (err) {
    toast(err.message);
  }
}

const SPECS = [
  ['cpu', 'Processador (CPU)', 'Ex: Intel i7-13650HX'], ['ram', 'Memória RAM', 'Ex: 16GB'],
  ['armazenamento', 'Armazenamento', 'Ex: SSD 512GB'], ['gpu', 'Placa de vídeo (GPU)', 'Ex: RTX 4060'],
  ['tela', 'Tela', 'Ex: 15.6" Full HD'], ['so', 'Sistema operacional', 'Ex: Windows 11'], ['licenca', 'Licença', 'Ex: Digital'],
];

export function abrirFormEquipamento(id, clientePadrao, aoSalvar) {
  const editando = !!id;
  const e = editando
    ? equipById(id)
    : { clienteId: clientePadrao || store.clientes[0]?.id || '', nome: '', tipo: 'informatica', serie: '', patrimonio: '', marca: '', modelo: '', specs: {}, acessorios: '', obs: '' };
  const estilo = 'style="font-family:var(--font-body);"';
  const m = openModal(`
    <h3>${editando ? 'Editar equipamento' : 'Novo equipamento'}</h3>
    <div class="field"><label>Cliente</label>
      <select id="eq-cliente" ${estilo}>${store.clientes.map((c) => `<option value="${esc(c.id)}" ${c.id === e.clienteId ? 'selected' : ''}>${esc(c.nome)}</option>`).join('')}</select>
      <button type="button" class="link-btn" id="eq-novo-cliente" style="margin-top:6px;">+ Cadastrar novo cliente</button></div>
    <div class="field"><label>Nome do equipamento</label><input type="text" id="eq-nome" value="${esc(e.nome)}" placeholder="Ex: Dell G15" ${estilo}></div>
    <div class="field"><label>Tipo</label>
      <select id="eq-tipo" ${estilo}>${TIPOS_EQUIPAMENTO.map((t) => `<option value="${t}" ${t === e.tipo ? 'selected' : ''}>${rotuloTipo(t)}</option>`).join('')}</select></div>
    <div class="field"><label>Número de série</label><input type="text" id="eq-serie" value="${esc(e.serie)}" placeholder="Da etiqueta ou do sistema" ${estilo}></div>
    <div class="field"><label>Patrimônio / identificação do cliente</label><input type="text" id="eq-pat" value="${esc(e.patrimonio)}" placeholder="Ex: 03 ou CINZA" ${estilo}></div>
    <div class="field"><label>Marca</label><input type="text" id="eq-marca" value="${esc(e.marca)}" ${estilo}></div>
    <div class="field"><label>Modelo</label><input type="text" id="eq-modelo" value="${esc(e.modelo)}" ${estilo}></div>
    <div id="eq-specs">${SPECS.map(([k, rotulo, dica]) =>
      `<div class="field"><label>${rotulo}</label><input type="text" data-spec="${k}" value="${esc(e.specs?.[k])}" placeholder="${esc(dica)}" ${estilo}></div>`).join('')}</div>
    <div class="field"><label>Outros / acessórios</label><textarea id="eq-acess" ${estilo}>${esc(e.acessorios)}</textarea></div>
    <div class="field"><label>Observação</label><textarea id="eq-obs" ${estilo}>${esc(e.obs)}</textarea></div>
    <div class="err" id="eq-erro"></div>
    <div class="modal-actions">
      <button class="btn-secondary" id="eq-cancelar">Cancelar</button>
      <button class="btn-small-primary" id="eq-salvar">${editando ? 'Salvar' : 'Cadastrar'}</button>
    </div>`);
  const specsBox = m.querySelector('#eq-specs');
  const alternarSpecs = () => { specsBox.style.display = m.querySelector('#eq-tipo').value === 'informatica' ? '' : 'none'; };
  m.querySelector('#eq-tipo').onchange = alternarSpecs;
  alternarSpecs();
  m.querySelector('#eq-cancelar').onclick = closeModal;
  m.querySelector('#eq-novo-cliente').onclick = () =>
    abrirFormCliente(null, (novo) => { closeModal(); abrirFormEquipamento(id, novo.id, aoSalvar); });

  const coletar = () => {
    const tipo = m.querySelector('#eq-tipo').value;
    const serie = m.querySelector('#eq-serie').value.trim();
    return {
      ...(editando ? e : {}),
      clienteId: m.querySelector('#eq-cliente').value,
      nome: m.querySelector('#eq-nome').value.trim(),
      tipo,
      serie,
      serieNorm: normalizeSerial(serie),
      patrimonio: m.querySelector('#eq-pat').value.trim(),
      marca: m.querySelector('#eq-marca').value.trim(),
      modelo: m.querySelector('#eq-modelo').value.trim(),
      specs: tipo === 'informatica'
        ? Object.fromEntries([...m.querySelectorAll('[data-spec]')].map((i) => [i.dataset.spec, i.value.trim()]))
        : {},
      acessorios: m.querySelector('#eq-acess').value.trim(),
      obs: m.querySelector('#eq-obs').value.trim(),
    };
  };

  const gravar = async (dados, botao) => {
    try {
      const salvo = await repo.saveEquipamento(dados);
      closeModal();
      toast(editando ? 'Equipamento atualizado.' : 'Equipamento cadastrado.');
      aoSalvar?.(salvo);
    } catch (err) {
      m.querySelector('#eq-erro').textContent = err.message;
      if (botao) botao.disabled = false;
    }
  };

  m.querySelector('#eq-salvar').onclick = (ev) => {
    const botao = ev.currentTarget;
    const dados = coletar();
    const dup = findDuplicateEquip(store.equipamentos, { ...dados, id: editando ? e.id : undefined });
    if (!dup) { botao.disabled = true; gravar(dados, botao); return; }
    const mesmaSerie = normalizeSerial(dup.serie) && normalizeSerial(dup.serie) === normalizeSerial(dados.serie);
    closeModal();
    const aviso = openModal(`
      <h3>Esse equipamento já existe</h3>
      <p style="color:var(--text-dim); font-size:13.5px; margin:0 0 8px;">
        “${esc(dup.nome)}”${dup.serie ? ` (série ${esc(dup.serie)})` : ''} já está cadastrado para ${esc(clienteById(dup.clienteId)?.nome)}.</p>
      <p style="color:var(--text-dim); font-size:13.5px; margin:0 0 18px;">
        ${mesmaSerie
          ? 'O número de série é o mesmo, então é o mesmo aparelho. Edite o cadastro existente para não duplicar o histórico.'
          : 'Se for o mesmo aparelho, edite o existente. Se for outra unidade física, pode criar mesmo assim.'}</p>
      <div class="modal-actions">
        ${mesmaSerie ? '' : '<button class="btn-secondary" id="dup-criar">Criar mesmo assim</button>'}
        <button class="btn-small-primary" id="dup-editar">Editar o existente</button>
      </div>`);
    aviso.querySelector('#dup-editar').onclick = () => { closeModal(); abrirFormEquipamento(dup.id, null, aoSalvar); };
    const criar = aviso.querySelector('#dup-criar');
    if (criar) criar.onclick = async () => { closeModal(); try { const s = await repo.saveEquipamento(dados); toast('Equipamento cadastrado.'); aoSalvar?.(s); } catch (err) { toast(err.message); } };
  };
}
