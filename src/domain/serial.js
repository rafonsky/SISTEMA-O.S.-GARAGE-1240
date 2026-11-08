export function normalizeSerial(s) {
  return String(s ?? '').toUpperCase().replace(/[\s\-.]/g, '');
}

export function normalizeNome(s) {
  return String(s ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
}
