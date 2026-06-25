import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from 'recharts';
import { fmtCurrency } from '../utils/format.js';

// Top 10 campaigns by spend.
export default function SpendChart({ rows }) {
  const byCampaign = {};
  for (const r of rows) {
    const k = r.campaignName || '(none)';
    byCampaign[k] = (byCampaign[k] || 0) + (r.amountSpent || 0);
  }
  const data = Object.entries(byCampaign)
    .map(([name, spend]) => ({ name, spend }))
    .sort((a, b) => b.spend - a.spend)
    .slice(0, 10);

  return (
    <div className="panel">
      <h2>Top campaigns by spend</h2>
      <ResponsiveContainer width="100%" height={320}>
        <BarChart data={data} layout="vertical" margin={{ left: 20, right: 20 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e5ea" />
          <XAxis type="number" stroke="#6b7480" tickFormatter={(v) => `₹${Math.round(v / 1000)}k`} />
          <YAxis
            type="category"
            dataKey="name"
            width={180}
            stroke="#6b7480"
            tick={{ fontSize: 11 }}
            tickFormatter={(s) => (s.length > 26 ? s.slice(0, 24) + '…' : s)}
          />
          <Tooltip
            formatter={(v) => fmtCurrency(v)}
            contentStyle={{ background: '#ffffff', border: '1px solid #e2e5ea', borderRadius: 8 }}
          />
          <Bar dataKey="spend" fill="#2563eb" radius={[0, 4, 4, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
