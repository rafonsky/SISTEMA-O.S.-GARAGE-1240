import { onUser, signOut } from './auth.js';
import { store, subscribeAll, aguardarDados } from './data/store.js';
import { renderLogin } from './views/login.js';
import { APP_VERSION } from './version.js';
import { esc } from './ui.js';

const $app = document.getElementById('app');

/* ---------- tema ---------- */
const TEMAS = ['dark', 'light', 'oled'];
const NOME_TEMA = { dark: 'escuro', light: 'claro', oled: 'OLED' };
let tema = 'dark';
try { const guardado = localStorage.getItem('g1240-theme'); if (TEMAS.includes(guardado)) tema = guardado; } catch { /* ignora */ }
const proximoTema = () => TEMAS[(TEMAS.indexOf(tema) + 1) % TEMAS.length];
const aplicarTema = () => document.documentElement.setAttribute('data-theme', tema);
function alternarTema() {
  tema = proximoTema();
  try { localStorage.setItem('g1240-theme', tema); } catch { /* ignora */ }
  aplicarTema();
  if (usuario) montarCasca();
  else renderLogin($app, { aviso: '', tema, alternarTema });
}
aplicarTema();

/* ---------- rotas ---------- */
const ROTAS = {
  inicio: { arquivo: './views/home.js', titulo: 'Início' },
  servicos: { arquivo: './views/servicos.js', titulo: 'Serviços' },
  servico: { arquivo: './views/servico.js', titulo: 'Serviço' },
  equipamentos: { arquivo: './views/equipamentos.js', titulo: 'Equipamentos' },
  clientes: { arquivo: './views/clientes.js', titulo: 'Clientes' },
  conferencia: { arquivo: './views/conferencia.js', titulo: 'Conferência' },
};
const MENU = [
  { rota: 'inicio', rotulo: 'Início', icone: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>' },
  { rota: 'servicos', rotulo: 'Serviços', icone: '<path d="M9 11l3 3 8-8"/><rect x="3" y="4" width="16" height="16" rx="2"/>' },
  { rota: 'equipamentos', rotulo: 'Equipamentos', icone: '<rect x="2" y="4" width="20" height="13" rx="2"/><path d="M8 21h8M12 17v4"/>' },
  { rota: 'clientes', rotulo: 'Clientes', icone: '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 4-6 8-6s8 2 8 6"/>' },
  { rota: 'conferencia', rotulo: 'Conferência', icone: '<path d="M9 11l3 3 8-8"/><path d="M20 12v7a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h9"/>' },
];

export function navigate(destino) {
  location.hash = `#/${destino}`;
}

function rotaAtual() {
  const [nome, ...resto] = location.hash.replace(/^#\/?/, '').split('/');
  return { nome: ROTAS[nome] ? nome : 'inicio', param: decodeURIComponent(resto.join('/')) };
}

let usuario = null;
let moduloAtual = null;
let parar = null;

function montarCasca() {
  const { nome } = rotaAtual();
  const icone = tema === 'dark'
    ? '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>'
    : '<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z"/>';
  $app.innerHTML = `
    <div class="app-shell">
      <nav class="sidebar">
        <div class="side-brand"><div class="dot"></div>
          <div class="side-brand-text">GARAGE 1240<small>Ordens de serviço</small></div>
        </div>
        <div class="side-nav">
          ${MENU.map((m) => `
            <button class="side-item ${m.rota === nome ? 'active' : ''}" data-rota="${m.rota}">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">${m.icone}</svg>
              <span>${m.rotulo}</span><span class="side-badge" id="badge-${m.rota}"></span>
            </button>`).join('')}
        </div>
        <div class="side-foot">
          <div class="side-tec">${esc(usuario?.nome)}</div>
          <button class="btn-ghost" id="btn-tema" style="width:100%; margin-top:8px; display:flex; align-items:center; justify-content:center; gap:7px;">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">${icone}</svg><span>Tema ${NOME_TEMA[proximoTema()]}</span>
          </button>
          <button class="btn-ghost" id="btn-sair" style="width:100%; margin-top:8px;">Sair</button>
          <div class="side-version">v${APP_VERSION}</div>
        </div>
      </nav>
      <main class="main-area">
        <div class="topo-mobile">
          <span class="topo-marca">GARAGE 1240 <small>v${APP_VERSION}</small></span>
          <span class="topo-acoes"><button class="btn-ghost" id="btn-tema-m" aria-label="Alternar tema">${NOME_TEMA[proximoTema()]}</button><button class="btn-ghost" id="btn-sair-m">Sair</button></span>
        </div>
        <div class="content" id="view"></div>
      </main>
    </div>`;
  $app.querySelectorAll('[data-rota]').forEach((b) => (b.onclick = () => navigate(b.dataset.rota)));
  document.getElementById('btn-tema').onclick = alternarTema;
  document.getElementById('btn-sair').onclick = () => signOut();
  document.getElementById('btn-tema-m').onclick = alternarTema;
  document.getElementById('btn-sair-m').onclick = () => signOut();
  mostrarRota();
}

async function mostrarRota() {
  const { nome, param } = rotaAtual();
  $app.querySelectorAll('[data-rota]').forEach((b) => b.classList.toggle('active', b.dataset.rota === nome));
  const view = document.getElementById('view');
  if (!view) return;
  view.innerHTML = '<div class="empty" style="border:none;">Carregando…</div>';
  try {
    await aguardarDados();
    if (document.getElementById('view') !== view) return; // a tela mudou enquanto carregava
    moduloAtual = await import(ROTAS[nome].arquivo);
    await moduloAtual.render(view, { param, navigate });
  } catch (e) {
    moduloAtual = null;
    console.error(e);
    const semAcesso = e.code === 'permission-denied';
    view.innerHTML = `<div class="empty">${semAcesso
      ? 'Sem permissão para ler os dados. Confira se seu usuário foi liberado e se as regras do Firebase foram publicadas.'
      : 'Não foi possível abrir esta tela. Verifique a conexão e tente de novo.'}<br><small>${esc(e.message)}</small></div>`;
  }
  atualizarBadge();
}

async function atualizarBadge() {
  try {
    const { findInconsistencias } = await import('./domain/inconsistencias.js');
    const n = findInconsistencias(store).length;
    const el = document.getElementById('badge-conferencia');
    if (el) el.textContent = n ? String(n) : '';
  } catch { /* tela de conferência ainda não existe */ }
}

let timer = null;
function aoMudarDados() {
  clearTimeout(timer);
  timer = setTimeout(() => {
    const view = document.getElementById('view');
    if (view && moduloAtual?.update) moduloAtual.update(view, { param: rotaAtual().param, navigate });
    atualizarBadge();
  }, 120);
}

window.addEventListener('hashchange', () => { if (usuario) mostrarRota(); });

onUser((u, aviso) => {
  usuario = u;
  parar?.();
  parar = null;
  if (!u) {
    renderLogin($app, { aviso, tema, alternarTema });
    return;
  }
  parar = subscribeAll(aoMudarDados);
  montarCasca();
});

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(() => { /* sem PWA, sem problema */ });
}
