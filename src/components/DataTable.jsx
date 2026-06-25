import { useState, useMemo, useEffect } from 'react';
import { fmtCurrency, fmtNum, fmtDec, fmtPct } from '../utils/format.js';

const COLS = [
  { key: 'campaignName', label: 'Campaign', fmt: (v) => v },
  { key: 'ads', label: 'Ad', fmt: (v) => v },
  { key: 'adSetName', label: 'Ad set', fmt: (v) => v },
  { key: 'resultType', label: 'Result type', fmt: (v) => v },
  { key: 'results', label: 'Results', fmt: fmtNum },
  { key: 'reach', label: 'Reach', fmt: fmtNum },
  { key: 'frequency', label: 'Freq.', fmt: (v) => fmtDec(v, 2) },
  { key: 'costPerResult', label: 'Cost/result', fmt: fmtCurrency },
  { key: 'amountSpent', label: 'Spent', fmt: fmtCurrency },
  { key: 'impressions', label: 'Impr.', fmt: fmtNum },
  { key: 'cpm', label: 'CPM', fmt: fmtCurrency },
  { key: 'cpcLink', label: 'CPC (link)', fmt: fmtCurrency },
  { key: 'ctr', label: 'CTR', fmt: fmtPct },
  { key: 'clicksAll', label: 'Clicks', fmt: fmtNum },
  { key: 'cpcAll', label: 'CPC (all)', fmt: fmtCurrency },
];

const PAGE_SIZE = 30;

export default function DataTable({ rows, onPreview }) {
  const [sort, setSort] = useState({ key: 'amountSpent', dir: 'desc' });
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(0);

  // Table-local text search across the identifier columns.
  const searched = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) =>
      [r.campaignName, r.ads, r.adSetName]
        .filter(Boolean)
        .some((s) => s.toLowerCase().includes(q))
    );
  }, [rows, query]);

  const sorted = useMemo(() => {
    const { key, dir } = sort;
    const mult = dir === 'asc' ? 1 : -1;
    return [...searched].sort((a, b) => {
      const av = a[key];
      const bv = b[key];
      if (typeof av === 'number' || typeof bv === 'number') {
        return ((av || 0) - (bv || 0)) * mult;
      }
      return String(av || '').localeCompare(String(bv || '')) * mult;
    });
  }, [searched, sort]);

  const pageCount = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));

  // Keep the page in range when the data/search changes.
  useEffect(() => {
    setPage((p) => Math.min(p, pageCount - 1));
  }, [pageCount]);

  const start = page * PAGE_SIZE;
  const pageRows = sorted.slice(start, start + PAGE_SIZE);

  const toggle = (key) => {
    setSort((s) => ({ key, dir: s.key === key && s.dir === 'desc' ? 'asc' : 'desc' }));
    setPage(0);
  };

  const arrow = (key) => (sort.key === key ? (sort.dir === 'desc' ? ' ▼' : ' ▲') : '');

  return (
    <div>
      <div className="table-controls">
        <input
          className="table-search"
          placeholder="🔍 Search this table…"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setPage(0);
          }}
        />
        <span className="muted">{sorted.length} rows</span>
      </div>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th className="preview-col">Preview</th>
              {COLS.map((c) => (
                <th key={c.key} onClick={() => toggle(c.key)}>
                  {c.label}
                  {arrow(c.key)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {pageRows.map((r, i) => (
              <tr key={start + i}>
                <td className="preview-col">
                  {r.adId ? (
                    <button className="link-btn" onClick={() => onPreview(r)}>
                      Show
                    </button>
                  ) : (
                    <span className="muted">—</span>
                  )}
                </td>
                {COLS.map((c) => (
                  <td key={c.key}>{c.fmt(r[c.key])}</td>
                ))}
              </tr>
            ))}
            {pageRows.length === 0 && (
              <tr>
                <td colSpan={COLS.length + 1} className="muted" style={{ textAlign: 'center', padding: 24 }}>
                  No rows match “{query}”.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="pagination">
        <span className="muted">
          {sorted.length === 0
            ? '0 of 0'
            : `${start + 1}–${Math.min(start + PAGE_SIZE, sorted.length)} of ${sorted.length}`}
        </span>
        <div className="pager">
          <button className="secondary" onClick={() => setPage(0)} disabled={page === 0}>
            « First
          </button>
          <button className="secondary" onClick={() => setPage((p) => p - 1)} disabled={page === 0}>
            ‹ Prev
          </button>
          <span className="page-info">
            Page {page + 1} of {pageCount}
          </span>
          <button
            className="secondary"
            onClick={() => setPage((p) => p + 1)}
            disabled={page >= pageCount - 1}
          >
            Next ›
          </button>
          <button
            className="secondary"
            onClick={() => setPage(pageCount - 1)}
            disabled={page >= pageCount - 1}
          >
            Last »
          </button>
        </div>
      </div>
    </div>
  );
}
