const temNumero = (v) => v !== undefined && v !== null && v !== '' && Number.isFinite(Number(v));

export function calcMargem({ valorCobrado, terceiro }) {
  if (!temNumero(valorCobrado) || !terceiro || !temNumero(terceiro.custo)) return null;
  return Number(valorCobrado) - Number(terceiro.custo);
}

export function totalAReceber(servicos) {
  return servicos
    .filter((s) => ['Concluído', 'Entregue ao cliente'].includes(s.status) && s.pago !== true && temNumero(s.valorCobrado))
    .reduce((soma, s) => soma + Number(s.valorCobrado), 0);
}

export function formatBRL(v) {
  if (!temNumero(v)) return '—';
  return Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}
