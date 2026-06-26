import { useEffect, useState } from 'react';

// Full-size creative viewer. Click the backdrop, the ✕, or press Esc to close.
export default function ImageLightbox({ src, title, onClose }) {
  const [error, setError] = useState(false);

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="overlay" onClick={onClose}>
      <div className="lightbox" onClick={(e) => e.stopPropagation()}>
        <button className="lightbox-close secondary" onClick={onClose} aria-label="Close">
          ✕
        </button>
        {error ? (
          <div className="banner error">Image could not be loaded.</div>
        ) : (
          <img src={src} alt={title || 'Creative'} onError={() => setError(true)} />
        )}
        {title && <div className="lightbox-cap">{title}</div>}
      </div>
    </div>
  );
}
