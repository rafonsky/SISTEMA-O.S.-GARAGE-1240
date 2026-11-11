import { signIn } from '../auth.js';
import { esc } from '../ui.js';
import { APP_VERSION } from '../version.js';

export function renderLogin($app, { aviso, alternarTema }) {
  $app.innerHTML = `
    <div class="login-wrap">
      <form class="ticket" id="form-login" novalidate>
        <div class="ticket-head">
          <span class="login-wordmark"><span class="g-word">GARAGE</span> <span class="n-word">1240</span><small>Computadores &amp; Audiovisual</small></span>
          <h1>Ordens de serviço</h1>
          <p>Acesso restrito à equipe.</p>
        </div>
        <div class="ticket-body">
          <div class="field"><label for="l-email">E-mail</label>
            <input type="email" id="l-email" autocomplete="username" inputmode="email" style="font-family:var(--font-body);"></div>
          <div class="field"><label for="l-senha">Senha</label>
            <input type="password" id="l-senha" autocomplete="current-password" style="font-family:var(--font-body);">
            <label class="mostrar-senha" for="l-mostrar" style="display:flex; align-items:center; gap:8px; margin-top:10px; font-size:14px; cursor:pointer;">
              <input type="checkbox" id="l-mostrar" style="width:auto; margin:0;"> Mostrar senha
            </label>
          </div>
          <button class="btn-primary" type="submit" id="l-entrar">Entrar</button>
          <div class="err" id="l-erro" role="alert">${esc(aviso)}</div>
          <div class="hint" style="display:flex; justify-content:space-between;">
            <span>v${APP_VERSION}</span><button type="button" class="link-btn" id="l-tema">Alternar tema</button>
          </div>
        </div>
      </form>
    </div>`;
  const erro = document.getElementById('l-erro');
  document.getElementById('l-mostrar').onchange = (e) => {
    document.getElementById('l-senha').type = e.target.checked ? 'text' : 'password';
  };
  document.getElementById('l-tema').onclick = alternarTema;
  document.getElementById('form-login').onsubmit = async (e) => {
    e.preventDefault();
    const email = document.getElementById('l-email').value;
    const senha = document.getElementById('l-senha').value;
    const botao = document.getElementById('l-entrar');
    erro.textContent = '';
    if (!email.trim() || !senha) { erro.textContent = 'Preencha e-mail e senha.'; return; }
    botao.disabled = true;
    botao.textContent = 'Entrando…';
    try {
      await signIn(email, senha);
    } catch (err) {
      erro.textContent = err.message;
      botao.disabled = false;
      botao.textContent = 'Entrar';
    }
  };
}
