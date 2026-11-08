export const STATUS_LIST = [
  'Recebido',
  'Em diagnóstico',
  'Aguardando aprovação',
  'Em andamento',
  'Aguardando peça',
  'No terceiro',
  'Concluído',
  'Entregue ao cliente',
  'Sem conserto – peças aproveitadas',
  'Sem conserto – devolvido ao cliente',
];

export const STATUS_FECHADOS = [
  'Concluído',
  'Entregue ao cliente',
  'Sem conserto – peças aproveitadas',
  'Sem conserto – devolvido ao cliente',
];

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
