// O emulador do Firestore, ao limpar os dados, tenta avisar streams de escuta que o processo
// de teste anterior deixou para trás; essa chamada cancelada faz o clearFirestore falhar uma vez.
// Tentar de novo resolve (a limpeza seguinte já não encontra o stream morto).
export async function limparFirestore(env, tentativas = 3) {
  for (let i = 1; ; i++) {
    try {
      await env.clearFirestore();
      return;
    } catch (e) {
      if (i >= tentativas || !/already cancelled|CANCELLED/i.test(String(e?.message))) throw e;
      await new Promise((r) => setTimeout(r, 150 * i));
    }
  }
}
