import { useEffect } from 'react';

// Shows live progress while the PDF is built, then a success state with a
// Download button (the file also auto-downloads the moment it's ready).
export default function ExportModal({ state, onClose, onDownload }) {
  const { status, label, done = 0, total = 0, error, filename } = state;
  const pct = status === 'done' ? 100 : total > 0 ? Math.round((done / total) * 100) : 5;
  const busy = status === 'working';

  // Escape closes the modal once we're no longer mid-export.
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && !busy && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, busy]);

  return (
    <div className="overlay" onClick={() => !busy && onClose()}>
      <div className="modal export-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <div className="modal-title">
            <strong>Export PDF</strong>
            <div className="muted" style={{ fontSize: 12 }}>{filename}</div>
          </div>
          <div className="modal-actions">
            <button className="secondary" onClick={onClose} disabled={busy}>✕</button>
          </div>
        </div>

        <div className="modal-body export-body">
          {status === 'error' ? (
            <div className="banner error">⚠ {error}</div>
          ) : (
            <>
              <div className="export-status">
                {status === 'done' ? (
                  <span className="export-check">✓</span>
                ) : (
                  <span className="spinner" aria-hidden="true" />
                )}
                <span>{status === 'done' ? 'Export complete' : label}</span>
              </div>

              <div className="progress" role="progressbar" aria-valuenow={pct}>
                <span style={{ width: `${pct}%` }} />
              </div>

              {status === 'done' && (
                <button onClick={onDownload}>⬇ Download</button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
