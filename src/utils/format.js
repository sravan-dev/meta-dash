const inr = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 2,
});
const numFmt = new Intl.NumberFormat('en-IN');

export const fmtCurrency = (v) => (v == null ? '—' : inr.format(v));
export const fmtNum = (v) => (v == null ? '—' : numFmt.format(Math.round(v)));
export const fmtDec = (v, d = 2) => (v == null ? '—' : Number(v).toFixed(d));
export const fmtPct = (v) => (v == null ? '—' : `${Number(v).toFixed(2)}%`);
