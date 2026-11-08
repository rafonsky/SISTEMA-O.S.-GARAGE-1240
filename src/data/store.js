import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '../firebase.js';
import { createRepo } from './repo.js';
import { upsertLista } from '../domain/lista.js';
import { currentUsuario } from '../auth.js';

// Cópias vivas dos dados, atualizadas em tempo real pelo Firestore.
export const store = { clientes: [], equipamentos: [], servicos: [] };

export const repo = createRepo({ db, getUsuario: () => currentUsuario() });

export const clienteById = (id) => store.clientes.find((c) => c.id === id) ?? null;
export const equipById = (id) => store.equipamentos.find((e) => e.id === id) ?? null;
export const servicoById = (id) => store.servicos.find((s) => s.id === id) ?? null;

let resolverPronto;
let rejeitarPronto;
let pronto = new Promise((ok, falha) => { resolverPronto = ok; rejeitarPronto = falha; });
pronto.catch(() => {}); // o erro é mostrado por quem espera; evita aviso de rejeição não tratada

// Depois de gravar, atualiza a cópia local na hora (a transação só chega pelo servidor um instante depois).
export function guardarLocal(colecao, item) {
  store[colecao] = upsertLista(store[colecao], item);
}

// Resolve quando a primeira carga de todas as coleções chegou (evita telas "não encontrado" ao recarregar).
export const aguardarDados = () => pronto;

export function subscribeAll(onChange) {
  pronto = new Promise((ok, falha) => { resolverPronto = ok; rejeitarPronto = falha; });
  pronto.catch(() => {});
  const carregadas = new Set();
  const paradas = Object.keys(store).map((nome) =>
    onSnapshot(collection(db, nome), (snap) => {
      store[nome] = snap.docs.map((d) => d.data());
      carregadas.add(nome);
      if (carregadas.size === Object.keys(store).length) resolverPronto();
      onChange(nome);
    }, (erro) => rejeitarPronto(erro))
  );
  return () => paradas.forEach((p) => p());
}

// Histórico de alterações de um registro, mais recente primeiro.
export function subscribeLogDe(entidadeId, cb) {
  return onSnapshot(query(collection(db, 'log'), where('entidadeId', '==', entidadeId)), (snap) => {
    cb(snap.docs.map((d) => d.data()).sort((a, b) => b.em.localeCompare(a.em)));
  });
}
