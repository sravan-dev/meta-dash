import { fmtCurrency, fmtNum, fmtPct } from '../utils/format.js';

export default function KpiCards({ rows }) {
  const sum = (key) => rows.reduce((a, r) => a + (r[key] || 0), 0);

  const spend = sum('amountSpent');
  const results = sum('results');
  const impressions = sum('impressions');
  const reach = sum('reach');
  const clicks = sum('clicksAll');
  // Total leads: prefer the explicit lead action; fall back to results.
  const leads = sum('leads') || results;

  const cards = [
    { label: 'Amount spent', value: fmtCurrency(spend) },
    { label: 'Total leads', value: fmtNum(leads) },
    { label: 'Results', value: fmtNum(results) },
    { label: 'Cost per result', value: results ? fmtCurrency(spend / results) : '—' },
    { label: 'Cost per click', value: clicks ? fmtCurrency(spend / clicks) : '—' },
    { label: 'Impressions', value: fmtNum(impressions) },
    { label: 'Reach', value: fmtNum(reach) },
    { label: 'CTR (all)', value: impressions ? fmtPct((clicks / impressions) * 100) : '—' },
    { label: 'Total clicks', value: fmtNum(clicks) },
    { label: 'CPM', value: impressions ? fmtCurrency((spend / impressions) * 1000) : '—' },
    { label: 'Frequency', value: reach ? (impressions / reach).toFixed(2) : '—' },
  ];

  return (
    <div className="kpis">
      {cards.map((c) => (
        <div className="kpi" key={c.label}>
          <div className="label">{c.label}</div>
          <div className="value">{c.value}</div>
        </div>
      ))}
    </div>
  );
}
