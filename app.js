import { firebaseConfig } from './firebase-config.js';
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-app.js";
import { getAuth, signInAnonymously, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js";
import {
  getFirestore, doc, getDoc, setDoc, collection, getDocs, writeBatch
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

const STATUS_META = {
  "Em andamento":                    { color:"#E8A33D", bg:"#3a2c10", pulse:true },
  "Aguardando peça":                 { color:"#E8A33D", bg:"#3a2c10", pulse:false },
  "Concluído":                       { color:"#3FBFA8", bg:"#123b34", pulse:false },
  "Entregue ao cliente":             { color:"#5B8DEF", bg:"#182645", pulse:false },
  "Sem conserto – peças aproveitadas": { color:"#E2574C", bg:"#3a1918", pulse:false },
};
const STATUS_LIST = Object.keys(STATUS_META);

let AUTH = null;    // { adminPassword, clients: [{id, nome, pin}] }  -> Firestore: config/auth
let ORDENS = [];     // Firestore: collection "ordens", doc id = OS number
let session = { role: null, clientId: null };
let loginTab = 'cliente';
let adminTab = 'ordens';
let adminSearch = '';
let adminStatusFilter = '';
let ready = false;

const $app = document.getElementById('app');

function todayStr(){ return new Date().toISOString().slice(0,10); }
function fmtDate(d){
  if(!d) return '—';
  const dt = new Date(d + 'T00:00:00');
  if(isNaN(dt)) return d;
  return dt.toLocaleDateString('pt-BR');
}
function uid(prefix){ return prefix + '-' + Math.random().toString(36).slice(2,8); }
function nextOsId(){
  const nums = ORDENS.map(o => parseInt((o.id||'').replace(/\D/g,''),10)).filter(n=>!isNaN(n));
  const next = (nums.length ? Math.max(...nums) : 0) + 1;
  return 'OS-' + String(next).padStart(4,'0');
}

function defaultSeed(){
  const clientId = 'cli-stageav';
  const auth = {
    adminPassword: 'garage1240',
    clients: [ { id: clientId, nome: 'Stage Audio Visual', pin: '2026' } ]
  };
  const base = [
    ["Lenovo","03","2026-07-21","Concluído"],
    ["Alienware - aurora","","2026-07-21","Concluído"],
    ["Dell G15","03","2026-07-21","Concluído"],
    ["Alienware - aurora","","2026-07-21","Concluído"],
    ["ACER NITRO","05","2026-07-21","Concluído"],
    ["Lenovo","01","2026-07-22","Concluído"],
    ["ASUS","01","2026-07-22","Concluído"],
    ["NITRO 5","03","2026-07-22","Concluído"],
    ["DESKTOP CINZA","CINZA","2026-07-22","Concluído"],
    ["DESKTOP VERMELHO","VERMELHO","2026-07-22","Concluído"],
    ["Dell G15","02","2026-07-23","Concluído"],
  ];
  const ordens = base.map(([equip, pat, data, status], i) => ({
    id: 'OS-' + String(i+1).padStart(4,'0'),
    clienteId: clientId,
    equipamento: equip,
    patrimonio: pat,
    defeito: 'Formatação + Clone de imagem (Macrium)',
    status: status,
    dataEntrada: '',
    dataConclusao: data,
    pecas: '',
    obs: '',
    historico: [{ data: data, status: status, texto: 'Serviço concluído.' }]
  }));
  ordens.push({
    id: 'OS-' + String(ordens.length+1).padStart(4,'0'),
    clienteId: clientId,
    equipamento: 'Dell G15 (não listado no inventário)',
    patrimonio: '',
    defeito: 'Em verificação — defeito ainda não diagnosticado',
    status: 'Sem conserto – peças aproveitadas',
    dataEntrada: '',
    dataConclusao: '',
    pecas: '',
    obs: 'Conserto não compensa financeiramente.',
    historico: [{ data: todayStr(), status: 'Sem conserto – peças aproveitadas', texto: 'Avaliação: conserto não compensa financeiramente. Peças serão aproveitadas.' }]
  });
  return { auth, ordens };
}

/* ---------------- FIRESTORE I/O ---------------- */
async function loadData(){
  const authSnap = await getDoc(doc(db, 'config', 'auth'));
  const ordensSnap = await getDocs(collection(db, 'ordens'));

  if(!authSnap.exists() || ordensSnap.empty){
    const seed = defaultSeed();
    AUTH = seed.auth;
    ORDENS = seed.ordens;
    await setDoc(doc(db, 'config', 'auth'), AUTH);
    const batch = writeBatch(db);
    ORDENS.forEach(o => batch.set(doc(db, 'ordens', o.id), o));
    await batch.commit();
  } else {
    AUTH = authSnap.data();
    ORDENS = ordensSnap.docs.map(d => d.data());
  }
}
async function saveAuth(){
  try{ await setDoc(doc(db, 'config', 'auth'), AUTH); }
  catch(e){ showToast('Erro ao salvar dados de acesso: ' + e.message); }
}
async function saveOrdem(o){
  try{ await setDoc(doc(db, 'ordens', o.id), o); }
  catch(e){ showToast('Erro ao salvar O.S.: ' + e.message); }
}

function showToast(msg){
  let t = document.getElementById('toast');
  if(!t){
    t = document.createElement('div');
    t.id = 'toast'; t.className = 'toast';
    document.body.appendChild(t);
  }
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(t._timer);
  t._timer = setTimeout(()=> t.classList.remove('show'), 2600);
}

/* ---------------- RENDER ROOT ---------------- */
function render(){
  if(session.role === 'client') return renderClientDashboard();
  if(session.role === 'admin') return renderAdminDashboard();
  return renderLogin();
}

/* ---------------- LOGIN ---------------- */
function renderLogin(){
  $app.innerHTML = `
    <div class="topbar">
      <div class="brand">
        <div class="dot"></div>
        <div class="brand-text">PORTAL DE SERVIÇOS<small>Acompanhamento de equipamentos</small></div>
      </div>
    </div>
    <div class="login-wrap">
      <div class="ticket">
        <div class="ticket-head">
          <h1>Acompanhe sua O.S.</h1>
          <p>Consulte o histórico e status dos equipamentos que passaram ou estão com a gente.</p>
        </div>
        <div class="tabs">
          <button class="tab ${loginTab==='cliente'?'active':''}" id="tab-cliente">Sou cliente</button>
          <button class="tab ${loginTab==='oficina'?'active':''}" id="tab-oficina">Área da oficina</button>
        </div>
        <div class="ticket-body" id="login-body"></div>
      </div>
    </div>
  `;
  document.getElementById('tab-cliente').onclick = () => { loginTab='cliente'; render(); };
  document.getElementById('tab-oficina').onclick = () => { loginTab='oficina'; render(); };
  renderLoginBody();
}

function renderLoginBody(){
  const box = document.getElementById('login-body');
  if(loginTab === 'cliente'){
    box.innerHTML = `
      <div class="field">
        <label>PIN de acesso</label>
        <input type="password" inputmode="numeric" id="pin-input" placeholder="•••• ••••" maxlength="10">
      </div>
      <button class="btn-primary" id="pin-submit">Entrar</button>
      <div class="err" id="login-err"></div>
      <div class="hint">O PIN é fornecido pela oficina. Cada cliente tem um código próprio.</div>
    `;
    document.getElementById('pin-submit').onclick = tryClientLogin;
    document.getElementById('pin-input').addEventListener('keydown', e => { if(e.key==='Enter') tryClientLogin(); });
  } else {
    box.innerHTML = `
      <div class="field">
        <label>Senha da oficina</label>
        <input type="password" id="pass-input" placeholder="••••••••">
      </div>
      <button class="btn-primary" id="pass-submit">Entrar</button>
      <div class="err" id="login-err"></div>
      <div class="hint">Acesso restrito à equipe (Rafael / Eduardo).</div>
    `;
    document.getElementById('pass-submit').onclick = tryAdminLogin;
    document.getElementById('pass-input').addEventListener('keydown', e => { if(e.key==='Enter') tryAdminLogin(); });
  }
}

function tryClientLogin(){
  const pin = document.getElementById('pin-input').value.trim();
  const client = AUTH.clients.find(c => c.pin === pin);
  const err = document.getElementById('login-err');
  if(!client){ err.textContent = 'PIN inválido. Verifique com a oficina.'; return; }
  session = { role:'client', clientId: client.id };
  render();
}
function tryAdminLogin(){
  const pass = document.getElementById('pass-input').value;
  const err = document.getElementById('login-err');
  if(pass !== AUTH.adminPassword){ err.textContent = 'Senha incorreta.'; return; }
  session = { role:'admin', clientId:null };
  adminTab = 'ordens';
  render();
}
function logout(){ session = { role:null, clientId:null }; render(); }

/* ---------------- CLIENT DASHBOARD ---------------- */
function renderClientDashboard(){
  const client = AUTH.clients.find(c => c.id === session.clientId);
  const meus = ORDENS.filter(o => o.clienteId === session.clientId)
                      .sort((a,b) => (b.dataConclusao||b.dataEntrada||'').localeCompare(a.dataConclusao||a.dataEntrada||''));
  $app.innerHTML = `
    <div class="topbar">
      <div class="brand">
        <div class="dot"></div>
        <div class="brand-text">PORTAL DE SERVIÇOS<small>${client ? client.nome : ''}</small></div>
      </div>
      <div class="topbar-right">
        <button class="btn-ghost" id="logout-btn">Sair</button>
      </div>
    </div>
    <div class="content">
      <div class="page-head">
        <div>
          <h2>Seus equipamentos</h2>
          <p>${meus.length} ordem${meus.length===1?'':'ns'} de serviço registrada${meus.length===1?'':'s'}</p>
        </div>
      </div>
      <div id="os-grid"></div>
    </div>
  `;
  document.getElementById('logout-btn').onclick = logout;
  const grid = document.getElementById('os-grid');
  if(meus.length === 0){
    grid.innerHTML = `<div class="empty">Nenhum equipamento registrado ainda.</div>`;
  } else {
    grid.className = 'os-grid';
    grid.innerHTML = meus.map(osCardHTML).join('');
  }
}

function osCardHTML(o){
  const meta = STATUS_META[o.status] || STATUS_META['Em andamento'];
  const hist = (o.historico||[]).slice().sort((a,b)=> (a.data||'').localeCompare(b.data||''));
  return `
    <div class="os-card" style="--status-color:${meta.color}; --status-bg:${meta.bg};">
      <div class="os-top">
        <span class="os-id">${o.id}</span>
        <span class="status-pill ${meta.pulse?'pulse':''}"><span class="led"></span>${o.status}</span>
      </div>
      <div class="os-equip">${escapeHTML(o.equipamento)}</div>
      <div class="os-meta">
        ${o.patrimonio ? `Patrimônio <span>${escapeHTML(o.patrimonio)}</span> · ` : ''}
        Entrada <span>${fmtDate(o.dataEntrada) !== '—' ? fmtDate(o.dataEntrada) : '—'}</span>
        ${o.dataConclusao ? ` · Conclusão <span>${fmtDate(o.dataConclusao)}</span>` : ''}
      </div>
      ${o.defeito ? `<div class="os-defeito">${escapeHTML(o.defeito)}</div>` : ''}
      ${hist.length ? `
        <div class="timeline">
          ${hist.map(h => `
            <div class="timeline-item">
              <div class="timeline-dot"></div>
              <div class="timeline-date">${fmtDate(h.data)}</div>
              <div class="timeline-text"><strong>${escapeHTML(h.status)}</strong>${h.texto ? ' — '+escapeHTML(h.texto) : ''}</div>
            </div>
          `).join('')}
        </div>
      ` : ''}
      ${o.obs ? `<div class="os-defeito" style="margin-top:10px; margin-bottom:0;">${escapeHTML(o.obs)}</div>` : ''}
    </div>
  `;
}

function escapeHTML(str){
  if(str === null || str === undefined) return '';
  return String(str).replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
}

/* ---------------- ADMIN DASHBOARD ---------------- */
function renderAdminDashboard(){
  $app.innerHTML = `
    <div class="topbar">
      <div class="brand">
        <div class="dot"></div>
        <div class="brand-text">PORTAL DE SERVIÇOS<small>Área da oficina</small></div>
      </div>
      <div class="topbar-right">
        <button class="btn-ghost" id="logout-btn">Sair</button>
      </div>
    </div>
    <div class="content">
      <div class="page-head">
        <div>
          <h2>Painel administrativo</h2>
          <p>Rafael / Eduardo — (41) 9131-2064 — garage1240.oficial@gmail.com</p>
        </div>
      </div>
      <div class="admin-tabs">
        <button class="admin-tab ${adminTab==='ordens'?'active':''}" id="at-ordens">Ordens de Serviço</button>
        <button class="admin-tab ${adminTab==='clientes'?'active':''}" id="at-clientes">Clientes</button>
        <button class="admin-tab ${adminTab==='config'?'active':''}" id="at-config">Configurações</button>
      </div>
      <div id="admin-body"></div>
    </div>
  `;
  document.getElementById('logout-btn').onclick = logout;
  document.getElementById('at-ordens').onclick = () => { adminTab='ordens'; render(); };
  document.getElementById('at-clientes').onclick = () => { adminTab='clientes'; render(); };
  document.getElementById('at-config').onclick = () => { adminTab='config'; render(); };
  if(adminTab==='ordens') renderAdminOrdens();
  else if(adminTab==='clientes') renderAdminClientes();
  else renderAdminConfig();
}

function clientNome(id){
  const c = AUTH.clients.find(c=>c.id===id);
  return c ? c.nome : '—';
}

function renderAdminOrdens(){
  const body = document.getElementById('admin-body');
  body.innerHTML = `
    <div class="toolbar">
      <div style="display:flex; gap:10px; flex-wrap:wrap;">
        <input class="search-input" id="search-os" placeholder="Buscar equipamento, patrimônio, OS..." value="${escapeHTML(adminSearch)}">
        <select class="select" id="filter-status">
          <option value="">Todos os status</option>
          ${STATUS_LIST.map(s=>`<option value="${s}" ${adminStatusFilter===s?'selected':''}>${s}</option>`).join('')}
        </select>
      </div>
      <button class="btn-small-primary" id="new-os-btn">+ Nova O.S.</button>
    </div>
    <div id="os-table-wrap"></div>
  `;
  document.getElementById('search-os').oninput = (e) => { adminSearch = e.target.value; renderOsTable(); };
  document.getElementById('filter-status').onchange = (e) => { adminStatusFilter = e.target.value; renderOsTable(); };
  document.getElementById('new-os-btn').onclick = () => openOsModal(null);
  renderOsTable();
}

function renderOsTable(){
  const wrap = document.getElementById('os-table-wrap');
  const q = adminSearch.toLowerCase();
  let list = ORDENS.filter(o => {
    const matchesQ = !q || [o.id,o.equipamento,o.patrimonio,clientNome(o.clienteId)].join(' ').toLowerCase().includes(q);
    const matchesStatus = !adminStatusFilter || o.status === adminStatusFilter;
    return matchesQ && matchesStatus;
  }).sort((a,b) => b.id.localeCompare(a.id));

  if(list.length === 0){
    wrap.innerHTML = `<div class="empty">Nenhuma O.S. encontrada.</div>`;
    return;
  }
  wrap.innerHTML = `
    <table>
      <thead><tr>
        <th>O.S.</th><th>Cliente</th><th>Equipamento</th><th>Patrimônio</th><th>Status</th><th>Conclusão</th><th></th>
      </tr></thead>
      <tbody>
        ${list.map(o => {
          const meta = STATUS_META[o.status] || STATUS_META['Em andamento'];
          return `
          <tr>
            <td data-label="O.S."><span class="os-id">${o.id}</span></td>
            <td data-label="Cliente">${escapeHTML(clientNome(o.clienteId))}</td>
            <td data-label="Equipamento">${escapeHTML(o.equipamento)}</td>
            <td data-label="Patrimônio">${escapeHTML(o.patrimonio)||'—'}</td>
            <td data-label="Status"><span class="status-pill ${meta.pulse?'pulse':''}" style="--status-color:${meta.color}; color:${meta.color}; background:${meta.bg};"><span class="led"></span>${o.status}</span></td>
            <td data-label="Conclusão">${fmtDate(o.dataConclusao)}</td>
            <td data-label="">
              <button class="row-btn" data-edit="${o.id}">Editar</button>
              <button class="row-btn" data-hist="${o.id}">+ Status</button>
            </td>
          </tr>`;
        }).join('')}
      </tbody>
    </table>
  `;
  wrap.querySelectorAll('[data-edit]').forEach(b => b.onclick = () => openOsModal(b.dataset.edit));
  wrap.querySelectorAll('[data-hist]').forEach(b => b.onclick = () => openHistModal(b.dataset.hist));
}

function renderAdminClientes(){
  const body = document.getElementById('admin-body');
  body.innerHTML = `
    <div class="toolbar">
      <div></div>
      <button class="btn-small-primary" id="new-client-btn">+ Novo cliente</button>
    </div>
    <table>
      <thead><tr><th>Cliente</th><th>PIN</th><th>Ordens vinculadas</th><th></th></tr></thead>
      <tbody>
        ${AUTH.clients.map(c => `
          <tr>
            <td data-label="Cliente">${escapeHTML(c.nome)}</td>
            <td data-label="PIN"><span class="pin-code">${escapeHTML(c.pin)}</span></td>
            <td data-label="Ordens">${ORDENS.filter(o=>o.clienteId===c.id).length}</td>
            <td data-label=""><button class="row-btn" data-editc="${c.id}">Editar</button></td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
  document.getElementById('new-client-btn').onclick = () => openClientModal(null);
  body.querySelectorAll('[data-editc]').forEach(b => b.onclick = () => openClientModal(b.dataset.editc));
}

function renderAdminConfig(){
  const body = document.getElementById('admin-body');
  body.innerHTML = `
    <div class="ticket" style="width:420px; max-width:100%;">
      <div class="ticket-body" style="padding-top:26px;">
        <div class="field">
          <label>Senha da oficina</label>
          <input type="text" id="admin-pass-field" value="${escapeHTML(AUTH.adminPassword)}">
        </div>
        <button class="btn-primary" id="save-pass-btn">Salvar senha</button>
        <div class="hint">Essa é a senha usada na aba "Área da oficina" na tela de login. Fica salva no Firestore, no documento config/auth.</div>
      </div>
    </div>
  `;
  document.getElementById('save-pass-btn').onclick = async () => {
    const val = document.getElementById('admin-pass-field').value.trim();
    if(!val){ showToast('Informe uma senha.'); return; }
    AUTH.adminPassword = val;
    await saveAuth();
    showToast('Senha atualizada.');
  };
}

/* ---------------- MODALS ---------------- */
function openModal(html){
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.id = 'modal-overlay';
  overlay.innerHTML = `<div class="modal">${html}</div>`;
  overlay.addEventListener('click', (e) => { if(e.target === overlay) closeModal(); });
  document.body.appendChild(overlay);
}
function closeModal(){
  const el = document.getElementById('modal-overlay');
  if(el) el.remove();
}

function openOsModal(id){
  const editing = !!id;
  const o = editing ? ORDENS.find(x=>x.id===id) : {
    id: nextOsId(), clienteId: AUTH.clients[0]?.id || '', equipamento:'', patrimonio:'',
    defeito:'', status:'Em andamento', dataEntrada: todayStr(), dataConclusao:'', pecas:'', obs:'', historico:[]
  };
  openModal(`
    <h3>${editing ? 'Editar ' + o.id : 'Nova Ordem de Serviço'}</h3>
    <div class="field"><label>Cliente</label>
      <select id="m-cliente">
        ${AUTH.clients.map(c=>`<option value="${c.id}" ${c.id===o.clienteId?'selected':''}>${escapeHTML(c.nome)}</option>`).join('')}
      </select>
    </div>
    <div class="field"><label>Equipamento</label><input type="text" id="m-equip" value="${escapeHTML(o.equipamento)}" placeholder="Ex: Dell G15"></div>
    <div class="field"><label>Nº Patrimônio / identificação</label><input type="text" id="m-pat" value="${escapeHTML(o.patrimonio)}" placeholder="Ex: 03 ou CINZA"></div>
    <div class="field"><label>Serviço / defeito relatado</label><textarea id="m-defeito">${escapeHTML(o.defeito)}</textarea></div>
    <div class="field"><label>Status atual</label>
      <select id="m-status">${STATUS_LIST.map(s=>`<option value="${s}" ${s===o.status?'selected':''}>${s}</option>`).join('')}</select>
    </div>
    <div class="field"><label>Data de entrada</label><input type="date" id="m-entrada" value="${o.dataEntrada||''}"></div>
    <div class="field"><label>Data de conclusão / entrega</label><input type="date" id="m-conclusao" value="${o.dataConclusao||''}"></div>
    <div class="field"><label>Peças aproveitadas (se houver)</label><input type="text" id="m-pecas" value="${escapeHTML(o.pecas)}"></div>
    <div class="field"><label>Observação</label><textarea id="m-obs">${escapeHTML(o.obs)}</textarea></div>
    <div class="modal-actions">
      <button class="btn-secondary" id="m-cancel">Cancelar</button>
      <button class="btn-small-primary" id="m-save">${editing?'Salvar':'Criar O.S.'}</button>
    </div>
  `);
  document.getElementById('m-cancel').onclick = closeModal;
  document.getElementById('m-save').onclick = async () => {
    const data = {
      clienteId: document.getElementById('m-cliente').value,
      equipamento: document.getElementById('m-equip').value.trim(),
      patrimonio: document.getElementById('m-pat').value.trim(),
      defeito: document.getElementById('m-defeito').value.trim(),
      status: document.getElementById('m-status').value,
      dataEntrada: document.getElementById('m-entrada').value,
      dataConclusao: document.getElementById('m-conclusao').value,
      pecas: document.getElementById('m-pecas').value.trim(),
      obs: document.getElementById('m-obs').value.trim(),
    };
    if(!data.equipamento){ showToast('Informe o equipamento.'); return; }
    let target;
    if(editing){
      Object.assign(o, data);
      target = o;
    } else {
      target = { id: o.id, historico: [{data: data.dataEntrada || todayStr(), status: data.status, texto:'O.S. aberta.'}], ...data };
      ORDENS.push(target);
    }
    await saveOrdem(target);
    closeModal();
    render();
    showToast(editing ? 'O.S. atualizada.' : 'O.S. criada.');
  };
}

function openHistModal(id){
  const o = ORDENS.find(x=>x.id===id);
  openModal(`
    <h3>Atualizar status — ${o.id}</h3>
    <div class="field"><label>Novo status</label>
      <select id="h-status">${STATUS_LIST.map(s=>`<option value="${s}" ${s===o.status?'selected':''}>${s}</option>`).join('')}</select>
    </div>
    <div class="field"><label>Data</label><input type="date" id="h-data" value="${todayStr()}"></div>
    <div class="field"><label>Observação (aparece para o cliente)</label><textarea id="h-texto" placeholder="Ex: peça a caminho, previsão de 3 dias"></textarea></div>
    <div class="modal-actions">
      <button class="btn-secondary" id="h-cancel">Cancelar</button>
      <button class="btn-small-primary" id="h-save">Adicionar</button>
    </div>
  `);
  document.getElementById('h-cancel').onclick = closeModal;
  document.getElementById('h-save').onclick = async () => {
    const status = document.getElementById('h-status').value;
    const data = document.getElementById('h-data').value || todayStr();
    const texto = document.getElementById('h-texto').value.trim();
    o.status = status;
    if(status === 'Concluído' || status === 'Entregue ao cliente'){ o.dataConclusao = data; }
    o.historico = o.historico || [];
    o.historico.push({ data, status, texto });
    await saveOrdem(o);
    closeModal();
    render();
    showToast('Status atualizado.');
  };
}

function openClientModal(id){
  const editing = !!id;
  const c = editing ? AUTH.clients.find(x=>x.id===id) : { id: uid('cli'), nome:'', pin:'' };
  openModal(`
    <h3>${editing?'Editar cliente':'Novo cliente'}</h3>
    <div class="field"><label>Nome do cliente</label><input type="text" id="c-nome" value="${escapeHTML(c.nome)}" placeholder="Ex: Stage Audio Visual"></div>
    <div class="field"><label>PIN de acesso</label><input type="text" id="c-pin" value="${escapeHTML(c.pin)}" placeholder="Ex: 4821"></div>
    <div class="modal-actions">
      <button class="btn-secondary" id="c-cancel">Cancelar</button>
      <button class="btn-small-primary" id="c-save">${editing?'Salvar':'Criar cliente'}</button>
    </div>
  `);
  document.getElementById('c-cancel').onclick = closeModal;
  document.getElementById('c-save').onclick = async () => {
    const nome = document.getElementById('c-nome').value.trim();
    const pin = document.getElementById('c-pin').value.trim();
    if(!nome || !pin){ showToast('Preencha nome e PIN.'); return; }
    const dup = AUTH.clients.find(x => x.pin === pin && x.id !== c.id);
    if(dup){ showToast('Esse PIN já está em uso por outro cliente.'); return; }
    if(editing){
      c.nome = nome; c.pin = pin;
    } else {
      AUTH.clients.push({ id:c.id, nome, pin });
    }
    await saveAuth();
    closeModal();
    render();
    showToast(editing?'Cliente atualizado.':'Cliente criado.');
  };
}

/* ---------------- INIT ---------------- */
(async function init(){
  try{
    await new Promise((resolve, reject) => {
      onAuthStateChanged(auth, (user) => {
        if(user){ resolve(user); }
      }, reject);
      signInAnonymously(auth).catch(reject);
    });
    await loadData();
    ready = true;
    render();
  }catch(e){
    $app.innerHTML = `<div class="loading">Erro ao conectar no Firestore: ${escapeHTML(e.message)}<br><br>Confira se preencheu firebase-config.js e se o Firestore/Authentication (Anônimo) estão ativados no seu projeto Firebase.</div>`;
  }
})();
