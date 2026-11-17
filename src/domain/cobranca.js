// Cobrança rápida de uma O.S. (valor e, se for o caso, pagamento). Função pura: devolve uma cópia da O.S.
export const FORMAS_PAGAMENTO = ['PIX', 'Dinheiro', 'Cartão de débito', 'Cartão de crédito', 'Transferência', 'Outra'];

export function aplicarCobranca(servico, { valor, pago = false, forma = '' }, hoje) {
  const texto = String(valor ?? '').trim().replace(',', '.');
  const numero = texto === '' ? NaN : Number(texto);
  if (!Number.isFinite(numero) || numero < 0) return { ok: false, erro: 'Informe um valor cobrado válido (zero ou mais).' };
  if (forma && !FORMAS_PAGAMENTO.includes(forma)) return { ok: false, erro: 'Escolha uma forma de pagamento da lista.' };
  const atualizado = { ...servico, valorCobrado: numero };
  if (pago) {
    atualizado.pago = true;
    atualizado.dataPagamento = servico.dataPagamento || hoje;
    atualizado.formaPagamento = forma;
  }
  return { ok: true, servico: atualizado };
}
