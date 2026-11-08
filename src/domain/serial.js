export function normalizeSerial(s) {
  return String(s ?? '').toUpperCase().replace(/[\s\-.]/g, '');
}

export function semAcento(s) {
  return String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

export function normalizeNome(s) {
  return String(s ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
}
