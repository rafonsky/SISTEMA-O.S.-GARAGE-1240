// Envio das fotos da O.S. para o Firebase Storage. A foto é reduzida no próprio aparelho antes de subir.
import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { storage } from '../firebase.js';
import { dimensoesReduzidas, caminhoDaFoto, nomeDoArquivo } from '../domain/fotos.js';

async function reduzir(arquivo) {
  let imagem;
  try {
    imagem = await createImageBitmap(arquivo, { imageOrientation: 'from-image' });
  } catch {
    throw new Error('Não foi possível abrir esta foto. Tente tirar de novo ou escolher um arquivo JPG ou PNG.');
  }
  const { largura, altura } = dimensoesReduzidas(imagem.width, imagem.height);
  const canvas = document.createElement('canvas');
  canvas.width = largura;
  canvas.height = altura;
  canvas.getContext('2d').drawImage(imagem, 0, 0, largura, altura);
  imagem.close?.();
  return new Promise((ok, falha) => canvas.toBlob((b) => (b ? ok(b) : falha(new Error('Não foi possível preparar a foto.'))), 'image/jpeg', 0.8));
}

export async function enviarFoto(osId, arquivo, por) {
  if (!String(arquivo.type).startsWith('image/')) throw new Error('Escolha um arquivo de imagem.');
  const blob = await reduzir(arquivo);
  const sufixo = Math.random().toString(36).slice(2, 8);
  const path = caminhoDaFoto(osId, Date.now(), sufixo);
  const destino = ref(storage, path);
  await uploadBytes(destino, blob, { contentType: 'image/jpeg' });
  return { id: `ft-${sufixo}`, path, url: await getDownloadURL(destino), nome: nomeDoArquivo(arquivo.name), em: new Date().toISOString(), por: por ?? '' };
}

// Se o arquivo já não existe, tudo bem: o que importa é a foto sair da O.S.
export const apagarArquivo = (path) => deleteObject(ref(storage, path)).catch(() => {});
