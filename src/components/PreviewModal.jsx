import { useEffect, useState } from 'react';
import { getPreview } from '../api/client.js';

const FORMATS = [
  { value: 'DESKTOP_FEED_STANDARD', label: 'Facebook Feed' },
  { value: 'MOBILE_FEED_STANDARD', label: 'Mobile Feed' },
  { value: 'INSTAGRAM_STANDARD', label: 'Instagram' },
  { value: 'INSTAGRAM_STORY', label: 'Instagram Story' },
];

export default function PreviewModal({ ad, onClose }) {
  const [html, setHtml] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [format, setFormat] = useState('DESKTOP_FEED_STANDARD');

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError('');
    setHtml('');
    getPreview(ad.adId, format)
      .then((h) => {
        if (!alive) return;
        if (!h) setError('No preview available for this ad in this placement.');
        else setHtml(h);
      })
      .catch((e) => alive && setError(e.message))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [ad.adId, format]);

  // Close on Escape.
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <div className="modal-title">
            <strong>{ad.ads || ad.campaignName}</strong>
            <div className="muted" style={{ fontSize: 12 }}>{ad.campaignName}</div>
          </div>
          <div className="modal-actions">
            <select value={format} onChange={(e) => setFormat(e.target.value)}>
              {FORMATS.map((f) => (
                <option key={f.value} value={f.value}>{f.label}</option>
              ))}
            </select>
            <button className="secondary" onClick={onClose}>✕</button>
          </div>
        </div>
        <div className="modal-body">
          {loading && <div className="muted">Loading creative preview…</div>}
          {error && <div className="banner error">{error}</div>}
          {!loading && !error && html && (
            <div className="preview-frame" dangerouslySetInnerHTML={{ __html: html }} />
          )}
        </div>
      </div>
    </div>
  );
}
