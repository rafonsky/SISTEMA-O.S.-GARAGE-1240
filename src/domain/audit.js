function achatar(obj, prefixo = '', saida = {}) {
  for (const [k, v] of Object.entries(obj ?? {})) {
    const caminho = prefixo ? `${prefixo}.${k}` : k;
    if (v && typeof v === 'object' && !Array.isArray(v)) achatar(v, caminho, saida);
    else saida[caminho] = v === undefined ? null : v;
  }
  return saida;
}

// Ausente, nulo e texto vazio contam como a mesma coisa ("sem valor"), para o histórico não registrar ruído.
const semValor = (v) => v === null || v === undefined || v === '';

export function diffCampos(antes, depois) {
  const a = achatar(antes);
  const d = achatar(depois);
  const campos = [...new Set([...Object.keys(a), ...Object.keys(d)])];
  return campos
    .filter((c) => !(semValor(a[c]) && semValor(d[c])) && JSON.stringify(a[c] ?? null) !== JSON.stringify(d[c] ?? null))
    .map((c) => ({ campo: c, antes: a[c] ?? null, depois: d[c] ?? null }));
}

export function buildLogEntry({ entidade, entidadeId, acao, antes, depois, usuario, agora }) {
  return {
    id: `log-${globalThis.crypto.randomUUID()}`,
    em: agora,
    por: { uid: usuario.uid, nome: usuario.nome },
    entidade,
    entidadeId,
    acao,
    mudancas: diffCampos(antes, depois),
  };
}
