import { store, repo, guardarLocal, servicoById, equipById, clienteById, subscribeLogDe } from '../data/store.js';
import { esc, toast, confirmar, fmtData, hojeStr, openModal, closeModal } from '../ui.js';
import { STATUS_LIST, ETAPAS, rotuloStatus, dataDeConclusao } from '../domain/status.js';
import { calcMargem, formatBRL } from '../domain/finance.js';
import { diasRestantes } from '../domain/prazo.js';
import { rotuloTipo, specsLinha } from '../domain/equipamento.js';
import { abrirFormEquipamento } from './equipamentos.js';
import { resumoChecklist, itensPara, definirResposta, linkDaOs, enderecoSoDoComputador } from '../domain/checklist.js';
import { ABAS, ROTULO_PAPEL, abaDaEtapa, abaInicial } from '../domain/papeis.js';
import { currentUsuario } from '../auth.js';
import { enviarFoto, apagarArquivo } from '../data/fotos.js';
import { MAX_FOTOS, removerFoto } from '../domain/fotos.js';
import { definirBusca as buscarEquipamento } from './equipamentos.js';
import { definirBusca as buscarCliente } from './clientes.js';
import { vizinhos, filaAtual } from '../domain/vizinhos.js';
import { FORMAS_PAGAMENTO } from '../domain/cobranca.js';

let pararLog = null;
let atualizarFotosDeFora = null;

// Chamada quando os dados mudam (por exemplo, uma foto chegou do celular): só atualiza a grade de fotos.
export function update() {
  atualizarFotosDeFora?.();
}

const LABELS = {
  status: 'Status', relatoCliente: 'Relato do cliente', diagnostico: 'Diagnóstico', acoes: 'Ações realizadas',
  recomendacoes: 'Recomendações', dataEntrada: 'Data de entrada', dataInicio: 'Início do serviço', previsaoEntrega: 'Previsão',
  dataConclusao: 'Conclusão', valorCobrado: 'Valor cobrado', pago: 'Pago', dataPagamento: 'Data do pagamento',
  garantiaDias: 'Garantia (dias)', garantiaObs: 'Condições da garantia', obs: 'Observação interna',
  senhaAcesso: 'Senha de acesso', formaPagamento: 'Forma de pagamento', tecnicoResponsavel: 'Responsável técnico', pecas: 'Peças necessárias', checklistObs: 'Conferência de entrada (observação)',
  fotos: 'Fotos', clienteId: 'Cliente', equipamentoId: 'Equipamento', 'terceiro.custo': 'Custo do terceiro', 'terceiro.nome': 'Terceiro',
};

