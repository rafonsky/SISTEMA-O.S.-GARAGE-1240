export const STATUS_LIST = [
  'Recebido',
  'Em diagnóstico',
  'Aguardando aprovação',
  'Em andamento',
  'Aguardando peça',
  'No terceiro',
  'Concluído',
  'Entregue ao cliente',
  'Recusado pelo cliente',
  'Sem conserto – peças aproveitadas',
  'Sem conserto – devolvido ao cliente',
];

export const STATUS_FECHADOS = [
  'Concluído',
  'Entregue ao cliente',
  'Recusado pelo cliente',
  'Sem conserto – peças aproveitadas',
  'Sem conserto – devolvido ao cliente',
];

// O valor guardado no banco continua "Concluído"; só o nome mostrado muda.
const ROTULOS = { 'Concluído': 'Pronto para retirada' };
export const rotuloStatus = (status) => ROTULOS[status] ?? status;

// Status em que pode haver valor a receber (no recusado, só se cobrar taxa de diagnóstico).
export const STATUS_COM_COBRANCA = ['Concluído', 'Entregue ao cliente', 'Recusado pelo cliente'];

// A data de conclusão é preenchida ao entrar nestes status, sem sobrescrever a que já existe.
const STATUS_COM_CONCLUSAO = ['Concluído', 'Entregue ao cliente', 'Recusado pelo cliente'];
export const dataDeConclusao = (status, atual, hoje) => (atual || (STATUS_COM_CONCLUSAO.includes(status) ? hoje : ''));

export const STATUS_ABERTOS = STATUS_LIST.filter((s) => !STATUS_FECHADOS.includes(s));

// Caminho mostrado no topo da ficha do serviço.
export const ETAPAS = [
  'Recebido',
  'Em diagnóstico',
  'Aguardando aprovação',
  'Em andamento',
  'No terceiro',
  'Concluído',
  'Entregue ao cliente',
];

export const TIPOS_EQUIPAMENTO = ['informatica', 'outros'];
