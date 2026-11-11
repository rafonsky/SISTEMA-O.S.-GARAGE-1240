import { signInWithEmailAndPassword, signOut as fbSignOut, onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from './firebase.js';
import { normalizarPapel } from './domain/papeis.js';

let usuarioAtual = null;
export const currentUsuario = () => usuarioAtual;

const MENSAGENS = {
  'auth/invalid-credential': 'E-mail ou senha incorretos.',
  'auth/wrong-password': 'E-mail ou senha incorretos.',
  'auth/user-not-found': 'E-mail ou senha incorretos.',
  'auth/invalid-email': 'Digite um e-mail válido.',
  'auth/too-many-requests': 'Muitas tentativas. Espere alguns minutos e tente de novo.',
  'auth/network-request-failed': 'Sem conexão com a internet.',
};

export async function signIn(email, senha) {
  try {
    await signInWithEmailAndPassword(auth, email.trim(), senha);
  } catch (e) {
    throw new Error(MENSAGENS[e.code] ?? 'Não foi possível entrar. Tente de novo.');
  }
}

export const signOut = () => fbSignOut(auth);

// Chama cb com {uid, email, nome} quando há um membro logado, ou null caso contrário.
export function onUser(cb) {
  return onAuthStateChanged(auth, async (user) => {
    if (!user) {
      usuarioAtual = null;
      return cb(null);
    }
    try {
      const snap = await getDoc(doc(db, 'usuarios', user.uid));
      if (!snap.exists()) {
        await fbSignOut(auth);
        usuarioAtual = null;
        return cb(null, 'Este usuário ainda não foi liberado. Fale com o administrador.');
      }
      usuarioAtual = { uid: user.uid, email: user.email, nome: snap.data().nome ?? user.email, papel: normalizarPapel(snap.data().role) };
      cb(usuarioAtual);
    } catch (e) {
      usuarioAtual = null;
      cb(null, 'Não foi possível confirmar seu acesso.');
    }
  });
}
