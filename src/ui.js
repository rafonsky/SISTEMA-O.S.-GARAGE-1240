// Utilidades de interface compartilhadas pelas telas.

export function esc(v) {
  if (v === null || v === undefined) return '';
  return String(v).replace(/[&<>"']/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
}

export function hojeStr() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function fmtData(d) {
  if (!d) return '—';
  const [a, m, dia] = String(d).split('-');
  return a && m && dia ? `${dia}/${m}/${a}` : d;
}

export function toast(msg) {
  let t = document.getElementById('toast');
  if (!t) {
    t = document.createElement('div');
    t.id = 'toast';
    t.className = 'toast';
    document.body.appendChild(t);
  }
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(t._timer);
  t._timer = setTimeout(() => t.classList.remove('show'), 3200);
}

const pilha = [];

export function openModal(html, extraClass = '') {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `<div class="modal ${extraClass}">${html}</div>`;
  overlay.addEventListener('click', (e) => { if (e.target === overlay) closeModal(); });
  document.body.appendChild(overlay);
  pilha.push(overlay);
  return overlay.firstElementChild;
}

export function closeModal() {
  pilha.pop()?.remove();
}

export function confirmar(titulo, texto, rotulo = 'Confirmar', perigo = false) {
  return new Promise((resolve) => {
    const m = openModal(`
      <h3>${esc(titulo)}</h3>
      <p style="color:var(--text-dim); font-size:13.5px; margin:0 0 18px;">${esc(texto)}</p>
      <div class="modal-actions">
        <button class="btn-secondary" data-n>Cancelar</button>
        <button class="btn-small-primary ${perigo ? 'btn-danger-solid' : ''}" data-s>${esc(rotulo)}</button>
      </div>`);
    m.querySelector('[data-n]').onclick = () => { closeModal(); resolve(false); };
    m.querySelector('[data-s]').onclick = () => { closeModal(); resolve(true); };
  });
}

export function semAcento(s) {
  return String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}
