// Checklist de conferência na entrada do equipamento. Lista inicial: o dono ajusta com a equipe.
// Cada pergunta é escrita de forma que "Sim" seja o estado normal; o que for "Não" é anotado na observação.

const COMUNS = [
  { id: 'liga', pergunta: 'O equipamento liga?' },
  { id: 'carcaca', pergunta: 'Carcaça sem riscos ou amassados?' },
  { id: 'fonte', pergunta: 'Acompanha fonte/carregador?' },
  { id: 'cabo', pergunta: 'Acompanha cabo de força?' },
];

const INFORMATICA = [
  { id: 'tela', pergunta: 'Tela sem trincas ou riscos?' },
  { id: 'teclado', pergunta: 'Teclado e touchpad funcionando?' },
  { id: 'bateria', pergunta: 'Bateria presente?' },
  { id: 'parafusos', pergunta: 'Parafusos completos e tampa fechada?' },
  { id: 'armazenamento', pergunta: 'HD/SSD e memória presentes?' },
  { id: 'senha', pergunta: 'O cliente informou a senha de acesso?' },
  { id: 'dados', pergunta: 'Cliente avisado do risco aos dados (backup)?' },
];

const OUTROS = [
  { id: 'imagem-som', pergunta: 'Imagem e som funcionam ao ligar?' },
  { id: 'conectores', pergunta: 'Entradas e conectores sem danos?' },
  { id: 'controle', pergunta: 'Acompanha controle remoto?' },
  { id: 'acessorios', pergunta: 'Cabos e acessórios conferidos e anotados?' },
];

const FECHAMENTO = [{ id: 'cliente-ciente', pergunta: 'Cliente conferiu e concordou com o estado registrado?' }];

export const RESPOSTAS = ['sim', 'nao', 'na'];

export function itensPara(tipo) {
  return [...COMUNS, ...(tipo === 'informatica' ? INFORMATICA : OUTROS), ...FECHAMENTO];
}

export function resumoChecklist(tipo, respostas) {
  const itens = itensPara(tipo);
  const r = respostas ?? {};
  const faltam = itens.filter((i) => !RESPOSTAS.includes(r[i.id]));
  return { total: itens.length, respondidos: itens.length - faltam.length, faltam, completo: faltam.length === 0 };
}

// Devolve um novo mapa de respostas. Tocar de novo na mesma resposta desfaz (volta a "não respondido").
export function definirResposta(respostas, id, valor) {
  if (!RESPOSTAS.includes(valor)) throw new Error(`Resposta inválida: ${valor}`);
  const novo = { ...(respostas ?? {}) };
  if (novo[id] === valor) delete novo[id];
  else novo[id] = valor;
  return novo;
}

// Endereço que o QR code abre: a ficha da O.S., na mesma versão do sistema que está aberta agora.
export function linkDaOs({ origin, pathname }, osId) {
  return `${origin}${pathname}#/servico/${encodeURIComponent(osId)}`;
}

export const enderecoSoDoComputador = (hostname) => ['localhost', '127.0.0.1', '[::1]'].includes(hostname);
