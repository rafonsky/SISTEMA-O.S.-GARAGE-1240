// Regras puras das fotos da O.S. (o envio em si fica em src/data/fotos.js).

export const MAX_FOTOS = 20;
export const LADO_MAXIMO = 1280; // maior lado da foto depois de reduzida, em pixels

// Reduz mantendo a proporção; nunca amplia.
export function dimensoesReduzidas(largura, altura, maximo = LADO_MAXIMO) {
  if (!(largura > 0) || !(altura > 0)) return { largura: 1, altura: 1 };
  const fator = Math.min(1, maximo / Math.max(largura, altura));
  return { largura: Math.max(1, Math.round(largura * fator)), altura: Math.max(1, Math.round(altura * fator)) };
}

export const caminhoDaFoto = (osId, instante, sufixo) => `servicos/${osId}/${instante}-${sufixo}.jpg`;

export function nomeDoArquivo(nome) {
  const limpo = String(nome ?? '').replace(/[\/:*?"<>|]+/g, '-').trim().slice(0, 80);
  return limpo || 'foto';
}

export const removerFoto = (fotos, id) => (fotos ?? []).filter((f) => f.id !== id);
