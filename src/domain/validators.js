import { STATUS_LIST, TIPOS_EQUIPAMENTO } from './status.js';
import { normalizeSerial, normalizeNome } from './serial.js';

const vazio = (v) => v === undefined || v === null || String(v).trim() === '';
const resultado = (erros) => ({ ok: erros.length === 0, erros });

export function validateCliente(c) {
  const erros = [];
  if (vazio(c?.nome)) erros.push('Informe o nome do cliente.');
  return resultado(erros);
}

export function validateEquipamento(e) {
  const erros = [];
  if (vazio(e?.nome)) erros.push('Informe o nome do equipamento.');
  if (vazio(e?.clienteId)) erros.push('Escolha o cliente.');
  if (!TIPOS_EQUIPAMENTO.includes(e?.tipo)) erros.push('Escolha o tipo do equipamento.');
  return resultado(erros);
}

export function validateServico(s) {
  const erros = [];
  if (vazio(s?.clienteId)) erros.push('Escolha o cliente.');
  if (vazio(s?.equipamentoId)) erros.push('Escolha o equipamento.');
  if (vazio(s?.relatoCliente)) erros.push('Registre o relato do cliente.');
  if (vazio(s?.dataEntrada)) erros.push('Informe a data de entrada.');
  if (!STATUS_LIST.includes(s?.status)) erros.push('Escolha um status válido.');
  if (!vazio(s?.valorCobrado) && !(Number(s.valorCobrado) >= 0)) erros.push('O valor cobrado não pode ser negativo.');
  return resultado(erros);
}

export function findDuplicateEquip(lista, novo) {
  const serieNova = normalizeSerial(novo.serie);
  const nomeNovo = normalizeNome(novo.nome);
  return (
    lista.find((e) => {
      if (e.id === novo.id || e.clienteId !== novo.clienteId) return false;
      const serie = normalizeSerial(e.serie);
      if (serie && serieNova) return serie === serieNova;
      if (!serie && !serieNova) return normalizeNome(e.nome) === nomeNovo;
      return false;
    }) ?? null
  );
}