// O gerador de QR só é baixado quando alguém pede o código.
function carregarQr() {
  if (window.qrcode) return Promise.resolve(window.qrcode);
  return new Promise((resolve, reject) => {
    const sc = document.createElement('script');
    sc.src = 'https://cdnjs.cloudflare.com/ajax/libs/qrcode-generator/1.4.4/qrcode.min.js';
    sc.onload = () => resolve(window.qrcode);
    sc.onerror = () => reject(new Error('Não foi possível carregar o gerador de QR. Verifique a internet.'));
    document.head.appendChild(sc);
  });
}

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
  const papel = currentUsuario()?.papel ?? 'admin';
  const equipPreset = new URLSearchParams(consulta).get('equip');
  const equipInicial = equipPreset ? equipById(equipPreset) : null;
  const s = existente ?? {
    clienteId: equipInicial?.clienteId ?? '', equipamentoId: equipInicial?.id ?? '', status: 'Recebido',
    relatoCliente: '', diagnostico: '', acoes: [], recomendacoes: [], dataEntrada: hojeStr(), dataInicio: '',
    previsaoEntrega: '', dataConclusao: '', valorCobrado: null, pago: false, dataPagamento: '', garantiaDias: null,
    garantiaObs: '', terceiro: null, obs: '', tecnicoResponsavel: '', pecas: '', formaPagamento: '',
  };
  const t = s.terceiro ?? { nome: '', contato: '', enviadoEm: '', diagnosticoEm: '', aprovadoEm: '', emConsertoEm: '', devolvidoEm: '', prazoDias: '', custo: '', garantiaDias: '' };
  const F = 'style="font-family:var(--font-body);"';
  const clientes = [...store.clientes].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));

  container.innerHTML = `
    <div class="page-head">
      <div><h2 class="titulo-os">${novo ? 'Novo serviço' : `<button type="button" class="seta-os" id="sv-ant" aria-label="O.S. anterior" title="O.S. anterior">‹</button>${esc(s.id)}<button type="button" class="seta-os" id="sv-prox" aria-label="Próxima O.S." title="Próxima O.S.">›</button>`}</h2><p id="sv-sub"></p></div>
      <div class="acoes-topo">
        <span class="hint" id="sv-sujo" style="margin:0; align-self:center; color:var(--amber); display:none;">Alterações não salvas</span>
        ${novo ? '' : '<button class="btn-secondary" id="sv-qr">QR para o celular</button><button class="btn-secondary" id="sv-pdf">Gerar relatório (PDF)</button><button class="btn-secondary row-btn-danger" id="sv-excluir">Excluir</button>'}
        <button class="btn-small-primary" id="sv-salvar">${novo ? 'Criar serviço' : 'Salvar'}</button>
      </div>
    </div>

    <div class="ficha-links">
      <button type="button" class="link-chip" id="lk-cliente"><small>Cliente</small><b id="lk-cliente-t">—</b></button>
      <button type="button" class="link-chip" id="lk-equip"><small>Equipamento</small><b id="lk-equip-t">—</b></button>
      <button type="button" class="link-chip" data-ir-aba="recepcao"><small>Entrada</small><b id="lk-entrada-t">—</b></button>
      <button type="button" class="link-chip" data-ir-aba="tecnico"><small>Responsável técnico</small><b id="lk-tec-t">—</b></button>
      <span class="papel-selo" title="Seu papel no sistema">${esc(ROTULO_PAPEL[papel])}</span>
    </div>

    <div class="etapas" id="sv-etapas"></div>
    <div class="status-linha">
      <div class="field" style="max-width:320px; margin:0;"><label>Status <span class="hint-inline">(para mudar de etapa)</span></label>
        <select class="select" id="sv-status" style="width:100%;">${STATUS_LIST.map((x) => `<option value="${esc(x)}" ${x === s.status ? 'selected' : ''}>${esc(rotuloStatus(x))}</option>`).join('')}</select></div>
      <button type="button" class="btn-secondary" id="sv-avancar" style="display:none;"></button>
    </div>

    <div class="abas" id="sv-abas" role="tablist">
      ${ABAS.map((a) => `<button type="button" class="aba" role="tab" data-aba="${a.id}" title="Quem costuma preencher: ${esc(a.dono)}">${esc(a.rotulo)}<i class="aba-ponto"></i></button>`).join('')}
    </div>

    <section class="painel-aba" data-painel="recepcao">
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
        <div class="field" style="max-width:220px; margin:0;"><label>Data de entrada</label><input type="date" id="sv-entrada" value="${esc(s.dataEntrada)}" ${F}></div>
      </div>

      <div class="bloco" id="sv-fotos">
        <div class="chk-cab">
          <h3 style="margin:0; font-size:15px; font-family:var(--font-display);">Fotos</h3>
          <span class="chk-prog" id="fotos-prog"></span>
        </div>
        ${novo ? '<div class="hint" style="margin:0;">Crie o serviço para anexar fotos. Depois, abra esta O.S. no celular (botão "QR para o celular") e fotografe o aparelho.</div>' : `
        <div class="fotos-grade" id="fotos-grade"></div>
        <div class="fotos-botoes">
          <label class="btn-small-primary btn-grande foto-btn">Tirar foto<input type="file" id="foto-camera" accept="image/*" capture="environment" hidden></label>
          <label class="btn-secondary foto-btn">Escolher do aparelho<input type="file" id="foto-arquivo" accept="image/*" multiple hidden></label>
        </div>`}
      </div>

      <div class="bloco" id="sv-chk">
        <div class="chk-cab">
          <h3 style="margin:0; font-size:15px; font-family:var(--font-display);">Conferência de entrada</h3>
          <span class="chk-prog" id="chk-prog"></span>
        </div>
        <div id="chk-lista"></div>
        ${s.checklistEntrada?.length ? `<div class="hint" style="margin:10px 0 0;">Anotado no sistema antigo: ${esc(s.checklistEntrada.join(' · '))}</div>` : ''}
        <div class="field" style="margin:12px 0 0;"><label>O que estava diferente do normal <span class="hint-inline">(riscos, peças faltando, o que não funciona)</span></label>
          <textarea id="chk-obs" rows="2" ${F}>${esc(s.checklistObs)}</textarea></div>
      </div>

      <div class="bloco">
        <div class="field" style="margin:0;"><label>Observação interna <span class="hint-inline">(não aparece no relatório do cliente)</span></label>
          <textarea id="sv-obs" rows="2" ${F}>${esc(s.obs)}</textarea></div>
      </div>
    </section>

    <section class="painel-aba" data-painel="tecnico" hidden>
      <div class="bloco">
        <div class="grade-2">
          <div class="field"><label>Responsável técnico</label><input type="text" id="sv-tec" value="${esc(s.tecnicoResponsavel)}" ${F}></div>
          <div class="field"><label>Início do serviço</label><input type="date" id="sv-inicio" value="${esc(s.dataInicio)}" ${F}></div>
        </div>
        <div class="field"><label>Diagnóstico técnico</label>
          <textarea id="sv-diag" rows="4" ${F}>${esc(s.diagnostico)}</textarea></div>
        <div class="grade-2">
          <div class="field"><label>Ações realizadas <span class="hint-inline">(uma por linha)</span></label>
            <textarea id="sv-acoes" rows="6" ${F}>${esc((s.acoes ?? []).join('\n'))}</textarea></div>
          <div class="field"><label>Recomendações ao cliente <span class="hint-inline">(uma por linha)</span></label>
            <textarea id="sv-recs" rows="6" ${F}>${esc((s.recomendacoes ?? []).join('\n'))}</textarea></div>
        </div>
        <div class="field" style="margin:0;"><label>Peças necessárias <span class="hint-inline">(só o que precisa; o valor entra no Orçamento)</span></label>
          <textarea id="sv-pecas" rows="2" ${F}>${esc(s.pecas)}</textarea></div>
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
    </section>

    <section class="painel-aba" data-painel="orcamento" hidden>
      <div class="bloco">
        <div class="valores">
          <div class="field"><label>Valor cobrado do cliente (R$)</label><input type="number" min="0" step="0.01" id="sv-valor" value="${s.valorCobrado ?? ''}" ${F}></div>
          <div class="valor-card" id="sv-margem-card"><small>Sobra para a Garage</small><b id="sv-margem">—</b></div>
          <div class="field"><label>Previsão de entrega</label><input type="date" id="sv-previsao" value="${esc(s.previsaoEntrega)}" ${F}></div>
          <div class="field"><label>Garantia do serviço (dias)</label><input type="number" min="0" id="sv-garantia" value="${s.garantiaDias ?? ''}" ${F}></div>
        </div>
        <div class="field" style="margin:12px 0 0;"><label>Condições da garantia</label><input type="text" id="sv-garantia-obs" value="${esc(s.garantiaObs)}" ${F}></div>
      </div>
    </section>

    <section class="painel-aba" data-painel="faturamento" hidden>
      <div class="bloco">
        <div class="fat-topo">
          <div><small class="fat-rotulo">Valor cobrado</small><b class="fat-valor" id="fat-valor">—</b></div>
          <div id="fat-selo"></div>
        </div>
        <div class="grade-4" style="margin-top:14px;">
          <div class="field"><label>Data do pagamento</label><input type="date" id="sv-datapag" value="${esc(s.dataPagamento)}" ${F}></div>
          <div class="field"><label>Forma de pagamento</label>
            <select id="sv-forma" ${F}><option value="">—</option>${FORMAS_PAGAMENTO.map((f) => `<option ${f === s.formaPagamento ? 'selected' : ''}>${esc(f)}</option>`).join('')}</select></div>
          <div class="field"><label>Conclusão do serviço</label><input type="date" id="sv-conclusao" value="${esc(s.dataConclusao)}" ${F}></div>
        </div>
        <div class="fat-acoes" id="fat-acoes"></div>
        <div class="hint" style="margin:10px 0 0;">Marcar como pago salva a O.S. na hora. A retirada sem pagar fica a seu critério: o sistema só avisa.</div>
      </div>
    </section>

    <section class="painel-aba" data-painel="historico" hidden>
      ${novo ? '<div class="bloco"><div class="hint" style="margin:0;">O histórico começa quando o serviço for criado.</div></div>'
        : '<div class="bloco"><h3 style="margin:0 0 10px; font-size:15px; font-family:var(--font-display);">Histórico de alterações</h3><div id="sv-log" class="hint" style="margin:0;">Carregando…</div></div>'}
    </section>

    <div class="err" id="sv-erro" role="alert"></div>
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
      return `<button type="button" class="etapa ${cls}" data-etapa="${esc(e)}">${cls === 'feita' ? '✔ ' : ''}${esc(rotuloStatus(e))}</button>`;
    }).join('') + (!ETAPAS.includes(atual) ? `<span class="etapa atual">${esc(rotuloStatus(atual))}</span>` : '');
    $('sv-etapas').querySelectorAll('[data-etapa]').forEach((b) => {
      b.title = 'Abrir a aba desta etapa (não muda o status)';
      b.onclick = () => abrirAba(abaDaEtapa(b.dataset.etapa));
    });
    const i = ETAPAS.indexOf(atual);
    const proxima = i >= 0 ? ETAPAS[i + 1] : null;
    const btn = $('sv-avancar');
    btn.style.display = proxima ? '' : 'none';
    btn.textContent = proxima ? `Avançar para: ${rotuloStatus(proxima)}` : '';
    btn.onclick = () => { statusEl.value = proxima; marcarSujo(); desenharEtapas(); abrirAba(abaDaEtapa(proxima)); };
    atualizarPendencias();
  };
  statusEl.onchange = desenharEtapas;

  /* ---- aviso de alterações não salvas ---- */
  let sujo = false;
  const marcarSujo = () => { sujo = true; const el = document.getElementById('sv-sujo'); if (el) el.style.display = ''; };
  const limparSujo = () => { sujo = false; const el = document.getElementById('sv-sujo'); if (el) el.style.display = 'none'; };
  container.oninput = marcarSujo;
  container.onchange = marcarSujo;
  window.onbeforeunload = () => (sujo && document.getElementById('sv-sujo') ? 'Há alterações não salvas.' : undefined);

  /* ---- conferência de entrada: numa O.S. já criada, cada toque é salvo na hora ---- */
  let checklist = { ...(s.checklist ?? {}) };
  let senhaAcesso = s.senhaAcesso ?? '';
  let estadoChk = '';
  let timerChk = null;
  const tipoAtual = () => equipById($('sv-equip').value)?.tipo ?? null;
  const atualizarProgresso = () => {
    const el = document.getElementById('chk-prog');
    const tipo = tipoAtual();
    if (!el || !tipo) return;
    const r = resumoChecklist(tipo, checklist);
    el.textContent = `${r.respondidos}/${r.total} respondidas${estadoChk ? ` · ${estadoChk}` : ''}`;
    atualizarPendencias();
  };
  const desenharChecklist = () => {
    const alvo = document.getElementById('chk-lista');
    if (!alvo) return;
    const tipo = tipoAtual();
    if (!tipo) {
      alvo.innerHTML = '<div class="hint" style="margin:0;">Escolha o equipamento para ver as perguntas.</div>';
      $('chk-prog').textContent = '';
      return;
    }
    atualizarProgresso();
    alvo.innerHTML = itensPara(tipo).map((i) => {
      const v = checklist[i.id];
      const botoes = [['sim', 'Sim'], ['nao', 'Não'], ['na', 'N/A']].map(([k, rot]) =>
        `<button type="button" class="chk-op ${k}" data-i="${esc(i.id)}" data-v="${k}" aria-pressed="${v === k}">${rot}</button>`).join('');
      const campo = i.campo
        ? `<div class="chk-campo"><label for="chk-campo-${esc(i.id)}">${esc(i.campo.rotulo)}</label><input type="text" id="chk-campo-${esc(i.id)}" data-campo="${esc(i.campo.nome)}" value="${esc(senhaAcesso)}" autocomplete="off" style="font-family:var(--font-body);"></div>`
        : '';
      return `<div class="chk-bloco"><div class="chk-linha ${v ? '' : 'pend'}"><span class="chk-pergunta">${esc(i.pergunta)}</span><span class="chk-opcoes">${botoes}</span></div>${campo}</div>`;
    }).join('');
    alvo.querySelectorAll('.chk-op').forEach((b) => (b.onclick = () => tocarChecklist(b.dataset.i, b.dataset.v)));
    alvo.querySelectorAll('[data-campo]').forEach((inp) => (inp.oninput = () => { senhaAcesso = inp.value; agendarSalvarChecklist(); }));
  };
  const salvarChecklist = () => salvarEmFila(async () => {
    try {
      const salvo = await repo.saveServico({ ...servicoById(s.id), checklist, senhaAcesso });
      guardarLocal('servicos', salvo);
      estadoChk = 'salvo';
    } catch (e) {
      estadoChk = 'não foi salvo';
      toast(`Não foi possível salvar a conferência: ${e.message}`);
    }
    atualizarProgresso();
  });
  // Numa O.S. já criada, salva sozinho meio segundo depois do último toque ou letra digitada.
  const agendarSalvarChecklist = () => {
    if (novo) { marcarSujo(); estadoChk = ''; } else { estadoChk = 'salvando…'; clearTimeout(timerChk); timerChk = setTimeout(salvarChecklist, 500); }
    atualizarProgresso();
  };
  const tocarChecklist = (id, valor) => {
    checklist = definirResposta(checklist, id, valor);
    agendarSalvarChecklist();
    desenharChecklist();
  };

  /* ---- fotos (só numa O.S. já criada; subir uma foto salva a O.S. na hora) ---- */
  let fotos = [...(s.fotos ?? [])];
  let enviando = false;
  // Salvamentos em fila: uma foto e uma resposta do checklist nunca se sobrescrevem.
  let fila = Promise.resolve();
  const salvarEmFila = (tarefa) => { fila = fila.then(tarefa, tarefa); return fila; };
  const alterarFotos = (transformar) => salvarEmFila(async () => {
    const atual = servicoById(s.id);
    const novas = transformar(atual.fotos ?? []);
    const salvo = await repo.saveServico({ ...atual, fotos: novas });
    guardarLocal('servicos', salvo);
    fotos = novas;
  });
  const desenharFotos = (mensagem = '') => {
    const grade = document.getElementById('fotos-grade');
    if (!grade) return;
    $('fotos-prog').textContent = mensagem || `${fotos.length} foto${fotos.length === 1 ? '' : 's'}`;
    grade.innerHTML = fotos.length
      ? fotos.map((f) => `<div class="foto"><button type="button" class="foto-img" data-ver="${esc(f.id)}" aria-label="Ampliar foto"><img src="${esc(f.url)}" alt="${esc(f.nome)}" loading="lazy"></button><button type="button" class="foto-x" data-del="${esc(f.id)}" aria-label="Remover foto">×</button></div>`).join('')
      : '<div class="hint" style="margin:0;">Nenhuma foto ainda.</div>';
    grade.querySelectorAll('[data-ver]').forEach((b) => (b.onclick = () => {
      const f = fotos.find((x) => x.id === b.dataset.ver);
      if (!f) return;
      const quando = new Date(f.em).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
      const m = openModal(`<img src="${esc(f.url)}" alt="${esc(f.nome)}" style="max-width:100%; max-height:70vh; display:block; margin:0 auto; border-radius:8px;">
        <p class="hint" style="text-align:center;">${esc(quando)}${f.por ? ` · ${esc(f.por)}` : ''}</p>
        <div class="modal-actions"><button class="btn-secondary" data-f>Fechar</button></div>`, 'modal-wide');
      m.querySelector('[data-f]').onclick = closeModal;
    }));
    grade.querySelectorAll('[data-del]').forEach((b) => (b.onclick = async () => {
      const f = fotos.find((x) => x.id === b.dataset.del);
      if (!f || !(await confirmar('Remover esta foto?', 'Ela sai da O.S. e o arquivo é apagado. A remoção fica registrada no histórico.', 'Remover', true))) return;
      try {
        await alterarFotos((lista) => removerFoto(lista, f.id));
        apagarArquivo(f.path);
        desenharFotos();
      } catch (e) { toast(`Não foi possível remover a foto: ${e.message}`); }
    }));
  };
  const aoEscolherFotos = async (ev) => {
    const arquivos = [...ev.target.files];
    ev.target.value = '';
    if (!arquivos.length || enviando) return;
    if (fotos.length + arquivos.length > MAX_FOTOS) { toast(`No máximo ${MAX_FOTOS} fotos por O.S.`); return; }
    enviando = true;
    for (const [i, arquivo] of arquivos.entries()) {
      desenharFotos(`Enviando ${i + 1} de ${arquivos.length}…`);
      try {
        const nova = await enviarFoto(s.id, arquivo, currentUsuario()?.nome);
        await alterarFotos((lista) => [...lista, nova]);
      } catch (e) { toast(e.message); break; }
    }
    enviando = false;
    desenharFotos();
  };
  if (!novo) {
    $('foto-camera').onchange = aoEscolherFotos;
    $('foto-arquivo').onchange = aoEscolherFotos;
    desenharFotos();
    // Foto enviada de outro aparelho (o celular) aparece aqui sozinha.
    atualizarFotosDeFora = () => {
      const atual = servicoById(s.id);
      if (atual && !enviando && document.getElementById('fotos-grade')) { fotos = [...(atual.fotos ?? [])]; desenharFotos(); }
    };
  } else atualizarFotosDeFora = null;

  /* ---- abas por etapa, links do cabeçalho e faturamento ---- */
  let pago = !!s.pago;
  const abrirAba = (id) => {
    container.querySelectorAll('[data-painel]').forEach((p) => { p.hidden = p.dataset.painel !== id; });
    container.querySelectorAll('.aba').forEach((b) => {
      const ativa = b.dataset.aba === id;
      b.classList.toggle('ativa', ativa);
      b.setAttribute('aria-selected', String(ativa));
    });
  };
  container.querySelectorAll('.aba').forEach((b) => (b.onclick = () => abrirAba(b.dataset.aba)));
  container.querySelectorAll('[data-ir-aba]').forEach((b) => (b.onclick = () => abrirAba(b.dataset.irAba)));

  // Ponto âmbar na aba quando falta preencher algo daquela etapa.
  const atualizarPendencias = () => {
    const tipo = tipoAtual();
    const status = statusEl.value;
    const valorVazio = $('sv-valor').value === '';
    const pend = {
      recepcao: !$('sv-relato').value.trim() || (tipo ? !resumoChecklist(tipo, checklist).completo : false),
      tecnico: status !== 'Recebido' && !$('sv-diag').value.trim(),
      orcamento: status === 'Aguardando aprovação' && valorVazio,
      faturamento: ['Concluído', 'Entregue ao cliente'].includes(status) && !pago && !valorVazio,
    };
    container.querySelectorAll('.aba').forEach((b) => b.classList.toggle('pend', !!pend[b.dataset.aba]));
  };

  const atualizarLinks = () => {
    $('lk-cliente-t').textContent = clienteById($('sv-cliente').value)?.nome ?? '—';
    $('lk-equip-t').textContent = equipById($('sv-equip').value)?.nome ?? '—';
    $('lk-entrada-t').textContent = fmtData($('sv-entrada').value) || '—';
    $('lk-tec-t').textContent = $('sv-tec').value.trim() || '—';
  };
  const sairDaFicha = async (ir) => {
    if (sujo && !(await confirmar('Alterações não salvas', 'Se sair agora, o que você digitou e não salvou será perdido.', 'Sair mesmo assim', true))) return;
    ir();
  };
  if (!novo) {
    const { anterior, proxima } = vizinhos(store.servicos, s.id, filaAtual());
    for (const [el, id] of [[$('sv-ant'), anterior], [$('sv-prox'), proxima]]) {
      el.disabled = !id;
      el.onclick = () => id && sairDaFicha(() => navigate(`servico/${id}`));
    }
  }
  $('lk-cliente').onclick = () => {
    const c = clienteById($('sv-cliente').value);
    if (!c) { abrirAba('recepcao'); return; }
    sairDaFicha(() => { buscarCliente(c.nome); navigate('clientes'); });
  };
  $('lk-equip').onclick = () => {
    const e = equipById($('sv-equip').value);
    if (!e) { abrirAba('recepcao'); return; }
    sairDaFicha(() => { buscarEquipamento(e.serie || e.nome); navigate('equipamentos'); });
  };

  const desenharFaturamento = () => {
    const valor = num($('sv-valor').value);
    $('fat-valor').textContent = valor === null ? '—' : formatBRL(valor);
    const quando = $('sv-datapag').value ? ` em ${esc(fmtData($('sv-datapag').value))}` : '';
    const forma = $('sv-forma').value ? ` · ${esc($('sv-forma').value)}` : '';
    if (pago) $('fat-selo').innerHTML = `<span class="selo selo-pago">PAGO</span><small>${quando}${forma}</small>`;
    else if (statusEl.value === 'Entregue ao cliente' && valor !== null) $('fat-selo').innerHTML = '<span class="selo selo-atraso">ENTREGUE E NÃO PAGO</span>';
    else $('fat-selo').innerHTML = '<span class="selo selo-receber">A RECEBER</span>';
    $('fat-acoes').innerHTML = pago
      ? '<button type="button" class="btn-secondary" id="fat-desfazer">Desfazer pagamento</button>'
      : '<button type="button" class="btn-small-primary btn-grande" id="fat-pagar">Marcar como pago</button>';
    const pagar = $('fat-pagar');
    if (pagar) pagar.onclick = () => {
      if (num($('sv-valor').value) === null) { toast('Informe o valor cobrado na aba Orçamento primeiro.'); abrirAba('orcamento'); return; }
      pago = true;
      if (!$('sv-datapag').value) $('sv-datapag').value = hojeStr();
      desenharFaturamento();
      $('sv-salvar').click();
    };
    const desfazer = $('fat-desfazer');
    if (desfazer) desfazer.onclick = async () => {
      if (!(await confirmar('Desfazer o pagamento?', 'A O.S. volta a ficar como "a receber". A mudança fica registrada no histórico.', 'Desfazer', true))) return;
      pago = false;
      $('sv-datapag').value = '';
      $('sv-forma').value = '';
      desenharFaturamento();
      $('sv-salvar').click();
    };
  };

  const aoEditar = () => { marcarSujo(); atualizarLinks(); atualizarPendencias(); desenharFaturamento(); };
  container.oninput = aoEditar;
  container.onchange = aoEditar;

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
    desenharChecklist();
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

  desenharEtapas();
  atualizarLinks();
  desenharFaturamento();
  abrirAba(novo ? 'recepcao' : abaInicial(papel, s.status));

  /* ---- salvar ---- */
  $('sv-salvar').onclick = async (ev) => {
    const botao = ev.currentTarget;
    $('sv-erro').textContent = '';
    const status = statusEl.value;
    let conclusao = $('sv-conclusao').value;
    conclusao = dataDeConclusao(status, conclusao, hojeStr());
    // Passar adiante com a conferência de entrada incompleta é permitido, mas pede confirmação.
    const tipo = tipoAtual();
    if (existente?.status === 'Recebido' && status !== 'Recebido' && tipo) {
      const r = resumoChecklist(tipo, checklist);
      if (!r.completo && !(await confirmar('Conferência de entrada incompleta', `Faltam ${r.faltam.length} pergunta(s) da conferência de entrada. Salvar mesmo assim?`, 'Salvar mesmo assim'))) return;
    }
    const dados = {
      ...(existente ?? {}),
      clienteId: $('sv-cliente').value, equipamentoId: $('sv-equip').value, status,
      relatoCliente: $('sv-relato').value.trim(), diagnostico: $('sv-diag').value.trim(),
      acoes: linhas($('sv-acoes').value), recomendacoes: linhas($('sv-recs').value),
      dataEntrada: $('sv-entrada').value, dataInicio: $('sv-inicio').value, previsaoEntrega: $('sv-previsao').value, dataConclusao: conclusao,
      valorCobrado: num($('sv-valor').value), pago, dataPagamento: $('sv-datapag').value, formaPagamento: $('sv-forma').value,
      tecnicoResponsavel: $('sv-tec').value.trim(), pecas: $('sv-pecas').value.trim(),
      garantiaDias: num($('sv-garantia').value), garantiaObs: $('sv-garantia-obs').value.trim(),
      terceiro: $('sv-terc-on').checked ? lerTerceiro() : null, obs: $('sv-obs').value.trim(),
      checklist, senhaAcesso: senhaAcesso.trim(), checklistObs: $('chk-obs').value.trim(),
      // As fotos podem ter mudado depois que a tela abriu (inclusive vindas do celular): leva as mais recentes.
      ...(novo ? {} : { fotos: servicoById(s.id)?.fotos ?? fotos }),
    };
    botao.disabled = true;
    try {
      clearTimeout(timerChk); // este salvamento já leva o checklist
      const salvo = await repo.saveServico(dados);
      guardarLocal('servicos', salvo);
      limparSujo();
      toast(novo ? `Serviço ${salvo.id} criado.` : 'Serviço salvo.');
      if (novo) navigate(`servico/${salvo.id}`);
      else {
        $('sv-conclusao').value = salvo.dataConclusao ?? ''; // data preenchida automaticamente ao concluir
        desenharFaturamento();
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
    $('sv-qr').onclick = async () => {
      try {
        const qrcode = await carregarQr();
        const url = linkDaOs(location, s.id);
        const qr = qrcode(0, 'M');
        qr.addData(url);
        qr.make();
        const aviso = enderecoSoDoComputador(location.hostname)
          ? '<p class="hint" style="color:var(--amber);">Este endereço (localhost) só abre neste computador. Para o celular ler, o sistema precisa estar aberto pelo endereço da rede ou pelo endereço publicado.</p>'
          : '';
        const m = openModal(`
          <h3>Abrir ${esc(s.id)} no celular</h3>
          <div style="background:#fff; padding:14px; border-radius:10px; width:240px; max-width:100%; margin:0 auto;">${qr.createSvgTag({ cellSize: 4, margin: 0, scalable: true })}</div>
          <p class="hint" style="text-align:center;">Aponte a câmera do celular. Ele precisa estar com o login feito no sistema.</p>
          ${aviso}
          <p class="hint" style="word-break:break-all; user-select:all;">${esc(url)}</p>
          <div class="modal-actions"><button class="btn-secondary" data-f>Fechar</button></div>`);
        m.querySelector('[data-f]').onclick = closeModal;
      } catch (e) { toast(e.message); }
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
          ? (l.mudancas ?? []).slice(0, 6).map((m) => `<div class="log-mud">${esc(rotuloCampo(m.campo))}: <s>${esc(valorDoLog(m.campo, m.antes))}</s> → ${esc(valorDoLog(m.campo, m.depois))}</div>`).join('')
          : '';
        return `<div class="log-item"><b>${esc(quando)}</b> — ${esc(l.por?.nome)} ${verbo}${mud}</div>`;
      }).join('');
    });
  }
}

const PERGUNTAS = Object.fromEntries([...itensPara('informatica'), ...itensPara('outros')].map((i) => [i.id, i.pergunta]));
const RESPOSTA_ROTULO = { sim: 'Sim', nao: 'Não', na: 'N/A' };

function rotuloCampo(campo) {
  if (campo.startsWith('checklist.')) return `Conferência · ${PERGUNTAS[campo.slice(10)] ?? campo.slice(10)}`;
  return LABELS[campo] ?? campo;
}

// No histórico a senha nunca aparece por extenso: só se foi preenchida ou apagada.
function valorDoLog(campo, v) {
  if (campo === 'senhaAcesso') return v ? '••••' : '(vazio)';
  if (campo.startsWith('checklist.') && RESPOSTA_ROTULO[v]) return RESPOSTA_ROTULO[v];
  return resumo(v);
}

function resumo(v) {
  if (v === null || v === undefined || v === '') return '(vazio)';
  if (typeof v === 'boolean') return v ? 'sim' : 'não';
  if (Array.isArray(v)) return `${v.length} item(ns)`;
  const t = String(v);
  return t.length > 40 ? t.slice(0, 40) + '…' : t;
}
