import { store, repo, guardarLocal, servicoById, equipById, clienteById, subscribeLogDe } from '../data/store.js';
import { esc, toast, confirmar, fmtData, hojeStr } from '../ui.js';
import { STATUS_LIST, ETAPAS } from '../domain/status.js';
import { calcMargem, formatBRL } from '../domain/finance.js';
import { diasRestantes } from '../domain/prazo.js';
import { rotuloTipo, specsLinha } from '../domain/equipamento.js';
import { abrirFormEquipamento } from './equipamentos.js';

let pararLog = null;

const LABELS = {
  status: 'Status', relatoCliente: 'Relato do cliente', diagnostico: 'Diagnóstico', acoes: 'Ações realizadas',
  recomendacoes: 'Recomendações', dataEntrada: 'Data de entrada', dataInicio: 'Início do serviço', previsaoEntrega: 'Previsão',
  dataConclusao: 'Conclusão', valorCobrado: 'Valor cobrado', pago: 'Pago', dataPagamento: 'Data do pagamento',
  garantiaDias: 'Garantia (dias)', garantiaObs: 'Condições da garantia', obs: 'Observação interna',
  clienteId: 'Cliente', equipamentoId: 'Equipamento', 'terceiro.custo': 'Custo do terceiro', 'terceiro.nome': 'Terceiro',
};

const linhas = (texto) => texto.split('\n').map((l) => l.trim()).filter(Boolean);
const num = (v) => (v === '' || v === null || v === undefined || !Number.isFinite(Number(v)) ? null : Number(v));

