import { useState, useMemo, useEffect, useRef } from 'react';
import { getInsights, getAccounts } from './api/client.js';
import { exportToPdf, downloadBlob } from './utils/exportPdf.js';
import KpiCards from './components/KpiCards.jsx';
import SpendChart from './components/SpendChart.jsx';
import DataTable from './components/DataTable.jsx';
import PreviewModal from './components/PreviewModal.jsx';
import ExportModal from './components/ExportModal.jsx';
import Skeleton from './components/Skeleton.jsx';

const pad = (n) => String(n).padStart(2, '0');

// Format a Date as a local YYYY-MM-DD string.
const ymd = (d) => {
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
};

// Quick date-range presets, computed relative to today.
const PRESETS = [
  { key: 'prevweek', label: 'Last 7 days', apply: (d) => d.setDate(d.getDate() - 7) },
  { key: '1m', label: '1 month', apply: (d) => d.setMonth(d.getMonth() - 1) },
  { key: '2m', label: '2 months', apply: (d) => d.setMonth(d.getMonth() - 2) },
  { key: '3m', label: '3 months', apply: (d) => d.setMonth(d.getMonth() - 3) },
];

function presetRange(preset) {
  const until = new Date();
  const since = new Date();
  preset.apply(since);
  return { since: ymd(since), until: ymd(until) };
}

