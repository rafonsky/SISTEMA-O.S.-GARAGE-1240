import { firebaseConfig } from './firebase-config.js';
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-app.js";
import { getAuth, signInAnonymously, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js";
import {
  getFirestore, doc, getDoc, setDoc, deleteDoc, collection, getDocs, writeBatch
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
const TIPO_LIST = ["Notebook", "Desktop", "Periférico", "Outro"];

let CONFIG = { adminPassword: 'garage1240', siteUrl: '' };
let CLIENTES = [];     // Firestore: collection "clientes"
let EQUIPAMENTOS = []; // Firestore: collection "equipamentos"
let ORDENS = [];        // Firestore: collection "ordens"
let session = { role: null, clientId: null };
let loginTab = 'cliente';
let adminTab = 'ordens';

let filters = {
  ordens:   { q:'', cliente:'', equipamento:'', status:'' },
  equip:    { q:'', cliente:'', tipo:'' },
  clientes: { q:'' },
  client:   { q:'', status:'' },
};

const $app = document.getElementById('app');

/* ---------------- HELPERS ---------------- */
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
function escapeHTML(str){
  if(str === null || str === undefined) return '';
  return String(str).replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
}
function clienteById(id){ return CLIENTES.find(c=>c.id===id) || null; }
function equipById(id){ return EQUIPAMENTOS.find(e=>e.id===id) || null; }
function clienteNome(id){ const c = clienteById(id); return c ? c.nome : '—'; }
function equipNome(id){ const e = equipById(id); return e ? e.nome : '—'; }
function equipPatrimonio(id){ const e = equipById(id); return e ? e.patrimonio : ''; }
function uniqueSorted(arr){ return [...new Set(arr.filter(Boolean))].sort((a,b)=>a.localeCompare(b,'pt-BR')); }
function normalizePhone(phone){
  let digits = (phone||'').replace(/\D/g,'');
  if(!digits) return '';
  if(digits.length <= 11) digits = '55' + digits; // assume BR, prefix country code
  return digits;
}
function whatsAppLink(phone, message){
  const digits = normalizePhone(phone);
  if(!digits) return null;
  return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;
}
let currentOsList = []; // last rendered/filtered O.S. list, used by export buttons

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

/* ---------------- SEED (fresh install) ---------------- */
function freshSeed(){
  const clientId = 'cli-stageav';
  CONFIG = { adminPassword: 'garage1240', siteUrl: '' };
  CLIENTES = [{ id: clientId, nome: 'Stage Audio Visual', telefone:'', email:'', documento:'', endereco:'', pin: '2026' }];

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
  EQUIPAMENTOS = base.map(([equip, pat], i) => ({
    id: uid('eq'), clienteId: clientId, nome: equip, tipo: /desktop/i.test(equip) ? 'Desktop' : 'Notebook',
    patrimonio: pat, marca:'', modelo:'', obs:''
  }));
  ORDENS = base.map(([equip, pat, data, status], i) => ({
    id: 'OS-' + String(i+1).padStart(4,'0'),
    clienteId: clientId,
    equipamentoId: EQUIPAMENTOS[i].id,
    defeito: 'Formatação + Clone de imagem (Macrium)',
    status: status,
    dataEntrada: '',
    dataConclusao: data,
    pecas: '',
    obs: '',
    historico: [{ data: data, status: status, texto: 'Serviço concluído.' }]
  }));
  const equipExtra = { id: uid('eq'), clienteId: clientId, nome:'Dell G15 (não listado no inventário)', tipo:'Notebook', patrimonio:'', marca:'', modelo:'', obs:'' };
  EQUIPAMENTOS.push(equipExtra);
  ORDENS.push({
    id: 'OS-' + String(ORDENS.length+1).padStart(4,'0'),
    clienteId: clientId,
    equipamentoId: equipExtra.id,
    defeito: 'Em verificação — defeito ainda não diagnosticado',
    status: 'Sem conserto – peças aproveitadas',
    dataEntrada: '', dataConclusao: '', pecas: '',
    obs: 'Conserto não compensa financeiramente.',
    historico: [{ data: todayStr(), status: 'Sem conserto – peças aproveitadas', texto: 'Avaliação: conserto não compensa financeiramente. Peças serão aproveitadas.' }]
  });
}

/* ---------------- FIRESTORE I/O + MIGRATION ---------------- */
async function loadData(){
  const authSnap = await getDoc(doc(db, 'config', 'auth'));
  const clientesSnap = await getDocs(collection(db, 'clientes'));
  const equipSnap = await getDocs(collection(db, 'equipamentos'));
  const ordensSnap = await getDocs(collection(db, 'ordens'));

  const totallyEmpty = !authSnap.exists() && clientesSnap.empty && ordensSnap.empty;

  if(totallyEmpty){
    freshSeed();
    await persistAll();
    return;
  }

  // --- load what exists ---
  const oldAuthData = authSnap.exists() ? authSnap.data() : {};
  CONFIG = { adminPassword: oldAuthData.adminPassword || 'garage1240', siteUrl: oldAuthData.siteUrl || '' };
  CLIENTES = clientesSnap.docs.map(d => d.data());
  EQUIPAMENTOS = equipSnap.docs.map(d => d.data());
  ORDENS = ordensSnap.docs.map(d => d.data());

  let needsSave = false;

  // --- migrate clientes embedded in config/auth (old schema) ---
  if(CLIENTES.length === 0 && Array.isArray(oldAuthData.clients) && oldAuthData.clients.length){
    CLIENTES = oldAuthData.clients.map(c => ({
      id: c.id, nome: c.nome || '', telefone:'', email:'', documento:'', endereco:'', pin: c.pin || ''
    }));
    needsSave = true;
    for(const c of CLIENTES){ await setDoc(doc(db,'clientes', c.id), c); }
  }

  // --- migrate equipamento text embedded in ordens (old schema) ---
  for(const o of ORDENS){
    if(!o.equipamentoId){
      const nome = o.equipamento || 'Equipamento sem nome';
      const patrimonio = o.patrimonio || '';
      let match = EQUIPAMENTOS.find(e => e.clienteId === o.clienteId && e.nome === nome && (e.patrimonio||'') === patrimonio);
      if(!match){
        match = { id: uid('eq'), clienteId: o.clienteId, nome, tipo:'Notebook', patrimonio, marca:'', modelo:'', obs:'' };
        EQUIPAMENTOS.push(match);
        await setDoc(doc(db,'equipamentos', match.id), match);
      }
      o.equipamentoId = match.id;
      delete o.equipamento;
      delete o.patrimonio;
      await setDoc(doc(db,'ordens', o.id), o);
      needsSave = true;
    }
  }

  if(needsSave){
    await setDoc(doc(db, 'config', 'auth'), CONFIG); // strip old "clients" array field
  }
}

async function persistAll(){
  await setDoc(doc(db, 'config', 'auth'), CONFIG);
  const batch = writeBatch(db);
  CLIENTES.forEach(c => batch.set(doc(db, 'clientes', c.id), c));
  EQUIPAMENTOS.forEach(e => batch.set(doc(db, 'equipamentos', e.id), e));
  ORDENS.forEach(o => batch.set(doc(db, 'ordens', o.id), o));
  await batch.commit();
}
async function saveConfig(){ try{ await setDoc(doc(db,'config','auth'), CONFIG); }catch(e){ showToast('Erro ao salvar: '+e.message); } }
async function saveCliente(c){ try{ await setDoc(doc(db,'clientes', c.id), c); }catch(e){ showToast('Erro ao salvar cliente: '+e.message); } }
async function deleteCliente(id){ try{ await deleteDoc(doc(db,'clientes', id)); }catch(e){ showToast('Erro ao excluir: '+e.message); } }
async function saveEquip(e){ try{ await setDoc(doc(db,'equipamentos', e.id), e); }catch(err){ showToast('Erro ao salvar equipamento: '+err.message); } }
async function deleteEquip(id){ try{ await deleteDoc(doc(db,'equipamentos', id)); }catch(e){ showToast('Erro ao excluir: '+e.message); } }
async function saveOrdem(o){ try{ await setDoc(doc(db,'ordens', o.id), o); }catch(e){ showToast('Erro ao salvar O.S.: '+e.message); } }
async function deleteOrdem(id){ try{ await deleteDoc(doc(db,'ordens', id)); }catch(e){ showToast('Erro ao excluir: '+e.message); } }

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
      <div class="brand"><div class="dot"></div>
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
      <div class="field"><label>PIN de acesso</label>
        <input type="password" inputmode="numeric" id="pin-input" placeholder="•••• ••••" maxlength="10"></div>
      <button class="btn-primary" id="pin-submit">Entrar</button>
      <div class="err" id="login-err"></div>
      <div class="hint">O PIN é fornecido pela oficina. Cada cliente tem um código próprio.</div>
    `;
    document.getElementById('pin-submit').onclick = tryClientLogin;
    document.getElementById('pin-input').addEventListener('keydown', e => { if(e.key==='Enter') tryClientLogin(); });
  } else {
    box.innerHTML = `
      <div class="field"><label>Senha da oficina</label><input type="password" id="pass-input" placeholder="••••••••"></div>
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
  const client = CLIENTES.find(c => c.pin === pin);
  const err = document.getElementById('login-err');
  if(!client){ err.textContent = 'PIN inválido. Verifique com a oficina.'; return; }
  session = { role:'client', clientId: client.id };
  filters.client = { q:'', status:'' };
  render();
}
function tryAdminLogin(){
  const pass = document.getElementById('pass-input').value;
  const err = document.getElementById('login-err');
  if(pass !== CONFIG.adminPassword){ err.textContent = 'Senha incorreta.'; return; }
  session = { role:'admin', clientId:null };
  adminTab = 'ordens';
  render();
}
function logout(){ session = { role:null, clientId:null }; render(); }

/* ---------------- STATUS PILL ---------------- */
function statusPill(status){
  const meta = STATUS_META[status] || STATUS_META['Em andamento'];
  return `<span class="status-pill ${meta.pulse?'pulse':''}" style="color:${meta.color}; background:${meta.bg};"><span class="led"></span>${escapeHTML(status)}</span>`;
}

/* ---------------- CLIENT DASHBOARD (list + filters) ---------------- */
function renderClientDashboard(){
  const client = clienteById(session.clientId);
  const all = ORDENS.filter(o => o.clienteId === session.clientId);
  const equipOpts = uniqueSorted(all.map(o => equipNome(o.equipamentoId)));

  $app.innerHTML = `
    <div class="topbar">
      <div class="brand"><div class="dot"></div>
        <div class="brand-text">PORTAL DE SERVIÇOS<small>${escapeHTML(client ? client.nome : '')}</small></div>
      </div>
      <div class="topbar-right"><button class="btn-ghost" id="logout-btn">Sair</button></div>
    </div>
    <div class="content">
      <div class="page-head">
        <div><h2>Seus equipamentos</h2><p>${all.length} ordem${all.length===1?'':'ns'} de serviço registrada${all.length===1?'':'s'}</p></div>
      </div>
      <div class="filter-bar">
        <input class="search-input" id="f-q" placeholder="Buscar equipamento, patrimônio, O.S..." value="${escapeHTML(filters.client.q)}">
        <select class="select" id="f-equip"><option value="">Todos os equipamentos</option>
          ${equipOpts.map(e=>`<option ${filters.client.equip===e?'selected':''}>${escapeHTML(e)}</option>`).join('')}
        </select>
        <select class="select" id="f-status"><option value="">Todos os status</option>
          ${STATUS_LIST.map(s=>`<option value="${s}" ${filters.client.status===s?'selected':''}>${s}</option>`).join('')}
        </select>
      </div>
      <div id="os-table-wrap"></div>
    </div>
  `;
  document.getElementById('logout-btn').onclick = logout;
  document.getElementById('f-q').oninput = e => { filters.client.q = e.target.value; renderClientTable(); };
  document.getElementById('f-equip').onchange = e => { filters.client.equip = e.target.value; renderClientTable(); };
  document.getElementById('f-status').onchange = e => { filters.client.status = e.target.value; renderClientTable(); };
  renderClientTable();
}
function renderClientTable(){
  const wrap = document.getElementById('os-table-wrap');
  const q = (filters.client.q||'').toLowerCase();
  let list = ORDENS.filter(o => o.clienteId === session.clientId).filter(o => {
    const eqNome = equipNome(o.equipamentoId), eqPat = equipPatrimonio(o.equipamentoId);
    const matchesQ = !q || [o.id, eqNome, eqPat].join(' ').toLowerCase().includes(q);
    const matchesEquip = !filters.client.equip || eqNome === filters.client.equip;
    const matchesStatus = !filters.client.status || o.status === filters.client.status;
    return matchesQ && matchesEquip && matchesStatus;
  }).sort((a,b) => (b.dataConclusao||b.dataEntrada||'').localeCompare(a.dataConclusao||a.dataEntrada||''));

  if(list.length === 0){ wrap.innerHTML = `<div class="empty">Nenhum resultado para esse filtro.</div>`; return; }
  wrap.innerHTML = `
    <table><thead><tr>
      <th>O.S.</th><th>Equipamento</th><th>Patrimônio</th><th>Status</th><th>Entrada</th><th>Conclusão</th><th></th>
    </tr></thead><tbody>
      ${list.map(o => `
        <tr>
          <td data-label="O.S."><span class="os-id">${o.id}</span></td>
          <td data-label="Equipamento">${escapeHTML(equipNome(o.equipamentoId))}</td>
          <td data-label="Patrimônio">${escapeHTML(equipPatrimonio(o.equipamentoId))||'—'}</td>
          <td data-label="Status">${statusPill(o.status)}</td>
          <td data-label="Entrada">${fmtDate(o.dataEntrada)}</td>
          <td data-label="Conclusão">${fmtDate(o.dataConclusao)}</td>
          <td data-label=""><button class="row-btn" data-view="${o.id}">Detalhes</button></td>
        </tr>
      `).join('')}
    </tbody></table>
  `;
  wrap.querySelectorAll('[data-view]').forEach(b => b.onclick = () => openOsDetailModal(b.dataset.view));
}
function openOsDetailModal(id){
  const o = ORDENS.find(x=>x.id===id);
  const hist = (o.historico||[]).slice().sort((a,b)=>(a.data||'').localeCompare(b.data||''));
  openModal(`
    <h3>${o.id} — ${escapeHTML(equipNome(o.equipamentoId))}</h3>
    <div class="os-meta" style="margin-bottom:14px;">
      ${equipPatrimonio(o.equipamentoId) ? `Patrimônio <span>${escapeHTML(equipPatrimonio(o.equipamentoId))}</span> · ` : ''}
      Entrada <span>${fmtDate(o.dataEntrada)}</span>${o.dataConclusao ? ` · Conclusão <span>${fmtDate(o.dataConclusao)}</span>`:''}
    </div>
    ${statusPill(o.status)}
    ${o.defeito ? `<div class="os-defeito" style="margin-top:14px;">${escapeHTML(o.defeito)}</div>` : ''}
    ${hist.length ? `<div class="timeline" style="margin-top:14px;">
      ${hist.map(h => `<div class="timeline-item"><div class="timeline-dot"></div>
        <div class="timeline-date">${fmtDate(h.data)}</div>
        <div class="timeline-text"><strong>${escapeHTML(h.status)}</strong>${h.texto?' — '+escapeHTML(h.texto):''}</div></div>`).join('')}
    </div>` : ''}
    ${o.obs ? `<div class="os-defeito" style="margin-top:14px; margin-bottom:0;">${escapeHTML(o.obs)}</div>` : ''}
    <div class="modal-actions"><button class="btn-secondary" id="d-close">Fechar</button></div>
  `);
  document.getElementById('d-close').onclick = closeModal;
}

/* ---------------- ADMIN SHELL ---------------- */
function renderAdminDashboard(){
  $app.innerHTML = `
    <div class="topbar">
      <div class="brand"><div class="dot"></div>
        <div class="brand-text">PORTAL DE SERVIÇOS<small>Área da oficina</small></div>
      </div>
      <div class="topbar-right"><button class="btn-ghost" id="logout-btn">Sair</button></div>
    </div>
    <div class="content">
      <div class="page-head">
        <div><h2>Painel administrativo</h2><p>Rafael / Eduardo — (41) 9131-2064 — garage1240.oficial@gmail.com</p></div>
      </div>
      <div class="admin-tabs">
        <button class="admin-tab ${adminTab==='ordens'?'active':''}" id="at-ordens">Ordens de Serviço</button>
        <button class="admin-tab ${adminTab==='equip'?'active':''}" id="at-equip">Equipamentos</button>
        <button class="admin-tab ${adminTab==='clientes'?'active':''}" id="at-clientes">Clientes</button>
        <button class="admin-tab ${adminTab==='config'?'active':''}" id="at-config">Configurações</button>
      </div>
      <div id="admin-body"></div>
    </div>
  `;
  document.getElementById('logout-btn').onclick = logout;
  document.getElementById('at-ordens').onclick = () => { adminTab='ordens'; render(); };
  document.getElementById('at-equip').onclick = () => { adminTab='equip'; render(); };
  document.getElementById('at-clientes').onclick = () => { adminTab='clientes'; render(); };
  document.getElementById('at-config').onclick = () => { adminTab='config'; render(); };
  if(adminTab==='ordens') renderAdminOrdens();
  else if(adminTab==='equip') renderAdminEquip();
  else if(adminTab==='clientes') renderAdminClientes();
  else renderAdminConfig();
}

/* ---------------- ADMIN · ORDENS ---------------- */
function renderAdminOrdens(){
  const body = document.getElementById('admin-body');
  const clienteOpts = uniqueSorted(CLIENTES.map(c=>c.nome));
  const equipOpts = uniqueSorted(ORDENS.map(o=>equipNome(o.equipamentoId)));
  body.innerHTML = `
    <div class="stats-bar" id="stats-bar"></div>
    <div class="filter-bar">
      <input class="search-input" id="f-q" placeholder="Buscar O.S., equipamento, patrimônio..." value="${escapeHTML(filters.ordens.q)}">
      <select class="select" id="f-cliente"><option value="">Todos os clientes</option>
        ${clienteOpts.map(c=>`<option ${filters.ordens.cliente===c?'selected':''}>${escapeHTML(c)}</option>`).join('')}</select>
      <select class="select" id="f-equip"><option value="">Todos os equipamentos</option>
        ${equipOpts.map(e=>`<option ${filters.ordens.equipamento===e?'selected':''}>${escapeHTML(e)}</option>`).join('')}</select>
      <select class="select" id="f-status"><option value="">Todos os status</option>
        ${STATUS_LIST.map(s=>`<option value="${s}" ${filters.ordens.status===s?'selected':''}>${s}</option>`).join('')}</select>
      <button class="btn-secondary" id="export-csv-btn">Exportar Excel (CSV)</button>
      <button class="btn-secondary" id="export-pdf-btn">Exportar PDF</button>
      <button class="btn-small-primary" id="new-os-btn">+ Nova O.S.</button>
    </div>
    <div id="os-table-wrap"></div>
  `;
  renderStatsBar();
  document.getElementById('f-q').oninput = e => { filters.ordens.q = e.target.value; renderOsTable(); };
  document.getElementById('f-cliente').onchange = e => { filters.ordens.cliente = e.target.value; renderOsTable(); };
  document.getElementById('f-equip').onchange = e => { filters.ordens.equipamento = e.target.value; renderOsTable(); };
  document.getElementById('f-status').onchange = e => { filters.ordens.status = e.target.value; renderOsTable(); };
  document.getElementById('new-os-btn').onclick = () => openOsModal(null);
  document.getElementById('export-csv-btn').onclick = () => exportCSV(currentOsList);
  document.getElementById('export-pdf-btn').onclick = () => exportPDF(currentOsList);
  renderOsTable();
}
function renderStatsBar(){
  const bar = document.getElementById('stats-bar');
  if(!bar) return;
  const total = ORDENS.length;
  const counts = STATUS_LIST.map(s => ({ status:s, n: ORDENS.filter(o=>o.status===s).length }));
  bar.innerHTML = `
    <div class="stat-card ${!filters.ordens.status?'active':''}" data-stat="">
      <div class="stat-n">${total}</div><div class="stat-label">Total de O.S.</div>
    </div>
    ${counts.map(c => `
      <div class="stat-card ${filters.ordens.status===c.status?'active':''}" data-stat="${c.status}" style="--stat-color:${STATUS_META[c.status].color};">
        <div class="stat-n">${c.n}</div><div class="stat-label">${c.status}</div>
      </div>
    `).join('')}
  `;
  bar.querySelectorAll('[data-stat]').forEach(el => el.onclick = () => {
    filters.ordens.status = el.dataset.stat;
    renderAdminOrdens();
  });
}
function renderOsTable(){
  const wrap = document.getElementById('os-table-wrap');
  const q = filters.ordens.q.toLowerCase();
  let list = ORDENS.filter(o => {
    const eqNome = equipNome(o.equipamentoId), eqPat = equipPatrimonio(o.equipamentoId), cliNome = clienteNome(o.clienteId);
    const matchesQ = !q || [o.id, eqNome, eqPat, cliNome].join(' ').toLowerCase().includes(q);
    const matchesCliente = !filters.ordens.cliente || cliNome === filters.ordens.cliente;
    const matchesEquip = !filters.ordens.equipamento || eqNome === filters.ordens.equipamento;
    const matchesStatus = !filters.ordens.status || o.status === filters.ordens.status;
    return matchesQ && matchesCliente && matchesEquip && matchesStatus;
  }).sort((a,b) => b.id.localeCompare(a.id));
  currentOsList = list;

  if(list.length === 0){ wrap.innerHTML = `<div class="empty">Nenhuma O.S. encontrada.</div>`; return; }
  wrap.innerHTML = `
    <table><thead><tr>
      <th>O.S.</th><th>Cliente</th><th>Equipamento</th><th>Patrimônio</th><th>Status</th><th>Conclusão</th><th></th>
    </tr></thead><tbody>
      ${list.map(o => `
        <tr>
          <td data-label="O.S."><span class="os-id">${o.id}</span></td>
          <td data-label="Cliente">${escapeHTML(clienteNome(o.clienteId))}</td>
          <td data-label="Equipamento">${escapeHTML(equipNome(o.equipamentoId))}</td>
          <td data-label="Patrimônio">${escapeHTML(equipPatrimonio(o.equipamentoId))||'—'}</td>
          <td data-label="Status">${statusPill(o.status)}</td>
          <td data-label="Conclusão">${fmtDate(o.dataConclusao)}</td>
          <td data-label="">
            <button class="row-btn" data-edit="${o.id}">Editar</button>
            <button class="row-btn" data-hist="${o.id}">+ Status</button>
            <button class="row-btn row-btn-danger" data-del="${o.id}">Excluir</button>
          </td>
        </tr>
      `).join('')}
    </tbody></table>
  `;
  wrap.querySelectorAll('[data-edit]').forEach(b => b.onclick = () => openOsModal(b.dataset.edit));
  wrap.querySelectorAll('[data-hist]').forEach(b => b.onclick = () => openHistModal(b.dataset.hist));
  wrap.querySelectorAll('[data-del]').forEach(b => b.onclick = () => confirmDelete(
    `Excluir a O.S. ${b.dataset.del}?`, 'Essa ação não pode ser desfeita.',
    async () => {
      await deleteOrdem(b.dataset.del);
      ORDENS = ORDENS.filter(o=>o.id!==b.dataset.del);
      render(); showToast('O.S. excluída.');
    }
  ));
}

function openOsModal(id){
  const editing = !!id;
  const o = editing ? ORDENS.find(x=>x.id===id) : {
    id: nextOsId(), clienteId: CLIENTES[0]?.id || '', equipamentoId:'',
    defeito:'', status:'Em andamento', dataEntrada: todayStr(), dataConclusao:'', pecas:'', obs:'', historico:[]
  };
  renderOsModalBody(o, editing);
}
function renderOsModalBody(o, editing){
  const equipDoCliente = EQUIPAMENTOS.filter(e => e.clienteId === o.clienteId);
  openModal(`
    <h3>${editing ? 'Editar ' + o.id : 'Nova Ordem de Serviço'}</h3>
    <div class="field"><label>Cliente</label>
      <select id="m-cliente">${CLIENTES.map(c=>`<option value="${c.id}" ${c.id===o.clienteId?'selected':''}>${escapeHTML(c.nome)}</option>`).join('')}</select>
    </div>
    <div class="field"><label>Equipamento</label>
      <select id="m-equip">
        <option value="">— Selecione —</option>
        ${equipDoCliente.map(e=>`<option value="${e.id}" ${e.id===o.equipamentoId?'selected':''}>${escapeHTML(e.nome)}${e.patrimonio?' ('+escapeHTML(e.patrimonio)+')':''}</option>`).join('')}
      </select>
      <div style="margin-top:6px;"><button type="button" class="row-btn" id="m-new-equip">+ Cadastrar novo equipamento</button></div>
    </div>
    <div class="field"><label>Serviço / defeito relatado</label><textarea id="m-defeito">${escapeHTML(o.defeito)}</textarea></div>
    <div class="field"><label>Status atual</label>
      <select id="m-status">${STATUS_LIST.map(s=>`<option value="${s}" ${s===o.status?'selected':''}>${s}</option>`).join('')}</select></div>
    <div class="field"><label>Data de entrada</label><input type="date" id="m-entrada" value="${o.dataEntrada||''}"></div>
    <div class="field"><label>Data de conclusão / entrega</label><input type="date" id="m-conclusao" value="${o.dataConclusao||''}"></div>
    <div class="field"><label>Peças aproveitadas (se houver)</label><input type="text" id="m-pecas" value="${escapeHTML(o.pecas)}"></div>
    <div class="field"><label>Observação</label><textarea id="m-obs">${escapeHTML(o.obs)}</textarea></div>
    <div class="modal-actions">
      <button class="btn-secondary" id="m-cancel">Cancelar</button>
      <button class="btn-small-primary" id="m-save">${editing?'Salvar':'Criar O.S.'}</button>
    </div>
  `);
  document.getElementById('m-cliente').onchange = (e) => { o.clienteId = e.target.value; o.equipamentoId=''; closeModal(); renderOsModalBody(o, editing); };
  document.getElementById('m-new-equip').onclick = () => {
    if(!o.clienteId){ showToast('Escolha um cliente primeiro.'); return; }
    openEquipModal(null, o.clienteId, (novo) => { o.equipamentoId = novo.id; closeModal(); renderOsModalBody(o, editing); });
  };
  document.getElementById('m-cancel').onclick = closeModal;
  document.getElementById('m-save').onclick = async () => {
    const data = {
      clienteId: document.getElementById('m-cliente').value,
      equipamentoId: document.getElementById('m-equip').value,
      defeito: document.getElementById('m-defeito').value.trim(),
      status: document.getElementById('m-status').value,
      dataEntrada: document.getElementById('m-entrada').value,
      dataConclusao: document.getElementById('m-conclusao').value,
      pecas: document.getElementById('m-pecas').value.trim(),
      obs: document.getElementById('m-obs').value.trim(),
    };
    if(!data.equipamentoId){ showToast('Selecione (ou cadastre) o equipamento.'); return; }
    let target;
    if(editing){ Object.assign(o, data); target = o; }
    else { target = { id:o.id, historico:[{data:data.dataEntrada||todayStr(), status:data.status, texto:'O.S. aberta.'}], ...data }; ORDENS.push(target); }
    await saveOrdem(target);
    closeModal(); render();
    showToast(editing ? 'O.S. atualizada.' : 'O.S. criada.');
  };
}

function openHistModal(id){
  const o = ORDENS.find(x=>x.id===id);
  const c = clienteById(o.clienteId);
  openModal(`
    <h3>Atualizar status — ${o.id}</h3>
    <div class="field"><label>Novo status</label>
      <select id="h-status">${STATUS_LIST.map(s=>`<option value="${s}" ${s===o.status?'selected':''}>${s}</option>`).join('')}</select></div>
    <div class="field"><label>Data</label><input type="date" id="h-data" value="${todayStr()}"></div>
    <div class="field"><label>Observação (aparece para o cliente)</label><textarea id="h-texto" placeholder="Ex: peça a caminho, previsão de 3 dias"></textarea></div>
    ${c && c.telefone ? `
    <div class="field" style="display:flex; align-items:center; gap:8px;">
      <input type="checkbox" id="h-avisar" checked style="width:auto;">
      <label for="h-avisar" style="margin:0;">Avisar ${escapeHTML(c.nome)} por WhatsApp</label>
    </div>` : ''}
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
    const avisar = document.getElementById('h-avisar')?.checked;
    o.status = status;
    if(status === 'Concluído' || status === 'Entregue ao cliente'){ o.dataConclusao = data; }
    o.historico = o.historico || [];
    o.historico.push({ data, status, texto });
    await saveOrdem(o);
    closeModal();
    if(avisar && c && c.telefone){
      const link = CONFIG.siteUrl ? `\n\nAcompanhe em: ${CONFIG.siteUrl}` : '';
      const msg = `Olá, ${c.nome}! Atualização da sua O.S. ${o.id} (${equipNome(o.equipamentoId)}):\n\nNovo status: ${status}${texto ? '\n'+texto : ''}${link}`;
      const url = whatsAppLink(c.telefone, msg);
      if(url) window.open(url, '_blank');
    }
    render();
    showToast('Status atualizado.');
  };
}

/* ---------------- ADMIN · EQUIPAMENTOS ---------------- */
function renderAdminEquip(){
  const body = document.getElementById('admin-body');
  const clienteOpts = uniqueSorted(CLIENTES.map(c=>c.nome));
  body.innerHTML = `
    <div class="filter-bar">
      <input class="search-input" id="f-q" placeholder="Buscar equipamento, patrimônio..." value="${escapeHTML(filters.equip.q)}">
      <select class="select" id="f-cliente"><option value="">Todos os clientes</option>
        ${clienteOpts.map(c=>`<option ${filters.equip.cliente===c?'selected':''}>${escapeHTML(c)}</option>`).join('')}</select>
      <select class="select" id="f-tipo"><option value="">Todos os tipos</option>
        ${TIPO_LIST.map(t=>`<option ${filters.equip.tipo===t?'selected':''}>${t}</option>`).join('')}</select>
      <button class="btn-small-primary" id="new-equip-btn">+ Novo equipamento</button>
    </div>
    <div id="equip-table-wrap"></div>
  `;
  document.getElementById('f-q').oninput = e => { filters.equip.q = e.target.value; renderEquipTable(); };
  document.getElementById('f-cliente').onchange = e => { filters.equip.cliente = e.target.value; renderEquipTable(); };
  document.getElementById('f-tipo').onchange = e => { filters.equip.tipo = e.target.value; renderEquipTable(); };
  document.getElementById('new-equip-btn').onclick = () => openEquipModal(null, CLIENTES[0]?.id || '');
  renderEquipTable();
}
function renderEquipTable(){
  const wrap = document.getElementById('equip-table-wrap');
  const q = filters.equip.q.toLowerCase();
  let list = EQUIPAMENTOS.filter(e => {
    const cliNome = clienteNome(e.clienteId);
    const matchesQ = !q || [e.nome, e.patrimonio, e.marca, e.modelo, cliNome].join(' ').toLowerCase().includes(q);
    const matchesCliente = !filters.equip.cliente || cliNome === filters.equip.cliente;
    const matchesTipo = !filters.equip.tipo || e.tipo === filters.equip.tipo;
    return matchesQ && matchesCliente && matchesTipo;
  }).sort((a,b) => a.nome.localeCompare(b.nome,'pt-BR'));

  if(list.length === 0){ wrap.innerHTML = `<div class="empty">Nenhum equipamento encontrado.</div>`; return; }
  wrap.innerHTML = `
    <table><thead><tr>
      <th>Equipamento</th><th>Tipo</th><th>Cliente</th><th>Patrimônio</th><th>Marca/Modelo</th><th>O.S. vinculadas</th><th></th>
    </tr></thead><tbody>
      ${list.map(e => `
        <tr>
          <td data-label="Equipamento">${escapeHTML(e.nome)}</td>
          <td data-label="Tipo">${escapeHTML(e.tipo||'—')}</td>
          <td data-label="Cliente">${escapeHTML(clienteNome(e.clienteId))}</td>
          <td data-label="Patrimônio">${escapeHTML(e.patrimonio)||'—'}</td>
          <td data-label="Marca/Modelo">${escapeHTML([e.marca,e.modelo].filter(Boolean).join(' / '))||'—'}</td>
          <td data-label="O.S."><button class="row-btn" data-viewos="${e.id}">${ORDENS.filter(o=>o.equipamentoId===e.id).length}</button></td>
          <td data-label="">
            <button class="row-btn" data-edit="${e.id}">Editar</button>
            <button class="row-btn row-btn-danger" data-del="${e.id}">Excluir</button>
          </td>
        </tr>
      `).join('')}
    </tbody></table>
  `;
  wrap.querySelectorAll('[data-edit]').forEach(b => b.onclick = () => openEquipModal(b.dataset.edit, null));
  wrap.querySelectorAll('[data-viewos]').forEach(b => b.onclick = () => {
    const e = equipById(b.dataset.viewos);
    filters.ordens = { q:'', cliente: clienteNome(e.clienteId), equipamento: e.nome, status:'' };
    adminTab = 'ordens';
    render();
  });
  wrap.querySelectorAll('[data-del]').forEach(b => b.onclick = () => {
    const linked = ORDENS.filter(o=>o.equipamentoId===b.dataset.del).length;
    if(linked > 0){ showToast(`Não é possível excluir: há ${linked} O.S. vinculada(s) a este equipamento.`); return; }
    confirmDelete('Excluir este equipamento?', 'Essa ação não pode ser desfeita.', async () => {
      await deleteEquip(b.dataset.del);
      EQUIPAMENTOS = EQUIPAMENTOS.filter(x=>x.id!==b.dataset.del);
      render(); showToast('Equipamento excluído.');
    });
  });
}
function openEquipModal(id, presetClienteId, onSaved){
  const editing = !!id;
  const e = editing ? equipById(id) : { id: uid('eq'), clienteId: presetClienteId || (CLIENTES[0]?.id||''), nome:'', tipo:'Notebook', patrimonio:'', marca:'', modelo:'', obs:'' };
  openModal(`
    <h3>${editing?'Editar equipamento':'Novo equipamento'}</h3>
    <div class="field"><label>Cliente</label>
      <select id="eq-cliente">${CLIENTES.map(c=>`<option value="${c.id}" ${c.id===e.clienteId?'selected':''}>${escapeHTML(c.nome)}</option>`).join('')}</select></div>
    <div class="field"><label>Nome do equipamento</label><input type="text" id="eq-nome" value="${escapeHTML(e.nome)}" placeholder="Ex: Dell G15"></div>
    <div class="field"><label>Tipo</label><select id="eq-tipo">${TIPO_LIST.map(t=>`<option ${t===e.tipo?'selected':''}>${t}</option>`).join('')}</select></div>
    <div class="field"><label>Nº Patrimônio / identificação</label><input type="text" id="eq-pat" value="${escapeHTML(e.patrimonio)}" placeholder="Ex: 03 ou CINZA"></div>
    <div class="field"><label>Marca</label><input type="text" id="eq-marca" value="${escapeHTML(e.marca)}"></div>
    <div class="field"><label>Modelo</label><input type="text" id="eq-modelo" value="${escapeHTML(e.modelo)}"></div>
    <div class="field"><label>Observação</label><textarea id="eq-obs">${escapeHTML(e.obs)}</textarea></div>
    <div class="modal-actions">
      <button class="btn-secondary" id="eq-cancel">Cancelar</button>
      <button class="btn-small-primary" id="eq-save">${editing?'Salvar':'Cadastrar'}</button>
    </div>
  `);
  document.getElementById('eq-cancel').onclick = closeModal;
  document.getElementById('eq-save').onclick = async () => {
    const nome = document.getElementById('eq-nome').value.trim();
    if(!nome){ showToast('Informe o nome do equipamento.'); return; }
    Object.assign(e, {
      clienteId: document.getElementById('eq-cliente').value,
      nome, tipo: document.getElementById('eq-tipo').value,
      patrimonio: document.getElementById('eq-pat').value.trim(),
      marca: document.getElementById('eq-marca').value.trim(),
      modelo: document.getElementById('eq-modelo').value.trim(),
      obs: document.getElementById('eq-obs').value.trim(),
    });
    if(!editing) EQUIPAMENTOS.push(e);
    await saveEquip(e);
    closeModal();
    if(onSaved){ onSaved(e); } else { render(); }
    showToast(editing?'Equipamento atualizado.':'Equipamento cadastrado.');
  };
}

/* ---------------- ADMIN · CLIENTES ---------------- */
function renderAdminClientes(){
  const body = document.getElementById('admin-body');
  body.innerHTML = `
    <div class="filter-bar">
      <input class="search-input" id="f-q" placeholder="Buscar cliente, telefone, e-mail..." value="${escapeHTML(filters.clientes.q)}">
      <button class="btn-small-primary" id="new-client-btn">+ Novo cliente</button>
    </div>
    <div id="client-table-wrap"></div>
  `;
  document.getElementById('f-q').oninput = e => { filters.clientes.q = e.target.value; renderClientTableAdmin(); };
  document.getElementById('new-client-btn').onclick = () => openClientModal(null);
  renderClientTableAdmin();
}
function renderClientTableAdmin(){
  const wrap = document.getElementById('client-table-wrap');
  const q = filters.clientes.q.toLowerCase();
  let list = CLIENTES.filter(c => !q || [c.nome,c.telefone,c.email,c.documento].join(' ').toLowerCase().includes(q))
                      .sort((a,b)=>a.nome.localeCompare(b.nome,'pt-BR'));
  if(list.length === 0){ wrap.innerHTML = `<div class="empty">Nenhum cliente encontrado.</div>`; return; }
  wrap.innerHTML = `
    <table><thead><tr>
      <th>Cliente</th><th>Telefone</th><th>E-mail</th><th>PIN</th><th>Equip.</th><th>O.S.</th><th></th>
    </tr></thead><tbody>
      ${list.map(c => `
        <tr>
          <td data-label="Cliente">${escapeHTML(c.nome)}</td>
          <td data-label="Telefone">${escapeHTML(c.telefone)||'—'}</td>
          <td data-label="E-mail">${escapeHTML(c.email)||'—'}</td>
          <td data-label="PIN"><span class="pin-code">${escapeHTML(c.pin)}</span></td>
          <td data-label="Equip.">${EQUIPAMENTOS.filter(e=>e.clienteId===c.id).length}</td>
          <td data-label="O.S.">${ORDENS.filter(o=>o.clienteId===c.id).length}</td>
          <td data-label="">
            <button class="row-btn" data-edit="${c.id}">Editar</button>
            ${c.telefone ? `<button class="row-btn" data-wa="${c.id}">WhatsApp</button>` : ''}
            <button class="row-btn row-btn-danger" data-del="${c.id}">Excluir</button>
          </td>
        </tr>
      `).join('')}
    </tbody></table>
  `;
  wrap.querySelectorAll('[data-edit]').forEach(b => b.onclick = () => openClientModal(b.dataset.edit));
  wrap.querySelectorAll('[data-wa]').forEach(b => b.onclick = () => {
    const c = clienteById(b.dataset.wa);
    const link = CONFIG.siteUrl ? `\n\nAcesse aqui: ${CONFIG.siteUrl}` : '';
    const msg = `Olá, ${c.nome}! Aqui está seu acesso ao portal de acompanhamento de O.S.${link}\n\nSeu PIN de acesso: ${c.pin}`;
    const url = whatsAppLink(c.telefone, msg);
    if(!url){ showToast('Telefone inválido.'); return; }
    window.open(url, '_blank');
  });
  wrap.querySelectorAll('[data-del]').forEach(b => b.onclick = () => {
    const id = b.dataset.del;
    const linkedEquip = EQUIPAMENTOS.filter(e=>e.clienteId===id).length;
    const linkedOs = ORDENS.filter(o=>o.clienteId===id).length;
    if(linkedEquip > 0 || linkedOs > 0){
      showToast(`Não é possível excluir: há ${linkedEquip} equipamento(s) e ${linkedOs} O.S. vinculada(s) a este cliente.`);
      return;
    }
    confirmDelete('Excluir este cliente?', 'Essa ação não pode ser desfeita.', async () => {
      await deleteCliente(id);
      CLIENTES = CLIENTES.filter(x=>x.id!==id);
      render(); showToast('Cliente excluído.');
    });
  });
}
function openClientModal(id){
  const editing = !!id;
  const c = editing ? clienteById(id) : { id: uid('cli'), nome:'', telefone:'', email:'', documento:'', endereco:'', pin:'' };
  openModal(`
    <h3>${editing?'Editar cliente':'Novo cliente'}</h3>
    <div class="field"><label>Nome</label><input type="text" id="c-nome" value="${escapeHTML(c.nome)}" placeholder="Ex: Stage Audio Visual"></div>
    <div class="field"><label>Telefone</label><input type="text" id="c-tel" value="${escapeHTML(c.telefone)}" placeholder="(41) 9xxxx-xxxx"></div>
    <div class="field"><label>E-mail</label><input type="text" id="c-email" value="${escapeHTML(c.email)}"></div>
    <div class="field"><label>CPF / CNPJ</label><input type="text" id="c-doc" value="${escapeHTML(c.documento)}"></div>
    <div class="field"><label>Endereço</label><input type="text" id="c-end" value="${escapeHTML(c.endereco)}"></div>
    <div class="field"><label>PIN de acesso</label><input type="text" id="c-pin" value="${escapeHTML(c.pin)}" placeholder="Ex: 4821"></div>
    <div class="modal-actions">
      <button class="btn-secondary" id="c-cancel">Cancelar</button>
      <button class="btn-small-primary" id="c-save">${editing?'Salvar':'Cadastrar cliente'}</button>
    </div>
  `);
  document.getElementById('c-cancel').onclick = closeModal;
  document.getElementById('c-save').onclick = async () => {
    const nome = document.getElementById('c-nome').value.trim();
    const pin = document.getElementById('c-pin').value.trim();
    if(!nome || !pin){ showToast('Preencha nome e PIN.'); return; }
    const dup = CLIENTES.find(x => x.pin === pin && x.id !== c.id);
    if(dup){ showToast('Esse PIN já está em uso por outro cliente.'); return; }
    Object.assign(c, {
      nome, pin,
      telefone: document.getElementById('c-tel').value.trim(),
      email: document.getElementById('c-email').value.trim(),
      documento: document.getElementById('c-doc').value.trim(),
      endereco: document.getElementById('c-end').value.trim(),
    });
    if(!editing) CLIENTES.push(c);
    await saveCliente(c);
    closeModal(); render();
    showToast(editing?'Cliente atualizado.':'Cliente cadastrado.');
  };
}

/* ---------------- ADMIN · CONFIG ---------------- */
function renderAdminConfig(){
  const body = document.getElementById('admin-body');
  body.innerHTML = `
    <div class="ticket" style="width:420px; max-width:100%;">
      <div class="ticket-body" style="padding-top:26px;">
        <div class="field"><label>Senha da oficina</label><input type="text" id="admin-pass-field" value="${escapeHTML(CONFIG.adminPassword)}"></div>
        <button class="btn-primary" id="save-pass-btn">Salvar senha</button>
        <div class="hint">Usada na aba "Área da oficina" da tela de login. Fica salva no Firestore (config/auth).</div>
        <div class="field" style="margin-top:22px;"><label>Link do portal (para mensagens de WhatsApp)</label>
          <input type="text" id="site-url-field" value="${escapeHTML(CONFIG.siteUrl)}" placeholder="https://seu-usuario.github.io/seu-repo/"></div>
        <button class="btn-primary" id="save-url-btn">Salvar link</button>
        <div class="hint">Usado para montar o link enviado ao cliente com o PIN e nas mensagens de atualização de status.</div>
      </div>
    </div>
  `;
  document.getElementById('save-pass-btn').onclick = async () => {
    const val = document.getElementById('admin-pass-field').value.trim();
    if(!val){ showToast('Informe uma senha.'); return; }
    CONFIG.adminPassword = val;
    await saveConfig();
    showToast('Senha atualizada.');
  };
  document.getElementById('save-url-btn').onclick = async () => {
    CONFIG.siteUrl = document.getElementById('site-url-field').value.trim();
    await saveConfig();
    showToast('Link salvo.');
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
function closeModal(){ const el = document.getElementById('modal-overlay'); if(el) el.remove(); }

/* ---------------- EXPORT ---------------- */
function exportCSV(list){
  if(!list || list.length === 0){ showToast('Nada para exportar com esse filtro.'); return; }
  const headers = ['O.S.','Cliente','Equipamento','Patrimônio','Status','Defeito/Serviço','Entrada','Conclusão','Peças aproveitadas','Observação'];
  const rows = list.map(o => [
    o.id, clienteNome(o.clienteId), equipNome(o.equipamentoId), equipPatrimonio(o.equipamentoId),
    o.status, o.defeito||'', fmtDate(o.dataEntrada), fmtDate(o.dataConclusao), o.pecas||'', o.obs||''
  ]);
  const escCsv = (v) => `"${String(v??'').replace(/"/g,'""')}"`;
  const csv = [headers, ...rows].map(r => r.map(escCsv).join(';')).join('\r\n');
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `ordens-de-servico-${todayStr()}.csv`;
  document.body.appendChild(a); a.click(); a.remove();
  showToast('CSV exportado.');
}