export async function render(container, { param, navigate }) {
  pararLog?.();
  pararLog = null;
  const [idBruto, consulta = ''] = (param || 'novo').split('?');
  const novo = idBruto === 'novo';
  const existente = novo ? null : servicoById(idBruto);
  if (!novo && !existente) {
    container.innerHTML = '<div class="empty">Serviço não encontrado.</div>';
    return;
  }
  const equipPreset = new URLSearchParams(consulta).get('equip');
  const equipInicial = equipPreset ? equipById(equipPreset) : null;
  const s = existente ?? {
    clienteId: equipInicial?.clienteId ?? '', equipamentoId: equipInicial?.id ?? '', status: 'Recebido',
    relatoCliente: '', diagnostico: '', acoes: [], recomendacoes: [], dataEntrada: hojeStr(), dataInicio: '',
    previsaoEntrega: '', dataConclusao: '', valorCobrado: null, pago: false, dataPagamento: '', garantiaDias: null,
    garantiaObs: '', terceiro: null, obs: '',
  };
  const t = s.terceiro ?? { nome: '', contato: '', enviadoEm: '', diagnosticoEm: '', aprovadoEm: '', emConsertoEm: '', devolvidoEm: '', prazoDias: '', custo: '', garantiaDias: '' };
  const F = 'style="font-family:var(--font-body);"';
  const clientes = [...store.clientes].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));

  container.innerHTML = `
    <div class="page-head">
      <div><h2>${novo ? 'Novo serviço' : esc(s.id)}</h2><p id="sv-sub"></p></div>
      <div class="acoes-topo">
        ${novo ? '' : '<button class="btn-secondary" id="sv-pdf">Gerar relatório (PDF)</button><button class="btn-secondary row-btn-danger" id="sv-excluir">Excluir</button>'}
        <button class="btn-small-primary" id="sv-salvar">${novo ? 'Criar serviço' : 'Salvar'}</button>
      </div>
    </div>

    <div class="etapas" id="sv-etapas"></div>
    <div class="field" style="max-width:320px;"><label>Status</label>
      <select class="select" id="sv-status" style="width:100%;">${STATUS_LIST.map((x) => `<option ${x === s.status ? 'selected' : ''}>${esc(x)}</option>`).join('')}</select></div>

    <div class="bloco">
      <div class="grade-2">
        <div class="field"><label>Cliente</label>
          <select id="sv-cliente" ${F}><option value="">— escolha —</option>${clientes.map((c) => `<option value="${esc(c.id)}" ${c.id === s.clienteId ? 'selected' : ''}>${esc(c.nome)}</option>`).join('')}</select></div>
        <div class="field"><label>Equipamento</label>
          <select id="sv-equip" ${F}></select>
          <button type="button" class="link-btn" id="sv-novo-equip" style="margin-top:6px;">+ Cadastrar novo equipamento</button></div>
      </div>
      <div class="hint" id="sv-equip-info" style="margin:0;"></div>
    </div>

    <div class="bloco">
      <div class="field"><label>Relato do cliente <span class="hint-inline">(como ele descreveu — não é alterado pelo diagnóstico)</span></label>
        <textarea id="sv-relato" rows="3" ${F}>${esc(s.relatoCliente)}</textarea></div>
      <div class="field"><label>Diagnóstico técnico</label>
        <textarea id="sv-diag" rows="3" ${F}>${esc(s.diagnostico)}</textarea></div>
      <div class="grade-2">
        <div class="field"><label>Ações realizadas <span class="hint-inline">(uma por linha)</span></label>
          <textarea id="sv-acoes" rows="6" ${F}>${esc((s.acoes ?? []).join('\n'))}</textarea></div>
        <div class="field"><label>Recomendações ao cliente <span class="hint-inline">(uma por linha)</span></label>
          <textarea id="sv-recs" rows="6" ${F}>${esc((s.recomendacoes ?? []).join('\n'))}</textarea></div>
      </div>
    </div>

    <div class="bloco">
      <div class="grade-4">
        <div class="field"><label>Entrada</label><input type="date" id="sv-entrada" value="${esc(s.dataEntrada)}" ${F}></div>
        <div class="field"><label>Início do serviço</label><input type="date" id="sv-inicio" value="${esc(s.dataInicio)}" ${F}></div>
        <div class="field"><label>Previsão de entrega</label><input type="date" id="sv-previsao" value="${esc(s.previsaoEntrega)}" ${F}></div>
        <div class="field"><label>Conclusão</label><input type="date" id="sv-conclusao" value="${esc(s.dataConclusao)}" ${F}></div>
      </div>
    </div>

    <div class="bloco">
      <label class="check-linha"><input type="checkbox" id="sv-terc-on" ${s.terceiro ? 'checked' : ''}> Serviço terceirizado (levado a outra oficina)</label>
      <div id="sv-terc" style="display:${s.terceiro ? 'block' : 'none'}; margin-top:12px;">
        <div class="grade-2">
          <div class="field"><label>Quem está com o aparelho</label><input type="text" id="t-nome" value="${esc(t.nome)}" ${F}></div>
          <div class="field"><label>Contato</label><input type="text" id="t-contato" value="${esc(t.contato)}" ${F}></div>
        </div>
        <div class="grade-4">
          <div class="field"><label>Enviado em</label><input type="date" id="t-enviado" value="${esc(t.enviadoEm)}" ${F}></div>
          <div class="field"><label>Diagnóstico recebido</label><input type="date" id="t-diag" value="${esc(t.diagnosticoEm)}" ${F}></div>
          <div class="field"><label>Orçamento aprovado</label><input type="date" id="t-aprov" value="${esc(t.aprovadoEm)}" ${F}></div>
          <div class="field"><label>Em conserto desde</label><input type="date" id="t-conserto" value="${esc(t.emConsertoEm)}" ${F}></div>
        </div>
        <div class="grade-4">
          <div class="field"><label>Devolvido em</label><input type="date" id="t-devolvido" value="${esc(t.devolvidoEm)}" ${F}></div>
          <div class="field"><label>Prazo prometido (dias)</label><input type="number" min="0" id="t-prazo" value="${esc(t.prazoDias)}" ${F}></div>
          <div class="field"><label>Custo do terceiro (R$)</label><input type="number" min="0" step="0.01" id="t-custo" value="${esc(t.custo)}" ${F}></div>
          <div class="field"><label>Garantia do terceiro (dias)</label><input type="number" min="0" id="t-garantia" value="${esc(t.garantiaDias)}" ${F}></div>
        </div>
        <div class="hint" id="t-prazo-info" style="margin:0;"></div>
      </div>
    </div>

    <div class="bloco">
      <div class="valores">
        <div class="field"><label>Valor cobrado do cliente (R$)</label><input type="number" min="0" step="0.01" id="sv-valor" value="${s.valorCobrado ?? ''}" ${F}></div>
        <div class="valor-card" id="sv-margem-card"><small>Sobra para a Garage</small><b id="sv-margem">—</b></div>
        <div class="field"><label>Pagamento</label>
          <label class="check-linha" style="margin-top:8px;"><input type="checkbox" id="sv-pago" ${s.pago ? 'checked' : ''}> Já foi pago</label></div>
        <div class="field"><label>Data do pagamento</label><input type="date" id="sv-datapag" value="${esc(s.dataPagamento)}" ${F}></div>
      </div>
      <div class="grade-2" style="margin-top:12px;">
        <div class="field"><label>Garantia do serviço (dias)</label><input type="number" min="0" id="sv-garantia" value="${s.garantiaDias ?? ''}" ${F}></div>
        <div class="field"><label>Condições da garantia</label><input type="text" id="sv-garantia-obs" value="${esc(s.garantiaObs)}" ${F}></div>
      </div>
    </div>

    <div class="bloco">
      <div class="field"><label>Observação interna <span class="hint-inline">(não aparece no relatório do cliente)</span></label>
        <textarea id="sv-obs" rows="2" ${F}>${esc(s.obs)}</textarea></div>
    </div>

    <div class="err" id="sv-erro" role="alert"></div>

    ${novo ? '' : `<div class="bloco"><h3 style="margin:0 0 10px; font-size:15px; font-family:var(--font-display);">Histórico de alterações</h3><div id="sv-log" class="hint" style="margin:0;">Carregando…</div></div>`}
  `;

  const $ = (id) => document.getElementById(id);
  const statusEl = $('sv-status');

  /* ---- etapas ---- */
  const desenharEtapas = () => {
    const atual = statusEl.value;
    $('sv-etapas').innerHTML = ETAPAS.map((e) => {
      const i = ETAPAS.indexOf(e);
      const ia = ETAPAS.indexOf(atual);
      const cls = e === atual ? 'atual' : ia > i && ia !== -1 ? 'feita' : '';
      return `<button type="button" class="etapa ${cls}" data-etapa="${esc(e)}">${cls === 'feita' ? '✔ ' : ''}${esc(e)}</button>`;
    }).join('') + (!ETAPAS.includes(atual) ? `<span class="etapa atual">${esc(atual)}</span>` : '');
    $('sv-etapas').querySelectorAll('[data-etapa]').forEach((b) => (b.onclick = () => { statusEl.value = b.dataset.etapa; desenharEtapas(); }));
  };
  statusEl.onchange = desenharEtapas;
  desenharEtapas();

  /* ---- cliente / equipamento ---- */
  let equipId = s.equipamentoId;
  const desenharEquip = () => {
    const cid = $('sv-cliente').value;
    const lista = store.equipamentos.filter((e) => e.clienteId === cid).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
    $('sv-equip').innerHTML = `<option value="">— escolha —</option>${lista.map((e) => `<option value="${esc(e.id)}" ${e.id === equipId ? 'selected' : ''}>${esc(e.nome)}${e.serie ? ` · série ${esc(e.serie)}` : e.patrimonio ? ` · ${esc(e.patrimonio)}` : ''}</option>`).join('')}`;
    infoEquip();
  };
  const infoEquip = () => {
    const e = equipById($('sv-equip').value);
    $('sv-equip-info').textContent = e ? [rotuloTipo(e.tipo), specsLinha(e)].filter(Boolean).join(' · ') : '';
    $('sv-sub').textContent = e ? `${e.nome} · ${clienteById(e.clienteId)?.nome ?? ''}` : '';
  };
  $('sv-cliente').onchange = () => { equipId = ''; desenharEquip(); };
  $('sv-equip').onchange = () => { equipId = $('sv-equip').value; infoEquip(); };
  $('sv-novo-equip').onclick = () => {
    if (!$('sv-cliente').value) { toast('Escolha o cliente primeiro.'); return; }
    abrirFormEquipamento(null, $('sv-cliente').value, (novoEq) => { equipId = novoEq.id; desenharEquip(); });
  };
  desenharEquip();

  /* ---- terceiro, prazo e margem ---- */
  const lerTerceiro = () => ({
    nome: $('t-nome').value.trim(), contato: $('t-contato').value.trim(),
    enviadoEm: $('t-enviado').value, diagnosticoEm: $('t-diag').value, aprovadoEm: $('t-aprov').value,
    emConsertoEm: $('t-conserto').value, devolvidoEm: $('t-devolvido').value,
    prazoDias: num($('t-prazo').value), custo: num($('t-custo').value), garantiaDias: num($('t-garantia').value),
  });
  const atualizarCalculos = () => {
    const ligado = $('sv-terc-on').checked;
    $('sv-terc').style.display = ligado ? 'block' : 'none';
    const terc = ligado ? lerTerceiro() : null;
    const margem = calcMargem({ valorCobrado: num($('sv-valor').value), terceiro: terc });
    $('sv-margem').textContent = margem === null ? '—' : formatBRL(margem);
    $('sv-margem-card').style.display = ligado ? '' : 'none';
    const r = ligado ? diasRestantes(terc, hojeStr()) : null;
    $('t-prazo-info').textContent = r === null ? '' : r >= 0 ? `Restam ${r} dia(s) do prazo prometido.` : `Prazo estourado há ${-r} dia(s).`;
  };
  ['sv-terc-on', 'sv-valor', 't-enviado', 't-prazo', 't-custo'].forEach((id) => ($(id).oninput = atualizarCalculos));
  $('sv-terc-on').onchange = () => {
    if ($('sv-terc-on').checked && statusEl.value !== 'No terceiro' && !s.terceiro) { statusEl.value = 'No terceiro'; desenharEtapas(); }
    atualizarCalculos();
  };
  atualizarCalculos();

  /* ---- salvar ---- */
  $('sv-salvar').onclick = async (ev) => {
    const botao = ev.currentTarget;
    $('sv-erro').textContent = '';
    const status = statusEl.value;
    let conclusao = $('sv-conclusao').value;
    if (['Concluído', 'Entregue ao cliente'].includes(status) && !conclusao) conclusao = hojeStr();
    const dados = {
      ...(existente ?? {}),
      clienteId: $('sv-cliente').value, equipamentoId: $('sv-equip').value, status,
      relatoCliente: $('sv-relato').value.trim(), diagnostico: $('sv-diag').value.trim(),
      acoes: linhas($('sv-acoes').value), recomendacoes: linhas($('sv-recs').value),
      dataEntrada: $('sv-entrada').value, dataInicio: $('sv-inicio').value, previsaoEntrega: $('sv-previsao').value, dataConclusao: conclusao,
      valorCobrado: num($('sv-valor').value), pago: $('sv-pago').checked, dataPagamento: $('sv-datapag').value,
      garantiaDias: num($('sv-garantia').value), garantiaObs: $('sv-garantia-obs').value.trim(),
      terceiro: $('sv-terc-on').checked ? lerTerceiro() : null, obs: $('sv-obs').value.trim(),
    };
    botao.disabled = true;
    try {
      const salvo = await repo.saveServico(dados);
      guardarLocal('servicos', salvo);
      toast(novo ? `Serviço ${salvo.id} criado.` : 'Serviço salvo.');
      if (novo) navigate(`servico/${salvo.id}`);
      else {
        $('sv-conclusao').value = salvo.dataConclusao ?? ''; // data preenchida automaticamente ao concluir
        botao.disabled = false;
      }
    } catch (e) {
      $('sv-erro').textContent = e.message;
      botao.disabled = false;
    }
  };

  if (!novo) {
    $('sv-excluir').onclick = async () => {
      if (!(await confirmar(`Excluir ${s.id}?`, 'A exclusão fica registrada no histórico de alterações.', 'Excluir', true))) return;
      try { await repo.removeServico(s.id); toast('Serviço excluído.'); navigate('inicio'); } catch (e) { toast(e.message); }
    };
    $('sv-pdf').onclick = async () => {
      try {
        const { gerarRelatorio } = await import('../pdf/relatorio.js');
        await gerarRelatorio(s.id);
      } catch (e) { toast('Não foi possível gerar o relatório: ' + e.message); }
    };
    pararLog = subscribeLogDe(s.id, (entradas) => {
      const alvo = document.getElementById('sv-log');
      if (!alvo) return;
      if (!entradas.length) { alvo.textContent = 'Nenhuma alteração registrada ainda.'; return; }
      alvo.innerHTML = entradas.map((l) => {
        const quando = new Date(l.em).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
        const verbo = { criar: 'criou', editar: 'editou', excluir: 'excluiu', migrar: 'migrou' }[l.acao] ?? l.acao;
        const mud = l.acao === 'editar'
          ? (l.mudancas ?? []).slice(0, 6).map((m) => `<div class="log-mud">${esc(LABELS[m.campo] ?? m.campo)}: <s>${esc(resumo(m.antes))}</s> → ${esc(resumo(m.depois))}</div>`).join('')
          : '';
        return `<div class="log-item"><b>${esc(quando)}</b> — ${esc(l.por?.nome)} ${verbo}${mud}</div>`;
      }).join('');
    });
  }
}

function resumo(v) {
  if (v === null || v === undefined || v === '') return '(vazio)';
  if (typeof v === 'boolean') return v ? 'sim' : 'não';
  if (Array.isArray(v)) return `${v.length} item(ns)`;
  const t = String(v);
  return t.length > 40 ? t.slice(0, 40) + '…' : t;
}
