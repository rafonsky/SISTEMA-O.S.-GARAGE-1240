import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '../firebase.js';
import { createRepo } from './repo.js';
import { currentUsuario } from '../auth.js';

// Cópias vivas dos dados, atualizadas em tempo real pelo Firestore.
export const store = { clientes: [], equipamentos: [], servicos: [] };

export const repo = createRepo({ db, getUsuario: () => currentUsuario() });

export const clienteById = (id) => store.clientes.find((c) => c.id === id) ?? null;
export const equipById = (id) => store.equipamentos.find((e) => e.id === id) ?? null;
export const servicoById = (id) => store.servicos.find((s) => s.id === id) ?? null;

export function subscribeAll(onChange) {
  const paradas = Object.keys(store).map((nome) =>
    onSnapshot(collection(db, nome), (snap) => {
      store[nome] = snap.docs.map((d) => d.data());
      onChange(nome);
    })
  );
  return () => paradas.forEach((p) => p());
}

// Histórico de alterações de um registro, mais recente primeiro.
export function subscribeLogDe(entidadeId, cb) {
  return onSnapshot(query(collection(db, 'log'), where('entidadeId', '==', entidadeId)), (snap) => {
    cb(snap.docs.map((d) => d.data()).sort((a, b) => b.em.localeCompare(a.em)));
  });
}
