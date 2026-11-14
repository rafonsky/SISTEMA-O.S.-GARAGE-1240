// Ícone da marca (monitor com prompt). Contorno acompanha a cor do texto do tema.
export function iconeMarca(tamanho = 40) {
  return `<svg class="marca-icone" viewBox="0 0 48 48" width="${tamanho}" height="${tamanho}" fill="none" aria-hidden="true" focusable="false">
    <rect x="4" y="5" width="40" height="29" rx="5.5" stroke="currentColor" stroke-width="3"/>
    <path d="M12 13.5l5.2 4.2-5.2 4.2" stroke="#ff7a1a" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M12 28h12" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/>
    <path d="M27.5 28h6.5" stroke="#ff7a1a" stroke-width="2.6" stroke-linecap="round"/>
    <circle cx="37.5" cy="11" r="1.9" fill="#22c55e"/>
    <path d="M21 34.5h6l1.4 4.5h-8.8z" fill="currentColor"/>
    <rect x="14.5" y="38.5" width="19" height="3.6" rx="1.8" fill="currentColor"/>
  </svg>`;
}
