// Anterior e próxima O.S. a partir da atual. Com uma fila (ex.: a lista da Conferência), segue a fila;
// sem fila, ou se a atual não estiver nela, segue todas as O.S. em ordem numérica.
const numero = (id) => Number(String(id).replace(/\D/g, '')) || 0;

export function vizinhos(servicos, atualId, fila = null) {
  const existentes = new Set(servicos.map((s) => s.id));
  const daFila = (fila ?? []).filter((id) => existentes.has(id));
  const ids = daFila.includes(atualId)
    ? daFila
    : servicos.map((s) => s.id).sort((a, b) => numero(a) - numero(b));
  const i = ids.indexOf(atualId);
  if (i < 0) return { anterior: null, proxima: null };
  return { anterior: ids[i - 1] ?? null, proxima: ids[i + 1] ?? null };
}

// Fila deixada por quem abriu a ficha (Conferência). Vive só enquanto a página está aberta.
let fila = null;
export const definirFila = (ids) => { fila = ids; };
export const filaAtual = () => fila;
