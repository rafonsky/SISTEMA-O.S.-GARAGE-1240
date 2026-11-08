// Devolve uma cópia da lista com o item novo (ou substituído, pelo id).
export function upsertLista(lista, item) {
  return [...lista.filter((x) => x.id !== item.id), item];
}
