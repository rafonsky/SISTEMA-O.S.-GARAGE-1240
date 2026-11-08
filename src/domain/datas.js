// Datas são sempre strings AAAA-MM-DD, no fuso local de quem usa.

export function hojeStr() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function fmtData(d) {
  if (!d) return '—';
  const [a, m, dia] = String(d).split('-');
  return a && m && dia ? `${dia}/${m}/${a}` : d;
}

// "05 a 07/11/2026" (mesmo mês), "28/10/2026 a 02/11/2026", ou a data única.
export function periodoTexto(inicio, fim) {
  const a = inicio || '';
  const b = fim || '';
  if (!a && !b) return '—';
  if (!a || !b || a === b) return fmtData(a || b);
  const [ya, ma, da] = a.split('-');
  const [yb, mb, db] = b.split('-');
  if (ya === yb && ma === mb) return `${da} a ${db}/${mb}/${yb}`;
  return `${fmtData(a)} a ${fmtData(b)}`;
}

export function dataValida(d) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(d))) return false;
  const [a, m, dia] = d.split('-').map(Number);
  const dt = new Date(Date.UTC(a, m - 1, dia));
  return dt.getUTCFullYear() === a && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === dia;
}
