import { firebaseConfig } from './firebase-config.js';
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-app.js";
import { getAuth, signInAnonymously, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js";
import {
  getFirestore, doc, getDoc, setDoc, deleteDoc, collection, getDocs, writeBatch, runTransaction
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";
import { getStorage, ref as storageRef, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-storage.js";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
let storage = null;
try{ storage = getStorage(app); }catch(e){ storage = null; }

const STATUS_META = {
  "Em análise":                      { color:"#38BDF8", bg:"#0f2e3d", pulse:true },
  "Aguardando aprovação":             { color:"#A78BFA", bg:"#2b2140", pulse:true },
  "Em andamento":                    { color:"#E8A33D", bg:"#3a2c10", pulse:true },
  "Aguardando peça":                 { color:"#E8A33D", bg:"#3a2c10", pulse:false },
  "Concluído":                       { color:"#3FBFA8", bg:"#123b34", pulse:false },
  "Entregue ao cliente":             { color:"#5B8DEF", bg:"#182645", pulse:false },
  "Sem conserto – peças aproveitadas": { color:"#E2574C", bg:"#3a1918", pulse:false },
  "Sem conserto – devolvido ao cliente": { color:"#94A3B8", bg:"#242c38", pulse:false },
};
const STATUS_LIST = Object.keys(STATUS_META);
const TIPO_LIST = ["Notebook", "Desktop", "Periférico", "Outro"];
const CHECKLIST_ITENS = [
  "Tela/carcaça riscada ou amassada",
  "Sem carregador/fonte",
  "Sem cabo(s)",
  "Bateria não incluída",
  "Tecla(s) faltando ou danificada(s)",
  "Sinal de líquido derramado",
  "Não liga",
];

let CONFIG = { adminPassword: 'garage1240', siteUrl: '' };
let CLIENTES = [];     // Firestore: collection "clientes"
let TECNICOS = [];     // Firestore: collection "tecnicos" (Rafael, Eduardo, etc.)
let EQUIPAMENTOS = []; // Firestore: collection "equipamentos"
let ORDENS = [];        // Firestore: collection "ordens"
let session = { role: null, clientId: null };
const SESSION_KEY = 'osportal_session';
const SESSION_MAX_AGE_MS = { client: 30*24*60*60*1000, admin: 7*24*60*60*1000 }; // 30 dias cliente, 7 dias oficina
function saveSession(){
  try{ localStorage.setItem(SESSION_KEY, JSON.stringify({ ...session, savedAt: Date.now() })); }catch(e){ /* ignora se bloqueado */ }
}
function loadSession(){
  try{
    const raw = localStorage.getItem(SESSION_KEY);
    if(!raw) return { role:null, clientId:null };
    const saved = JSON.parse(raw);
    const maxAge = SESSION_MAX_AGE_MS[saved.role];
    if(maxAge && (Date.now() - (saved.savedAt||0)) > maxAge) return { role:null, clientId:null };
    return saved;
  }catch(e){ return { role:null, clientId:null }; }
}
function clearSession(){
  try{ localStorage.removeItem(SESSION_KEY); }catch(e){ /* ignora */ }
}
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
async function reserveNextOsId(){
  const counterRef = doc(db, 'config', 'counters');
  const nextNumber = await runTransaction(db, async (tx) => {
    const snap = await tx.get(counterRef);
    let current = 0;
    if(snap.exists() && typeof snap.data().nextOs === 'number'){
      current = snap.data().nextOs;
    } else {
      // Primeira vez rodando isso: parte do maior número já usado localmente.
      const nums = ORDENS.map(o => parseInt((o.id||'').replace(/\D/g,''),10)).filter(n=>!isNaN(n));
      current = nums.length ? Math.max(...nums) : 0;
    }
    const next = current + 1;
    tx.set(counterRef, { nextOs: next }, { merge: true });
    return next;
  });
  return 'OS-' + String(nextNumber).padStart(4,'0');
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
function equipLabel(id){
  const e = equipById(id);
  if(!e) return '—';
  return e.patrimonio ? `${e.nome} (${e.patrimonio})` : e.nome;
}
function uniqueEquipOptions(ids){
  const seen = new Map();
  ids.filter(Boolean).forEach(id => { if(!seen.has(id)) seen.set(id, equipLabel(id)); });
  return [...seen.entries()].sort((a,b) => a[1].localeCompare(b[1],'pt-BR'));
}
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
  TECNICOS = [{ id: uid('tec'), nome: 'Rafael', senha: 'garage1240' }];

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
    defeitoRelatado: 'Solicitação de formatação e clone de imagem',
    diagnosticoTecnico: 'Formatação + Clone de imagem (Macrium)',
    valorOrcamento: '',
    checklistEntrada: [],
    checklistObs: '',
    fotoEntradaUrl: '',
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
    defeitoRelatado: 'Em verificação — defeito ainda não diagnosticado',
    diagnosticoTecnico: '',
    valorOrcamento: '',
    checklistEntrada: [],
    checklistObs: '',
    fotoEntradaUrl: '',
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
  const tecnicosSnap = await getDocs(collection(db, 'tecnicos'));

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
  TECNICOS = tecnicosSnap.docs.map(d => d.data());

  let needsSave = false;

  // --- migrate a senha única da oficina para o primeiro técnico cadastrado ---
  if(TECNICOS.length === 0){
    const primeiro = { id: uid('tec'), nome: 'Rafael', senha: CONFIG.adminPassword };
    TECNICOS = [primeiro];
    await setDoc(doc(db,'tecnicos', primeiro.id), primeiro);
  }

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

  // --- migrate "defeito" (old single field) into "defeitoRelatado" (new schema) ---
  for(const o of ORDENS){
    if(o.defeitoRelatado === undefined && o.defeito !== undefined){
      o.defeitoRelatado = o.defeito;
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
  TECNICOS.forEach(t => batch.set(doc(db, 'tecnicos', t.id), t));
  await batch.commit();
}
async function saveTecnico(t){ try{ await setDoc(doc(db,'tecnicos', t.id), t); }catch(e){ showToast('Erro ao salvar técnico: '+e.message); } }
async function deleteTecnico(id){ try{ await deleteDoc(doc(db,'tecnicos', id)); }catch(e){ showToast('Erro ao excluir: '+e.message); } }
async function saveConfig(){ try{ await setDoc(doc(db,'config','auth'), CONFIG); }catch(e){ showToast('Erro ao salvar: '+e.message); } }
async function saveCliente(c){ try{ await setDoc(doc(db,'clientes', c.id), c); }catch(e){ showToast('Erro ao salvar cliente: '+e.message); } }
async function deleteCliente(id){ try{ await deleteDoc(doc(db,'clientes', id)); }catch(e){ showToast('Erro ao excluir: '+e.message); } }
async function saveEquip(e){ try{ await setDoc(doc(db,'equipamentos', e.id), e); }catch(err){ showToast('Erro ao salvar equipamento: '+err.message); } }
async function deleteEquip(id){ try{ await deleteDoc(doc(db,'equipamentos', id)); }catch(e){ showToast('Erro ao excluir: '+e.message); } }
async function saveOrdem(o){ try{ await setDoc(doc(db,'ordens', o.id), o); }catch(e){ showToast('Erro ao salvar O.S.: '+e.message); } }
async function deleteOrdem(id){ try{ await deleteDoc(doc(db,'ordens', id)); }catch(e){ showToast('Erro ao excluir: '+e.message); } }
async function uploadFotoEntrada(file, osId){
  if(!storage) throw new Error('Storage não disponível');
  const path = `fotos/${osId}-${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g,'_')}`;
  const r = storageRef(storage, path);
  await uploadBytes(r, file);
  return await getDownloadURL(r);
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
        <div class="input-with-toggle">
          <input type="password" inputmode="numeric" id="pin-input" placeholder="•••• ••••" maxlength="10">
          <button type="button" class="toggle-visibility" id="pin-toggle" aria-label="Mostrar PIN">👁</button>
        </div>
      </div>
      <button class="btn-primary" id="pin-submit">Entrar</button>
      <div class="err" id="login-err"></div>
      <div class="hint">O PIN é fornecido pela oficina. Cada cliente tem um código próprio.</div>
    `;
    document.getElementById('pin-submit').onclick = tryClientLogin;
    document.getElementById('pin-input').addEventListener('keydown', e => { if(e.key==='Enter') tryClientLogin(); });
    document.getElementById('pin-toggle').onclick = () => togglePasswordField('pin-input', 'pin-toggle');
  } else {
    box.innerHTML = `
      <div class="field"><label>Técnico</label>
        <select id="tec-select">${TECNICOS.map(t=>`<option value="${t.id}">${escapeHTML(t.nome)}</option>`).join('')}</select>
      </div>
      <div class="field"><label>Senha</label>
        <div class="input-with-toggle">
          <input type="password" id="pass-input" placeholder="••••••••">
          <button type="button" class="toggle-visibility" id="pass-toggle" aria-label="Mostrar senha">👁</button>
        </div>
      </div>
      <button class="btn-primary" id="pass-submit">Entrar</button>
      <div class="err" id="login-err"></div>
      <div class="hint">Acesso restrito à equipe (Rafael / Eduardo).</div>
    `;
    document.getElementById('pass-submit').onclick = tryAdminLogin;
    document.getElementById('pass-input').addEventListener('keydown', e => { if(e.key==='Enter') tryAdminLogin(); });
    document.getElementById('pass-toggle').onclick = () => togglePasswordField('pass-input', 'pass-toggle');
  }
}
function togglePasswordField(inputId, btnId){
  const input = document.getElementById(inputId);
  const btn = document.getElementById(btnId);
  const showing = input.type === 'text';
  input.type = showing ? 'password' : 'text';
  btn.classList.toggle('active', !showing);
}
function tryClientLogin(){
  const pin = document.getElementById('pin-input').value.trim();
  const client = CLIENTES.find(c => c.pin === pin);
  const err = document.getElementById('login-err');
  if(!client){ err.textContent = 'PIN inválido. Verifique com a oficina.'; return; }
  session = { role:'client', clientId: client.id };
  filters.client = { q:'', status:'' };
  saveSession();
  render();
}
function tryAdminLogin(){
  const tecId = document.getElementById('tec-select').value;
  const pass = document.getElementById('pass-input').value;
  const err = document.getElementById('login-err');
  const tec = TECNICOS.find(t => t.id === tecId);
  if(!tec || pass !== tec.senha){ err.textContent = 'Senha incorreta.'; return; }
  session = { role:'admin', clientId:null, tecnicoId: tec.id, tecnicoNome: tec.nome };
  adminTab = 'ordens';
  saveSession();
  render();
}
function logout(){ session = { role:null, clientId:null }; clearSession(); render(); }

/* ---------------- STATUS PILL ---------------- */
function statusPill(status){
  const meta = STATUS_META[status] || STATUS_META['Em andamento'];
  return `<span class="status-pill ${meta.pulse?'pulse':''}" style="color:${meta.color}; background:${meta.bg};"><span class="led"></span>${escapeHTML(status)}</span>`;
}

/* ---------------- CLIENT DASHBOARD (list + filters) ---------------- */
function renderClientDashboard(){
  const client = clienteById(session.clientId);
  const all = ORDENS.filter(o => o.clienteId === session.clientId);
  const equipOpts = uniqueEquipOptions(all.map(o => o.equipamentoId));

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
          ${equipOpts.map(([id,label])=>`<option value="${id}" ${filters.client.equip===id?'selected':''}>${escapeHTML(label)}</option>`).join('')}
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
const CLIENT_OS_COLUMNS = [
  { key:'id', label:'O.S.', get:o=>o.id },
  { key:'equipamento', label:'Equipamento', get:o=>equipNome(o.equipamentoId) },
  { key:'patrimonio', label:'Patrimônio', get:o=>equipPatrimonio(o.equipamentoId) },
  { key:'status', label:'Status', get:o=>o.status },
  { key:'entrada', label:'Entrada', get:o=>o.dataEntrada||'' },
  { key:'previsao', label:'Previsão', get:o=>o.previsaoEntrega||'' },
  { key:'conclusao', label:'Conclusão', get:o=>o.dataConclusao||'' },
];
let clientOsSort = { key:'conclusao', dir:'desc' };

function renderClientTable(){
  const wrap = document.getElementById('os-table-wrap');
  const q = (filters.client.q||'').toLowerCase();
  let list = ORDENS.filter(o => o.clienteId === session.clientId).filter(o => {
    const eqNome = equipNome(o.equipamentoId), eqPat = equipPatrimonio(o.equipamentoId);
    const matchesQ = !q || [o.id, eqNome, eqPat].join(' ').toLowerCase().includes(q);
    const matchesEquip = !filters.client.equip || o.equipamentoId === filters.client.equip;
    const matchesStatus = !filters.client.status || o.status === filters.client.status;
    return matchesQ && matchesEquip && matchesStatus;
  });
  const sortCol = CLIENT_OS_COLUMNS.find(c => c.key === clientOsSort.key) || CLIENT_OS_COLUMNS[0];
  list = list.sort((a,b) => {
    const cmp = String(sortCol.get(a)).localeCompare(String(sortCol.get(b)), 'pt-BR', { numeric:true });
    return clientOsSort.dir === 'asc' ? cmp : -cmp;
  });

  if(list.length === 0){ wrap.innerHTML = `<div class="empty">Nenhum resultado para esse filtro.</div>`; return; }
  const arrow = (key) => clientOsSort.key === key ? (clientOsSort.dir === 'asc' ? ' ▲' : ' ▼') : '';
  wrap.innerHTML = `
    <table><thead><tr>
      ${CLIENT_OS_COLUMNS.map(c => `<th class="sortable-th" data-sort="${c.key}">${c.label}${arrow(c.key)}</th>`).join('')}
      <th></th>
    </tr></thead><tbody>
      ${list.map(o => `
        <tr>
          <td data-label="O.S."><span class="os-id">${o.id}</span></td>
          <td data-label="Equipamento">${escapeHTML(equipNome(o.equipamentoId))}</td>
          <td data-label="Patrimônio">${escapeHTML(equipPatrimonio(o.equipamentoId))||'—'}</td>
          <td data-label="Status">${statusPill(o.status)}</td>
          <td data-label="Entrada">${fmtDate(o.dataEntrada)}</td>
          <td data-label="Previsão">${fmtDate(o.previsaoEntrega)}</td>
          <td data-label="Conclusão">${fmtDate(o.dataConclusao)}</td>
          <td data-label=""><button class="row-btn" data-view="${o.id}">Detalhes</button></td>
        </tr>
      `).join('')}
    </tbody></table>
  `;
  wrap.querySelectorAll('[data-sort]').forEach(th => th.onclick = () => {
    const key = th.dataset.sort;
    if(clientOsSort.key === key){ clientOsSort.dir = clientOsSort.dir === 'asc' ? 'desc' : 'asc'; }
    else { clientOsSort = { key, dir: 'asc' }; }
    renderClientTable();
  });
  wrap.querySelectorAll('[data-view]').forEach(b => b.onclick = () => openOsDetailModal(b.dataset.view));
}
function openOsDetailModal(id){
  const o = ORDENS.find(x=>x.id===id);
  const hist = (o.historico||[]).slice().sort((a,b)=>(a.data||'').localeCompare(b.data||''));
  openModal(`
    <h3>${o.id} — ${escapeHTML(equipNome(o.equipamentoId))}</h3>
    <div class="os-meta" style="margin-bottom:14px;">
      ${equipPatrimonio(o.equipamentoId) ? `Patrimônio <span>${escapeHTML(equipPatrimonio(o.equipamentoId))}</span> · ` : ''}
      Entrada <span>${fmtDate(o.dataEntrada)}</span>${o.previsaoEntrega ? ` · Previsão <span>${fmtDate(o.previsaoEntrega)}</span>`:''}${o.dataConclusao ? ` · Conclusão <span>${fmtDate(o.dataConclusao)}</span>`:''}
    </div>
    ${statusPill(o.status)}
    ${o.valorOrcamento ? `<div class="os-meta" style="margin-top:10px;">Orçamento <span>${escapeHTML(o.valorOrcamento)}</span></div>` : ''}
    ${o.defeitoRelatado ? `<div class="os-defeito" style="margin-top:14px;"><strong>Defeito relatado:</strong> ${escapeHTML(o.defeitoRelatado)}</div>` : ''}
    ${o.diagnosticoTecnico ? `<div class="os-defeito" style="margin-top:8px;"><strong>Diagnóstico técnico:</strong> ${escapeHTML(o.diagnosticoTecnico)}</div>` : ''}
    ${(o.checklistEntrada&&o.checklistEntrada.length) || o.checklistObs ? `<div class="os-defeito" style="margin-top:8px;"><strong>Estado na entrada:</strong> ${escapeHTML([...(o.checklistEntrada||[]), o.checklistObs].filter(Boolean).join(' · '))}</div>` : ''}
    ${o.fotoEntradaUrl ? `<div style="margin-top:10px;"><img src="${o.fotoEntradaUrl}" style="max-width:100%; max-height:180px; border-radius:8px; border:1px solid var(--line);"></div>` : ''}
    ${hist.length ? `<div class="timeline" style="margin-top:14px;">
      ${hist.map(h => `<div class="timeline-item"><div class="timeline-dot"></div>
        <div class="timeline-date">${fmtDate(h.data)}</div>
        <div class="timeline-text"><strong>${escapeHTML(h.status)}</strong>${h.texto?' — '+escapeHTML(h.texto):''}${h.por?` <span style="color:var(--text-dim);">(${escapeHTML(h.por)})</span>`:''}</div></div>`).join('')}
    </div>` : ''}
    ${o.garantiaDias ? `<div class="os-defeito" style="margin-top:14px;"><strong>Garantia:</strong> ${escapeHTML(o.garantiaDias)} dias${o.garantiaObs ? ' — '+escapeHTML(o.garantiaObs) : ''}</div>` : ''}
    ${o.obs ? `<div class="os-defeito" style="margin-top:14px; margin-bottom:0;">${escapeHTML(o.obs)}</div>` : ''}
    <div class="modal-actions">
      <button class="btn-secondary" id="d-pdf">Baixar O.S. em PDF</button>
      <button class="btn-secondary" id="d-recibo">Baixar Recibo</button>
      <button class="btn-secondary" id="d-close">Fechar</button>
    </div>
  `);
  document.getElementById('d-pdf').onclick = () => exportSingleOsPDF(o);
  document.getElementById('d-recibo').onclick = () => exportRecibo(o);
  document.getElementById('d-close').onclick = closeModal;
}

/* ---------------- ADMIN SHELL ---------------- */
function renderAdminDashboard(){
  $app.innerHTML = `
    <div class="topbar">
      <div class="brand"><div class="dot"></div>
        <div class="brand-text">PORTAL DE SERVIÇOS<small>Área da oficina — ${escapeHTML(session.tecnicoNome||'')}</small></div>
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
  const clienteOpts = CLIENTES.slice().sort((a,b)=>a.nome.localeCompare(b.nome,'pt-BR'));
  const equipOpts = uniqueEquipOptions(ORDENS.map(o=>o.equipamentoId));
  body.innerHTML = `
    <div class="stats-bar" id="stats-bar"></div>
    <div class="filter-bar">
      <input class="search-input" id="f-q" placeholder="Buscar O.S., equipamento, patrimônio..." value="${escapeHTML(filters.ordens.q)}">
      <select class="select" id="f-cliente"><option value="">Todos os clientes</option>
        ${clienteOpts.map(c=>`<option value="${c.id}" ${filters.ordens.cliente===c.id?'selected':''}>${escapeHTML(c.nome)}</option>`).join('')}</select>
      <select class="select" id="f-equip"><option value="">Todos os equipamentos</option>
        ${equipOpts.map(([id,label])=>`<option value="${id}" ${filters.ordens.equipamento===id?'selected':''}>${escapeHTML(label)}</option>`).join('')}</select>
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
const OS_COLUMNS = [
  { key:'id', label:'O.S.', get:o=>o.id },
  { key:'cliente', label:'Cliente', get:o=>clienteNome(o.clienteId) },
  { key:'equipamento', label:'Equipamento', get:o=>equipNome(o.equipamentoId) },
  { key:'patrimonio', label:'Patrimônio', get:o=>equipPatrimonio(o.equipamentoId) },
  { key:'status', label:'Status', get:o=>o.status },
  { key:'entrada', label:'Entrada', get:o=>o.dataEntrada||'' },
  { key:'previsao', label:'Previsão', get:o=>o.previsaoEntrega||'' },
  { key:'conclusao', label:'Conclusão', get:o=>o.dataConclusao||'' },
];
let osSort = { key:'id', dir:'desc' };

function renderOsTable(){
  const wrap = document.getElementById('os-table-wrap');
  const q = filters.ordens.q.toLowerCase();
  let list = ORDENS.filter(o => {
    const eqNome = equipNome(o.equipamentoId), eqPat = equipPatrimonio(o.equipamentoId), cliNome = clienteNome(o.clienteId);
    const matchesQ = !q || [o.id, eqNome, eqPat, cliNome].join(' ').toLowerCase().includes(q);
    const matchesCliente = !filters.ordens.cliente || o.clienteId === filters.ordens.cliente;
    const matchesEquip = !filters.ordens.equipamento || o.equipamentoId === filters.ordens.equipamento;
    const matchesStatus = !filters.ordens.status || o.status === filters.ordens.status;
    return matchesQ && matchesCliente && matchesEquip && matchesStatus;
  });
  const sortCol = OS_COLUMNS.find(c => c.key === osSort.key) || OS_COLUMNS[0];
  list = list.sort((a,b) => {
    const cmp = String(sortCol.get(a)).localeCompare(String(sortCol.get(b)), 'pt-BR', { numeric:true });
    return osSort.dir === 'asc' ? cmp : -cmp;
  });
  currentOsList = list;

  if(list.length === 0){ wrap.innerHTML = `<div class="empty">Nenhuma O.S. encontrada.</div>`; return; }
  const arrow = (key) => osSort.key === key ? (osSort.dir === 'asc' ? ' ▲' : ' ▼') : '';
  wrap.innerHTML = `
    <table><thead><tr>
      ${OS_COLUMNS.map(c => `<th class="sortable-th" data-sort="${c.key}">${c.label}${arrow(c.key)}</th>`).join('')}
      <th></th>
    </tr></thead><tbody>
      ${list.map(o => `
        <tr>
          <td data-label="O.S."><span class="os-id">${o.id}</span></td>
          <td data-label="Cliente">${escapeHTML(clienteNome(o.clienteId))}</td>
          <td data-label="Equipamento">${escapeHTML(equipNome(o.equipamentoId))}</td>
          <td data-label="Patrimônio">${escapeHTML(equipPatrimonio(o.equipamentoId))||'—'}</td>
          <td data-label="Status">${statusPill(o.status)}</td>
          <td data-label="Entrada">${fmtDate(o.dataEntrada)}</td>
          <td data-label="Previsão">${fmtDate(o.previsaoEntrega)}</td>
          <td data-label="Conclusão">${fmtDate(o.dataConclusao)}</td>
          <td data-label="">
            <button class="row-btn" data-edit="${o.id}">Editar</button>
            <button class="row-btn" data-hist="${o.id}">+ Status</button>
            <button class="row-btn" data-print="${o.id}">Imprimir</button>
            <button class="row-btn" data-recibo="${o.id}">Recibo</button>
            <button class="row-btn row-btn-danger" data-del="${o.id}">Excluir</button>
          </td>
        </tr>
      `).join('')}
    </tbody></table>
  `;
  wrap.querySelectorAll('[data-sort]').forEach(th => th.onclick = () => {
    const key = th.dataset.sort;
    if(osSort.key === key){ osSort.dir = osSort.dir === 'asc' ? 'desc' : 'asc'; }
    else { osSort = { key, dir: 'asc' }; }
    renderOsTable();
  });
  wrap.querySelectorAll('[data-edit]').forEach(b => b.onclick = () => openOsModal(b.dataset.edit));
  wrap.querySelectorAll('[data-hist]').forEach(b => b.onclick = () => openHistModal(b.dataset.hist));
  wrap.querySelectorAll('[data-print]').forEach(b => b.onclick = () => exportSingleOsPDF(ORDENS.find(x=>x.id===b.dataset.print)));
  wrap.querySelectorAll('[data-recibo]').forEach(b => b.onclick = () => exportRecibo(ORDENS.find(x=>x.id===b.dataset.recibo)));
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
    id: null, clienteId: CLIENTES[0]?.id || '', equipamentoId:'',
    defeitoRelatado:'', diagnosticoTecnico:'', valorOrcamento:'',
    checklistEntrada:[], checklistObs:'', fotoEntradaUrl:'',
    status:'Em análise', dataEntrada: todayStr(), dataConclusao:'', pecas:'', obs:'', historico:[]
  };
  renderOsModalBody(o, editing);
}
function renderOsModalBody(o, editing){
  const equipDoCliente = EQUIPAMENTOS.filter(e => e.clienteId === o.clienteId);
  const checklist = o.checklistEntrada || [];
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
    <div class="field"><label>Checklist de estado na entrada</label>
      <div class="checklist-box">
        ${CHECKLIST_ITENS.map((item,i) => `
          <label class="checklist-item"><input type="checkbox" id="m-check-${i}" ${checklist.includes(item)?'checked':''}> ${escapeHTML(item)}</label>
        `).join('')}
      </div>
      <input type="text" id="m-check-obs" value="${escapeHTML(o.checklistObs)}" placeholder="Outras observações sobre o estado do equipamento" style="margin-top:8px;">
    </div>
    <div class="field"><label>Foto do equipamento (entrada)</label>
      ${o.fotoEntradaUrl ? `<div style="margin-bottom:8px;"><img src="${o.fotoEntradaUrl}" style="max-width:100%; max-height:160px; border-radius:8px; border:1px solid var(--line);"></div>` : ''}
      <input type="file" id="m-foto" accept="image/*">
      <div class="hint" style="margin-top:4px;">${storage ? 'Opcional — ajuda a comprovar o estado do equipamento na entrada.' : 'Upload de foto indisponível (Firebase Storage não configurado).'}</div>
    </div>
    <div class="field"><label>Defeito relatado pelo cliente</label><textarea id="m-defeito" placeholder="O que o cliente disse que está acontecendo">${escapeHTML(o.defeitoRelatado)}</textarea></div>
    <div class="field"><label>Diagnóstico técnico</label><textarea id="m-diagnostico" placeholder="O que foi encontrado/feito após análise">${escapeHTML(o.diagnosticoTecnico)}</textarea></div>
    <div class="field"><label>Valor do orçamento</label><input type="text" id="m-valor" value="${escapeHTML(o.valorOrcamento)}" placeholder="Ex: R$ 150,00"></div>
    <div class="field"><label>Status atual</label>
      <select id="m-status">${STATUS_LIST.map(s=>`<option value="${s}" ${s===o.status?'selected':''}>${s}</option>`).join('')}</select></div>
    <div class="field"><label>Data de entrada</label><input type="date" id="m-entrada" value="${o.dataEntrada||''}"></div>
    <div class="field"><label>Previsão de entrega</label><input type="date" id="m-previsao" value="${o.previsaoEntrega||''}">
      <div class="hint" style="margin-top:4px;">Combine um prazo com folga — cumprir antes gera confiança, atrasar gera desconfiança.</div>
    </div>
    <div class="field"><label>Data de conclusão / entrega</label><input type="date" id="m-conclusao" value="${o.dataConclusao||''}"></div>
    <div class="field"><label>Peças aproveitadas (se houver)</label><input type="text" id="m-pecas" value="${escapeHTML(o.pecas)}"></div>
    <div class="field"><label>Garantia (dias)</label><input type="number" id="m-garantia-dias" value="${o.garantiaDias||''}" placeholder="Ex: 90" min="0"></div>
    <div class="field"><label>Condições da garantia</label><textarea id="m-garantia-obs" placeholder="Ex: cobre defeito de fábrica na peça trocada, não cobre mau uso ou dano físico">${escapeHTML(o.garantiaObs)}</textarea></div>
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
    const saveBtn = document.getElementById('m-save');
    const data = {
      clienteId: document.getElementById('m-cliente').value,
      equipamentoId: document.getElementById('m-equip').value,
      defeitoRelatado: document.getElementById('m-defeito').value.trim(),
      diagnosticoTecnico: document.getElementById('m-diagnostico').value.trim(),
      valorOrcamento: document.getElementById('m-valor').value.trim(),
      checklistEntrada: CHECKLIST_ITENS.filter((_,i) => document.getElementById(`m-check-${i}`).checked),
      checklistObs: document.getElementById('m-check-obs').value.trim(),
      status: document.getElementById('m-status').value,
      dataEntrada: document.getElementById('m-entrada').value,
      previsaoEntrega: document.getElementById('m-previsao').value,
      dataConclusao: document.getElementById('m-conclusao').value,
      pecas: document.getElementById('m-pecas').value.trim(),
      garantiaDias: document.getElementById('m-garantia-dias').value.trim(),
      garantiaObs: document.getElementById('m-garantia-obs').value.trim(),
      obs: document.getElementById('m-obs').value.trim(),
    };
    if(!data.equipamentoId){ showToast('Selecione (ou cadastre) o equipamento.'); return; }
    const fotoInput = document.getElementById('m-foto');
    const file = fotoInput.files[0];
    saveBtn.disabled = true; saveBtn.textContent = 'Salvando...';
    let target;
    if(editing){
      Object.assign(o, data); target = o;
    } else {
      let newId;
      try{ newId = await reserveNextOsId(); }
      catch(e){ showToast('Erro ao gerar número da O.S.: '+e.message); saveBtn.disabled=false; saveBtn.textContent='Criar O.S.'; return; }
      target = { id:newId, fotoEntradaUrl:'', tecnicoResponsavel: session.tecnicoNome || '', historico:[{data:data.dataEntrada||todayStr(), status:data.status, texto:'O.S. aberta.', por: session.tecnicoNome || ''}], ...data };
      ORDENS.push(target);
    }
    if(file){
      try{ target.fotoEntradaUrl = await uploadFotoEntrada(file, target.id); }
      catch(e){ showToast('Não foi possível enviar a foto: '+e.message); }
    }
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
    o.historico.push({ data, status, texto, por: session.tecnicoNome || '' });
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
  const clienteOpts = CLIENTES.slice().sort((a,b)=>a.nome.localeCompare(b.nome,'pt-BR'));
  body.innerHTML = `
    <div class="filter-bar">
      <input class="search-input" id="f-q" placeholder="Buscar equipamento, patrimônio..." value="${escapeHTML(filters.equip.q)}">
      <select class="select" id="f-cliente"><option value="">Todos os clientes</option>
        ${clienteOpts.map(c=>`<option value="${c.id}" ${filters.equip.cliente===c.id?'selected':''}>${escapeHTML(c.nome)}</option>`).join('')}</select>
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
    const matchesCliente = !filters.equip.cliente || e.clienteId === filters.equip.cliente;
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
    filters.ordens = { q:'', cliente: e.clienteId, equipamento: e.id, status:'' };
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
            <button class="row-btn row-btn-danger" data-anon="${c.id}">Anonimizar (LGPD)</button>
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
  wrap.querySelectorAll('[data-anon]').forEach(b => b.onclick = () => {
    const c = clienteById(b.dataset.anon);
    confirmDelete('Anonimizar dados deste cliente?',
      'Remove nome, telefone, e-mail, CPF/CNPJ, endereço e PIN atual (o acesso ao portal deixa de funcionar). Os equipamentos e O.S. permanecem no histórico, sem dados pessoais — atende ao direito de exclusão da LGPD mantendo o registro do serviço prestado.',
      async () => {
        Object.assign(c, { nome:'Cliente anonimizado (LGPD)', telefone:'', email:'', documento:'', endereco:'', pin: uid('anon') });
        await saveCliente(c);
        render(); showToast('Dados do cliente anonimizados.');
      });
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
    <div class="toolbar">
      <div><h3 style="margin:0; font-family:var(--font-display); font-size:15px;">Técnicos</h3></div>
      <button class="btn-small-primary" id="new-tec-btn">+ Novo técnico</button>
    </div>
    <table style="margin-bottom:24px;"><thead><tr><th>Nome</th><th>Senha</th><th></th></tr></thead>
      <tbody>
        ${TECNICOS.map(t => `
          <tr>
            <td data-label="Nome">${escapeHTML(t.nome)}</td>
            <td data-label="Senha"><span class="pin-code">${escapeHTML(t.senha)}</span></td>
            <td data-label="">
              <button class="row-btn" data-edit-tec="${t.id}">Editar</button>
              ${TECNICOS.length > 1 ? `<button class="row-btn row-btn-danger" data-del-tec="${t.id}">Excluir</button>` : ''}
            </td>
          </tr>
        `).join('')}
      </tbody>
    </table>
    <div class="ticket" style="width:420px; max-width:100%;">
      <div class="ticket-body" style="padding-top:26px;">
        <div class="field"><label>Link do portal (para mensagens de WhatsApp)</label>
          <input type="text" id="site-url-field" value="${escapeHTML(CONFIG.siteUrl)}" placeholder="https://seu-usuario.github.io/seu-repo/"></div>
        <button class="btn-primary" id="save-url-btn">Salvar link</button>
        <div class="hint">Usado para montar o link enviado ao cliente com o PIN e nas mensagens de atualização de status.</div>
      </div>
    </div>
  `;
  document.getElementById('new-tec-btn').onclick = () => openTecnicoModal(null);
  body.querySelectorAll('[data-edit-tec]').forEach(b => b.onclick = () => openTecnicoModal(b.dataset.editTec));
  body.querySelectorAll('[data-del-tec]').forEach(b => b.onclick = () => {
    confirmDelete('Excluir este técnico?', 'Ele não vai mais conseguir entrar na área da oficina. O nome continua aparecendo no histórico de O.S. já registradas.', async () => {
      await deleteTecnico(b.dataset.delTec);
      TECNICOS = TECNICOS.filter(t => t.id !== b.dataset.delTec);
      render(); showToast('Técnico excluído.');
    });
  });
  document.getElementById('save-url-btn').onclick = async () => {
    CONFIG.siteUrl = document.getElementById('site-url-field').value.trim();
    await saveConfig();
    showToast('Link salvo.');
  };
}

function openTecnicoModal(id){
  const editing = !!id;
  const t = editing ? TECNICOS.find(x=>x.id===id) : { id: uid('tec'), nome:'', senha:'' };
  openModal(`
    <h3>${editing?'Editar técnico':'Novo técnico'}</h3>
    <div class="field"><label>Nome</label><input type="text" id="tec-nome" value="${escapeHTML(t.nome)}" placeholder="Ex: Eduardo"></div>
    <div class="field"><label>Senha</label><input type="text" id="tec-senha" value="${escapeHTML(t.senha)}" placeholder="Ex: 4821"></div>
    <div class="modal-actions">
      <button class="btn-secondary" id="tec-cancel">Cancelar</button>
      <button class="btn-small-primary" id="tec-save">${editing?'Salvar':'Cadastrar'}</button>
    </div>
  `);
  document.getElementById('tec-cancel').onclick = closeModal;
  document.getElementById('tec-save').onclick = async () => {
    const nome = document.getElementById('tec-nome').value.trim();
    const senha = document.getElementById('tec-senha').value.trim();
    if(!nome || !senha){ showToast('Preencha nome e senha.'); return; }
    Object.assign(t, { nome, senha });
    if(!editing) TECNICOS.push(t);
    await saveTecnico(t);
    closeModal(); render();
    showToast(editing?'Técnico atualizado.':'Técnico cadastrado.');
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
  const headers = ['O.S.','Cliente','Equipamento','Patrimônio','Status','Defeito relatado','Diagnóstico técnico','Valor orçamento','Entrada','Previsão','Conclusão','Peças aproveitadas','Garantia (dias)','Condições garantia','Observação'];
  const rows = list.map(o => [
    o.id, clienteNome(o.clienteId), equipNome(o.equipamentoId), equipPatrimonio(o.equipamentoId),
    o.status, o.defeitoRelatado||'', o.diagnosticoTecnico||'', o.valorOrcamento||'',
    fmtDate(o.dataEntrada), fmtDate(o.previsaoEntrega), fmtDate(o.dataConclusao), o.pecas||'', o.garantiaDias||'', o.garantiaObs||'', o.obs||''
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

function exportSingleOsPDF(o){
  if(!o){ showToast('O.S. não encontrada.'); return; }
  if(!window.jspdf){ showToast('Biblioteca de PDF ainda carregando, tente novamente em instantes.'); return; }
  const { jsPDF } = window.jspdf;
  const pdf = new jsPDF({ orientation:'portrait' });
  const c = clienteById(o.clienteId);
  const e = equipById(o.equipamentoId);
  let y = 18;
  const left = 14, right = 196;
  const line = (h=7) => { y += h; if(y > 275){ pdf.addPage(); y = 18; } };
  const label = (txt) => { pdf.setFont(undefined,'bold'); pdf.setFontSize(9); pdf.text(txt, left, y); pdf.setFont(undefined,'normal'); };
  const value = (txt, indent=0) => {
    pdf.setFontSize(10);
    const lines = pdf.splitTextToSize(String(txt||'—'), right-left-indent);
    pdf.text(lines, left+indent, y+5);
    line(5 + lines.length*5);
  };

  pdf.setFontSize(16); pdf.setFont(undefined,'bold');
  pdf.text('ORDEM DE SERVIÇO', left, y);
  pdf.setFontSize(11); pdf.setFont(undefined,'normal');
  pdf.text(o.id, right, y, { align:'right' });
  line(6);
  pdf.setFontSize(9); pdf.setTextColor(110);
  pdf.text('Rafael / Eduardo — (41) 9131-2064 — garage1240.oficial@gmail.com', left, y);
  pdf.setTextColor(0);
  line(10);
  pdf.setDrawColor(200); pdf.line(left, y, right, y); line(8);

  label('CLIENTE'); value(c ? c.nome : '—');
  if(c && c.telefone) { value('Telefone: ' + c.telefone); }
  if(c && c.documento) { value('CPF/CNPJ: ' + c.documento); }
  line(2);

  label('EQUIPAMENTO'); value(`${e?e.nome:equipNome(o.equipamentoId)}${e&&e.patrimonio?' — Patrimônio: '+e.patrimonio:''}`);
  if(e && (e.marca || e.modelo)) value('Marca/Modelo: ' + [e.marca,e.modelo].filter(Boolean).join(' / '));
  line(2);

  label('STATUS ATUAL'); value(o.status);
  if(o.tecnicoResponsavel) value('Técnico responsável: ' + o.tecnicoResponsavel);
  if(o.valorOrcamento) value('Valor do orçamento: ' + o.valorOrcamento);
  line(2);

  label('DEFEITO RELATADO PELO CLIENTE'); value(o.defeitoRelatado);
  line(2);
  label('DIAGNÓSTICO TÉCNICO'); value(o.diagnosticoTecnico);
  line(2);

  if((o.checklistEntrada && o.checklistEntrada.length) || o.checklistObs){
    label('ESTADO NA ENTRADA (CHECKLIST)');
    value([...(o.checklistEntrada||[]), o.checklistObs].filter(Boolean).join(' · '));
    line(2);
  }
  if(o.pecas){ label('PEÇAS APROVEITADAS'); value(o.pecas); line(2); }
  if(o.garantiaDias){ label('GARANTIA'); value(`${o.garantiaDias} dias${o.garantiaObs ? ' — '+o.garantiaObs : ''}`); line(2); }
  if(o.obs){ label('OBSERVAÇÃO'); value(o.obs); line(2); }

  label('DATAS'); value(`Entrada: ${fmtDate(o.dataEntrada)}    Previsão: ${fmtDate(o.previsaoEntrega)}    Conclusão/Entrega: ${fmtDate(o.dataConclusao)}`);
  line(4);

  const hist = (o.historico||[]).slice().sort((a,b)=>(a.data||'').localeCompare(b.data||''));
  if(hist.length){
    label('HISTÓRICO'); line(6);
    pdf.setFontSize(9);
    hist.forEach(h => {
      const txt = `${fmtDate(h.data)} — ${h.status}${h.texto ? ': '+h.texto : ''}${h.por ? ' ('+h.por+')' : ''}`;
      const lines = pdf.splitTextToSize(txt, right-left-4);
      pdf.text(lines, left+4, y);
      y += lines.length*4.5;
      if(y > 275){ pdf.addPage(); y = 18; }
    });
    line(4);
  }

  if(y > 245){ pdf.addPage(); y = 18; } else { line(14); }
  pdf.setDrawColor(200);
  pdf.line(left, y, left+75, y);
  pdf.line(right-75, y, right, y);
  y += 5;
  pdf.setFontSize(9);
  pdf.text('Assinatura do cliente', left, y);
  pdf.text('Assinatura do responsável técnico', right-75, y);
  line(10);
  pdf.setFontSize(8); pdf.setTextColor(140);
  pdf.text(`Documento gerado em ${fmtDate(todayStr())}`, left, y);

  pdf.save(`${o.id}.pdf`);
  showToast('O.S. exportada em PDF.');
}

function exportRecibo(o){
  if(!o){ showToast('O.S. não encontrada.'); return; }
  if(!window.jspdf){ showToast('Biblioteca de PDF ainda carregando, tente novamente em instantes.'); return; }
  const { jsPDF } = window.jspdf;
  const pdf = new jsPDF({ orientation:'portrait' });
  const c = clienteById(o.clienteId);
  const e = equipById(o.equipamentoId);
  const left = 14, right = 196;
  let y = 20;

  pdf.setFontSize(16); pdf.setFont(undefined,'bold');
  pdf.text('RECIBO DE PAGAMENTO', 105, y, { align:'center' });
  y += 8;
  pdf.setFontSize(9); pdf.setFont(undefined,'normal'); pdf.setTextColor(110);
  pdf.text('Rafael / Eduardo — (41) 9131-2064 — garage1240.oficial@gmail.com', 105, y, { align:'center' });
  pdf.setTextColor(0);
  y += 6;
  pdf.setDrawColor(200); pdf.line(left, y, right, y);
  y += 14;

  pdf.setFontSize(11);
  const valorTxt = o.valorOrcamento ? o.valorOrcamento : '—';
  pdf.text(`Valor: ${valorTxt}`, left, y);
  y += 12;

  const paragrafo = `Recebi de ${c ? c.nome : 'cliente'}${c && c.documento ? ' (CPF/CNPJ: '+c.documento+')' : ''} a quantia acima referente ao serviço de ${o.diagnosticoTecnico || o.defeitoRelatado || 'manutenção'} prestado no equipamento ${e ? e.nome : equipNome(o.equipamentoId)}${e && e.patrimonio ? ' (patrimônio '+e.patrimonio+')' : ''}, referente à O.S. ${o.id}, dando plena quitação pelo valor recebido.`;
  const lines = pdf.splitTextToSize(paragrafo, right-left);
  pdf.setFontSize(11);
  pdf.text(lines, left, y);
  y += lines.length * 6 + 10;

  pdf.setFontSize(10);
  pdf.text(`Data: ${fmtDate(todayStr())}`, left, y);
  y += 30;

  pdf.setDrawColor(200);
  pdf.line(left+35, y, left+35+90, y);
  y += 5;
  pdf.setFontSize(9);
  pdf.text('Assinatura do responsável técnico', left+35, y, { align:'center' });
  y += 16;

  pdf.setFontSize(8); pdf.setTextColor(140);
  const aviso = 'Este recibo comprova o pagamento do serviço, mas não substitui a Nota Fiscal de Serviço Eletrônica (NFS-e), quando exigida por lei.';
  const avisoLines = pdf.splitTextToSize(aviso, right-left);
  pdf.text(avisoLines, left, y);

  pdf.save(`recibo-${o.id}.pdf`);
  showToast('Recibo exportado.');
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
    const saved = loadSession();
    if(saved.role === 'admin' && TECNICOS.find(t => t.id === saved.tecnicoId)){
      session = saved;
    } else if(saved.role === 'client' && clienteById(saved.clientId)){
      session = saved;
      filters.client = { q:'', status:'' };
    } else {
      session = { role:null, clientId:null };
      clearSession();
    }
    render();
  }catch(e){
    $app.innerHTML = `<div class="loading">Erro ao conectar no Firestore: ${escapeHTML(e.message)}<br><br>Confira se preencheu firebase-config.js e se o Firestore/Authentication (Anônimo) estão ativados no seu projeto Firebase.</div>`;
  }
})();