export default function App() {
  const initialRange = presetRange(PRESETS[0]); // Last 7 days
  const [since, setSince] = useState(initialRange.since);
  const [until, setUntil] = useState(initialRange.until);
  const [level, setLevel] = useState('ad');
  const [search, setSearch] = useState('');
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [previewAd, setPreviewAd] = useState(null);
  const [accounts, setAccounts] = useState([]);
  const [accountId, setAccountId] = useState('');
  const [exportState, setExportState] = useState(null);
  const [activePreset, setActivePreset] = useState(PRESETS[0].key); // Last 7 days
  const [connected, setConnected] = useState(null); // null = checking, true/false
  const didAutoLoad = useRef(false);

  async function handleExport() {
    const now = new Date();
    const stamp = `${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}`;
    const filename = `Creative-Report-${since}_to_${until}_${stamp}.pdf`;
    setExportState({ status: 'working', label: 'Preparing…', done: 0, total: 0, filename });
    try {
      const { blob } = await exportToPdf(filtered, {
        filename,
        onProgress: (done, total, label) =>
          setExportState((s) => (s ? { ...s, done, total, label: label ?? s.label } : s)),
      });
      downloadBlob(blob, filename); // auto-download as soon as it's ready
      setExportState((s) => (s ? { ...s, status: 'done', blob } : s));
    } catch (e) {
      setExportState((s) => (s ? { ...s, status: 'error', error: e.message } : s));
    }
  }

  // Load the list of ad accounts the token can access, once on mount.
  useEffect(() => {
    getAccounts()
      .then(({ accounts, default: def }) => {
        setAccounts(accounts);
        const fallback = accounts[0]?.id || '';
        const preselect = accounts.some((a) => a.id === def) ? def : fallback;
        setAccountId(preselect);
        setConnected(true);
      })
      .catch((e) => {
        setError(`Could not connect to Meta: ${e.message}`);
        setConnected(false);
      });
  }, []);

  // Auto-fetch the default (Last 7 days) report once the account is ready.
  useEffect(() => {
    if (accountId && !didAutoLoad.current) {
      didAutoLoad.current = true;
      load();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accountId]);

  async function load(range) {
    const s = range?.since ?? since;
    const u = range?.until ?? until;
    setLoading(true);
    setError('');
    try {
      const data = await getInsights({ since: s, until: u, level, accountId });
      setRows(data);
      setLoaded(true);
    } catch (e) {
      setError(e.message);
      setRows([]);
    } finally {
      setLoading(false);
    }
  }

  // Client-side text filter across the identifier columns.
  const filtered = useMemo(() => {
    if (!search.trim()) return rows;
    const q = search.toLowerCase();
    return rows.filter((r) =>
      [r.campaignName, r.ads, r.adSetName]
        .filter(Boolean)
        .some((s) => s.toLowerCase().includes(q))
    );
  }, [rows, search]);

  return (
    <div className="app">
      <header className="top">
        <div className="brand">
          <img className="brand-tijus" src="/fav.png" alt="Tijus Academy" />
          <svg className="brand-logo" viewBox="0 0 24 24" width="34" height="34" aria-hidden="true">
            <path
              fill="#0866FF"
              d="M6.915 4.03c-1.968 0-3.683 1.28-4.871 3.113C.704 9.208 0 11.883 0 14.449c0 .706.07 1.369.21 1.973a6.624 6.624 0 0 0 .265.86 5.297 5.297 0 0 0 .371.761c.696 1.159 1.818 1.927 3.593 1.927 1.497 0 2.633-.671 3.965-2.444.76-1.012 1.144-1.626 2.663-4.32l.756-1.339.186-.325c.061.1.121.196.183.3l2.152 3.595c.724 1.21 1.665 2.556 2.47 3.314 1.046.987 1.992 1.22 3.06 1.22 1.075 0 1.876-.355 2.455-.843a3.743 3.743 0 0 0 .81-.973c.542-.939.861-2.127.861-3.745 0-2.72-.681-5.357-2.084-7.45-1.282-1.912-2.957-2.93-4.716-2.93-1.047 0-2.088.467-3.053 1.308-.652.57-1.257 1.29-1.82 2.05-.69-.875-1.335-1.547-1.958-2.056-1.182-.966-2.315-1.303-3.454-1.303zm10.16 2.053c1.147 0 2.188.758 2.992 1.999 1.132 1.748 1.647 4.195 1.647 6.4 0 1.548-.368 2.9-1.839 2.9-.58 0-1.027-.23-1.664-1.004-.496-.601-1.343-1.878-2.832-4.358l-.617-1.028a44.908 44.908 0 0 0-1.255-1.98c.07-.109.141-.224.211-.327 1.12-1.667 2.118-2.602 3.158-2.602zm-10.201.553c1.265 0 2.058.791 2.675 1.446.307.327.737.871 1.234 1.579l-1.02 1.566c-.757 1.163-1.882 3.017-2.837 4.338-1.191 1.649-1.81 1.817-2.486 1.817-.524 0-1.038-.237-1.383-.794-.263-.426-.464-1.13-.464-2.046 0-2.221.63-4.535 1.66-6.088.454-.687.964-1.226 1.533-1.533a2.264 2.264 0 0 1 1.087-.282z"
            />
          </svg>
          <div>
            <h1>Meta Tracker</h1>
            <div className="sub">Ad-level performance pulled live from the Meta Marketing API</div>
          </div>
        </div>
        <div className="top-right">
          <span
            className={`status ${
              connected === true ? 'ok' : connected === false ? 'down' : 'checking'
            }`}
          >
            <span className="dot" />
            {connected === true ? 'Connected' : connected === false ? 'Not connected' : 'Connecting…'}
          </span>
          <button
            onClick={handleExport}
            disabled={!filtered.length || exportState?.status === 'working'}
          >
            {exportState?.status === 'working' ? 'Exporting…' : '⬇ Export PDF'}
          </button>
        </div>
      </header>

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
          <label>Reporting starts</label>
          <input
            type="date"
            value={since}
            onChange={(e) => {
              setSince(e.target.value);
              setActivePreset('');
            }}
          />
        </div>
        <div className="field">
          <label>Reporting ends</label>
          <input
            type="date"
            value={until}
            onChange={(e) => {
              setUntil(e.target.value);
              setActivePreset('');
            }}
          />
        </div>
        <div className="field">
          <label>Level</label>
          <select value={level} onChange={(e) => setLevel(e.target.value)}>
            <option value="ad">Ad</option>
            <option value="adset">Ad set</option>
            <option value="campaign">Campaign</option>
          </select>
        </div>
        <div className="field">
          <label>Search</label>
          <input
            placeholder="Filter by campaign / ad…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <button onClick={() => load()} disabled={loading}>
          {loading ? 'Loading…' : 'Fetch report'}
        </button>
      </div>

      <div className="quick">
        <span className="quick-label">Quick range:</span>
        {PRESETS.map((p) => (
          <button
            key={p.key}
            className={`chip ${activePreset === p.key ? 'active' : ''}`}
            disabled={loading}
            onClick={() => {
              const r = presetRange(p);
              setSince(r.since);
              setUntil(r.until);
              setActivePreset(p.key);
              load(r);
            }}
          >
            {p.label}
          </button>
        ))}
      </div>

      {error && (
        <div className="banner error">
          {/request limit|rate limit|reduce the amount/i.test(error) ? (
            <>
              ⚠ Meta rate limit reached. Showing the last loaded data if available —
              wait a few minutes and try again. (Completing Business Verification raises this limit.)
            </>
          ) : (
            <>⚠ {error}</>
          )}
        </div>
      )}
      {!loading && loaded && level !== 'ad' && (
        <div className="banner info">
          Creative previews are only available at the <b>Ad</b> level. Switch the
          <b> Level</b> dropdown to <b>Ad</b> and fetch again to see the <b>Show</b> buttons.
        </div>
      )}

      {loading && <Skeleton />}

      {!loading && loaded && (
        <>
          <KpiCards rows={filtered} />
          <SpendChart rows={filtered} />
          <div className="panel">
            <h2>
              Rows <span className="muted">({filtered.length})</span>
            </h2>
            <DataTable rows={filtered} onPreview={setPreviewAd} />
          </div>
        </>
      )}

      {previewAd && <PreviewModal ad={previewAd} onClose={() => setPreviewAd(null)} />}

      {exportState && (
        <ExportModal
          state={exportState}
          onClose={() => setExportState(null)}
          onDownload={() => downloadBlob(exportState.blob, exportState.filename)}
        />
      )}
    </div>
  );
}
