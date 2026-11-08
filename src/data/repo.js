import {
  doc, collection, getDoc, getDocs, query, where, limit, runTransaction, writeBatch,
} from 'firebase/firestore';
import { buildLogEntry } from '../domain/audit.js';
import { normalizeSerial } from '../domain/serial.js';
import { validateCliente, validateEquipamento, validateServico } from '../domain/validators.js';

const limpar = (o) => JSON.parse(JSON.stringify(o)); // Firestore não aceita undefined
const novoId = (prefixo) => `${prefixo}-${Math.random().toString(36).slice(2, 8)}`;
const formatarOs = (n) => `OS-${String(n).padStart(4, '0')}`;

function exigirValido({ ok, erros }) {
  if (!ok) throw new Error(erros.join(' '));
}

export function createRepo({ db, getUsuario }) {
  const log = (entidade, entidadeId, acao, antes, depois) =>
    buildLogEntry({ entidade, entidadeId, acao, antes, depois, usuario: getUsuario(), agora: new Date().toISOString() });

  async function gravar(colecao, objeto) {
    const ref = doc(db, colecao, objeto.id);
    const existente = await getDoc(ref);
    const antes = existente.exists() ? existente.data() : null;
    const entrada = log(colecao, objeto.id, antes ? 'editar' : 'criar', antes, objeto);
    const batch = writeBatch(db);
    batch.set(ref, objeto);
    batch.set(doc(db, 'log', entrada.id), entrada);
    await batch.commit();
    return objeto;
  }

  async function apagar(colecao, id) {
    const ref = doc(db, colecao, id);
    const existente = await getDoc(ref);
    if (!existente.exists()) return;
    const entrada = log(colecao, id, 'excluir', existente.data(), null);
    const batch = writeBatch(db);
    batch.delete(ref);
    batch.set(doc(db, 'log', entrada.id), entrada);
    await batch.commit();
  }

  const contar = async (colecao, campo, valor) =>
    (await getDocs(query(collection(db, colecao), where(campo, '==', valor), limit(50)))).size;

  return {
    async saveCliente(c) {
      exigirValido(validateCliente(c));
      return gravar('clientes', limpar({ ...c, id: c.id ?? novoId('cli') }));
    },

    async saveEquipamento(e) {
      exigirValido(validateEquipamento(e));
      const serie = String(e.serie ?? '').trim();
      return gravar('equipamentos', limpar({ ...e, id: e.id ?? novoId('eq'), serie, serieNorm: normalizeSerial(serie) }));
    },

    async nextOsId() {
      const ref = doc(db, 'config', 'counters');
      return runTransaction(db, async (tx) => {
        const snap = await tx.get(ref);
        const proximo = (snap.exists() ? snap.data().nextOs ?? 0 : 0) + 1;
        tx.set(ref, { nextOs: proximo }, { merge: true });
        return formatarOs(proximo);
      });
    },

    async saveServico(s) {
      exigirValido(validateServico(s));
      const counterRef = doc(db, 'config', 'counters');
      return runTransaction(db, async (tx) => {
        // No Firestore, todas as leituras da transação vêm antes de qualquer escrita.
        let id = s.id;
        let proximo = null;
        let existente;
        if (!id) {
          // Se o contador ficou para trás de uma O.S. que já existe, pula para o próximo número livre.
          const c = await tx.get(counterRef);
          proximo = (c.exists() ? c.data().nextOs ?? 0 : 0) + 1;
          for (let tentativa = 0; tentativa < 200; tentativa++) {
            id = formatarOs(proximo);
            existente = await tx.get(doc(db, 'servicos', id));
            if (!existente.exists()) break;
            proximo += 1;
          }
          if (existente.exists()) throw new Error('Não foi possível reservar um número de O.S. livre.');
        } else {
          existente = await tx.get(doc(db, 'servicos', id));
        }
        const ref = doc(db, 'servicos', id);
        const antes = existente.exists() ? existente.data() : null;
        if (proximo !== null) tx.set(counterRef, { nextOs: proximo }, { merge: true });
        const objeto = limpar({ ...s, id });
        const entrada = log('servicos', id, antes ? 'editar' : 'criar', antes, objeto);
        tx.set(ref, objeto);
        tx.set(doc(db, 'log', entrada.id), entrada);
        return objeto;
      });
    },

    async removeServico(id) {
      await apagar('servicos', id);
    },

    async removeEquipamento(id) {
      const n = await contar('servicos', 'equipamentoId', id);
      if (n > 0) throw new Error(`Não é possível excluir: há ${n} serviço(s) vinculado(s) a este equipamento.`);
      await apagar('equipamentos', id);
    },

    async removeCliente(id) {
      const eq = await contar('equipamentos', 'clienteId', id);
      const sv = await contar('servicos', 'clienteId', id);
      if (eq > 0 || sv > 0) {
        throw new Error(`Não é possível excluir: há ${eq} equipamento(s) e ${sv} serviço(s) vinculado(s) a este cliente.`);
      }
      await apagar('clientes', id);
    },
  };
}