async function exportPDF(list){
  if(!list || list.length === 0){ showToast('Nada para exportar com esse filtro.'); return; }
  if(!window.jspdf){ showToast('Biblioteca de PDF ainda carregando, tente novamente em instantes.'); return; }
  const { jsPDF } = window.jspdf;
  const pdf = new jsPDF({ orientation:'landscape' });
  pdf.setFontSize(14);
  pdf.text('Ordens de Serviço', 14, 16);
  pdf.setFontSize(9);
  pdf.text(`Gerado em ${fmtDate(todayStr())}`, 14, 22);
  pdf.autoTable({
    startY: 28,
    head: [['O.S.','Cliente','Equipamento','Patrimônio','Status','Entrada','Conclusão','Observação']],
    body: list.map(o => [
      o.id, clienteNome(o.clienteId), equipNome(o.equipamentoId), equipPatrimonio(o.equipamentoId)||'—',
      o.status, fmtDate(o.dataEntrada), fmtDate(o.dataConclusao), o.obs||''
    ]),
    styles: { fontSize: 8 },
    headStyles: { fillColor: [31,56,100] },
  });
  pdf.save(`ordens-de-servico-${todayStr()}.pdf`);
  showToast('PDF exportado.');
}

function confirmDelete(title, subtitle, onConfirm){
  openModal(`
    <h3>${escapeHTML(title)}</h3>
    <p style="color:var(--text-dim); font-size:13.5px; margin:0 0 18px 0;">${escapeHTML(subtitle)}</p>
    <div class="modal-actions">
      <button class="btn-secondary" id="cd-cancel">Cancelar</button>
      <button class="btn-small-primary btn-danger-solid" id="cd-confirm">Excluir</button>
    </div>
  `);
  document.getElementById('cd-cancel').onclick = closeModal;
  document.getElementById('cd-confirm').onclick = async () => { closeModal(); await onConfirm(); };
}

/* ---------------- INIT ---------------- */
(async function init(){
  try{
    await new Promise((resolve, reject) => {
      onAuthStateChanged(auth, (user) => { if(user){ resolve(user); } }, reject);
      signInAnonymously(auth).catch(reject);
    });
    await loadData();
    render();
  }catch(e){
    $app.innerHTML = `<div class="loading">Erro ao conectar no Firestore: ${escapeHTML(e.message)}<br><br>Confira se preencheu firebase-config.js e se o Firestore/Authentication (Anônimo) estão ativados no seu projeto Firebase.</div>`;
  }
})();
