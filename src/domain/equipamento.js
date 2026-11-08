const ROTULOS = { informatica: 'Informática', outros: 'Outros' };
export const rotuloTipo = (tipo) => ROTULOS[tipo] ?? 'Outros';

const CAMPOS_SPECS = [
  ['cpu', 'CPU'], ['ram', 'RAM'], ['armazenamento', 'Armaz.'], ['gpu', 'GPU'], ['tela', 'Tela'], ['so', 'SO'],
];

export function specsLinha(e) {
  if (!e || e.tipo !== 'informatica' || !e.specs) return '';
  return CAMPOS_SPECS.filter(([k]) => e.specs[k]).map(([k, rotulo]) => `${rotulo}: ${e.specs[k]}`).join(' · ');
}
