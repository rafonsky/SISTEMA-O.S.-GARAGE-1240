// Equipamentos que a Conferência quer mostrar sozinhos na lista (ex.: o par de duplicados).
// Vale só até a pessoa sair de Equipamentos/Conferência ou clicar em "Ver todos".
let ids = null;
export const definirFoco = (lista) => { ids = lista; };
export const focoAtual = () => ids;
