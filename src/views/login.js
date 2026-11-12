import { signIn } from '../auth.js';
import { esc } from '../ui.js';
import { APP_VERSION } from '../version.js';

export function renderLogin($app, { aviso, alternarTema }) {
  $app.innerHTML = `
    <div class="entrada">
      <aside class="entrada-marca" aria-hidden="true">
        <div class="entrada-brilho"></div>
        <div class="entrada-selo"><span>G</span></div>
        <div class="entrada-nome">GARAGE<b>1240</b></div>
        <p class="entrada-frase">Computadores &amp; Audiovisual</p>
        <div class="entrada-rodape"><span>Portal de O.S.</span><span>v${APP_VERSION}</span></div>
      </aside>

      <main class="entrada-form">
        <form class="entrada-cartao" id="form-login" novalidate>
          <div class="entrada-selo entrada-selo-mini"><span>G</span></div>
          <h1>Entrar</h1>
          <p class="entrada-sub">Acesso restrito à equipe da Garage 1240.</p>

          <div class="field"><label for="l-email">E-mail</label>
            <input type="email" id="l-email" autocomplete="username" inputmode="email" placeholder="voce@garage1240.com"></div>
          <div class="field"><label for="l-senha">Senha</label>
            <div class="entrada-senha">
              <input type="password" id="l-senha" autocomplete="current-password" placeholder="••••••••">
              <button type="button" class="entrada-olho" id="l-mostrar" aria-pressed="false">Mostrar</button>
            </div>
          </div>
          <button class="btn-primary" type="submit" id="l-entrar">Entrar</button>
          <div class="err" id="l-erro" role="alert">${esc(aviso)}</div>
          <div class="entrada-pe">
            <span>v${APP_VERSION}</span><button type="button" class="link-btn" id="l-tema">Alternar tema</button>
          </div>
        </form>
      </main>
    </div>`;
  const erro = document.getElementById('l-erro');
  const campoSenha = document.getElementById('l-senha');
  const olho = document.getElementById('l-mostrar');
  olho.onclick = () => {
    const mostrar = campoSenha.type === 'password';
    campoSenha.type = mostrar ? 'text' : 'password';
    olho.textContent = mostrar ? 'Ocultar' : 'Mostrar';
    olho.setAttribute('aria-pressed', String(mostrar));
  };
  document.getElementById('l-tema').onclick = alternarTema;
  document.getElementById('form-login').onsubmit = async (e) => {
    e.preventDefault();
    const email = document.getElementById('l-email').value;
    const senha = campoSenha.value;
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
