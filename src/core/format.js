// Formatação de números no padrão brasileiro: 1,2K / 3,4M / 5,6B / 7,8T
const SUFFIXES = ['', 'K', 'M', 'B', 'T', 'Qa', 'Qi', 'Sx', 'Sp', 'Oc', 'No', 'Dc'];

export function fmt(n, decimals = 1) {
  if (!Number.isFinite(n)) return '∞';
  const neg = n < 0;
  n = Math.abs(n);
  let out;
  if (n < 1000) {
    out = n < 10 && n % 1 !== 0 ? n.toFixed(1).replace('.', ',') : Math.floor(n).toString();
  } else {
    const tier = Math.min(SUFFIXES.length - 1, Math.floor(Math.log10(n) / 3));
    const scaled = n / Math.pow(1000, tier);
    const d = scaled >= 100 ? 0 : decimals;
    out = scaled.toFixed(d).replace('.', ',').replace(/,0$/, '') + SUFFIXES[tier];
  }
  return (neg ? '-' : '') + out;
}

/** Dinheiro: "R$ 1,2K". */
export function fmtMoney(n, decimals = 1) {
  return `R$ ${fmt(n, decimals)}`;
}

export function fmtInt(n) {
  return Math.floor(n).toLocaleString('pt-BR');
}

export function fmtPct(x) {
  return `${Math.round(x * 100)}%`;
}

export function fmtTime(sec) {
  sec = Math.max(0, Math.floor(sec));
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (h > 0) return `${h}h ${String(m).padStart(2, '0')}min`;
  if (m > 0) return `${m}min ${String(s).padStart(2, '0')}s`;
  return `${s}s`;
}
