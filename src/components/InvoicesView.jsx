import { useState, useEffect, useMemo } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from 'recharts';
import { getInvoices } from '../api/client.js';
import { fmtCurrency, fmtNum } from '../utils/format.js';
import Skeleton from './Skeleton.jsx';

// Meta charges 18% GST on Indian ad accounts; shown as an estimate only.
const GST_RATE = 0.18;

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const thisYear = new Date().getFullYear();
const YEARS = Array.from({ length: 5 }, (_, i) => thisYear - i);

// Every month of the year up to now, filled with zero where Meta returned nothing.
function fillMonths(year, months) {
  const byKey = Object.fromEntries(months.map((m) => [m.month, m]));
  const last = year === thisYear ? new Date().getMonth() : 11;
  return Array.from({ length: last + 1 }, (_, i) => {
    const key = `${year}-${String(i + 1).padStart(2, '0')}`;
    const m = byKey[key] || { month: key, spend: 0, impressions: 0, clicks: 0, reach: 0 };
    const gst = m.spend * GST_RATE;
    return { ...m, label: `${MONTHS[i]} ${year}`, gst, total: m.spend + gst };
  });
}

function downloadCsv(rows, filename) {
  const head = ['Month', 'Spend', 'Est. GST (18%)', 'Est. total paid', 'Impressions', 'Clicks'];
  const lines = rows.map((r) =>
    [r.label, r.spend.toFixed(2), r.gst.toFixed(2), r.total.toFixed(2), r.impressions ?? '', r.clicks ?? ''].join(',')
  );
  const blob = new Blob([[head.join(','), ...lines].join('\n')], { type: 'text/csv' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

export default function InvoicesView({ accounts, accountId, setAccountId }) {
  const [year, setYear] = useState(thisYear);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!accountId) return;
    let alive = true;
    setLoading(true);
    setError('');
    getInvoices({ accountId, year })
      .then((d) => alive && setData(d))
      .catch((e) => {
        if (!alive) return;
        setError(e.message);
        setData(null);
      })
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [accountId, year]);

  const rows = useMemo(() => (data ? fillMonths(data.year, data.months) : []), [data]);
  const totals = useMemo(
    () =>
      rows.reduce(
        (a, r) => ({ spend: a.spend + r.spend, gst: a.gst + r.gst, total: a.total + r.total }),
        { spend: 0, gst: 0, total: 0 }
      ),
    [rows]
  );

  const acct = data?.account;
  const cards = acct
    ? [
        { label: `Spend in ${data.year}`, value: fmtCurrency(totals.spend) },
        { label: 'Est. GST (18%)', value: fmtCurrency(totals.gst) },
        { label: 'Est. total paid', value: fmtCurrency(totals.total) },
        { label: 'Lifetime spent', value: fmtCurrency(acct.lifetimeSpent) },
        { label: 'Balance due', value: fmtCurrency(acct.balance) },
        { label: 'Payment method', value: acct.paymentMethod || '—', small: true },
      ]
    : [];

  return (
    <>
      <div className="toolbar">
        <div className="field">
          <label>Ad account</label>
          <select value={accountId} onChange={(e) => setAccountId(e.target.value)}>
            {accounts.length === 0 && <option value="">Loading…</option>}
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
                {a.currency ? ` (${a.currency})` : ''}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>Year</label>
          <select value={year} onChange={(e) => setYear(Number(e.target.value))}>
            {YEARS.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </div>
        <button
          className="secondary"
          disabled={!rows.length}
          onClick={() => downloadCsv(rows, `Meta-Billing-${acct?.name || accountId}-${year}.csv`)}
        >
          ⬇ Export CSV
        </button>
      </div>

      {error && <div className="banner error">⚠ {error}</div>}
      {loading && <Skeleton />}

      {!loading && data && (
        <>
          <div className="kpis">
            {cards.map((c) => (
              <div className="kpi" key={c.label}>
                <div className="label">{c.label}</div>
                <div className={`value ${c.small ? 'value-sm' : ''}`}>{c.value}</div>
              </div>
            ))}
          </div>

          <div className="panel">
            <h2>Monthly spend — {data.year}</h2>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={rows} margin={{ left: 10, right: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e5ea" />
                <XAxis dataKey="label" stroke="#6b7480" tick={{ fontSize: 11 }} tickFormatter={(s) => s.slice(0, 3)} />
                <YAxis stroke="#6b7480" tickFormatter={(v) => `₹${Math.round(v / 1000)}k`} />
                <Tooltip
                  formatter={(v) => fmtCurrency(v)}
                  contentStyle={{ background: '#ffffff', border: '1px solid #e2e5ea', borderRadius: 8 }}
                />
                <Bar dataKey="spend" name="Spend" fill="#2563eb" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="panel">
            <h2>Monthly billing</h2>
            <div className="table-wrap">
              <table className="invoice-table">
                <thead>
                  <tr>
                    <th>Month</th>
                    <th>Spend</th>
                    <th>Est. GST (18%)</th>
                    <th>Est. total paid</th>
                    <th>Impressions</th>
                    <th>Clicks</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.month}>
                      <td>{r.label}</td>
                      <td>{fmtCurrency(r.spend)}</td>
                      <td>{fmtCurrency(r.gst)}</td>
                      <td>{fmtCurrency(r.total)}</td>
                      <td>{fmtNum(r.impressions)}</td>
                      <td>{fmtNum(r.clicks)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td>Total</td>
                    <td>{fmtCurrency(totals.spend)}</td>
                    <td>{fmtCurrency(totals.gst)}</td>
                    <td>{fmtCurrency(totals.total)}</td>
                    <td colSpan={2} />
                  </tr>
                </tfoot>
              </table>
            </div>
            <p className="muted note">
              Spend is from Meta insights. GST is an 18% estimate — check the official
              receipts in Ads Manager → Billing for exact amounts.
            </p>
          </div>

          <div className="panel">
            <h2>
              Official Meta invoices <span className="muted">({data.invoices.length})</span>
            </h2>
            {data.invoices.length > 0 ? (
              <div className="table-wrap">
                <table className="invoice-table">
                  <thead>
                    <tr>
                      <th>Invoice #</th>
                      <th>Date</th>
                      <th>Status</th>
                      <th>Net</th>
                      <th>Tax</th>
                      <th>Total</th>
                      <th>PDF</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.invoices.map((i) => (
                      <tr key={i.id}>
                        <td>{i.id}</td>
                        <td>{i.date}</td>
                        <td>{i.status || '—'}</td>
                        <td>{fmtCurrency(i.net)}</td>
                        <td>{fmtCurrency(i.tax)}</td>
                        <td>{fmtCurrency(i.total)}</td>
                        <td>
                          {i.downloadUrl ? (
                            <a href={i.downloadUrl} target="_blank" rel="noreferrer">
                              Download
                            </a>
                          ) : (
                            '—'
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="muted note">{data.invoicesNote || 'No invoices for this period.'}</p>
            )}
          </div>
        </>
      )}
    </>
  );
}
