// Frontend API client. Calls the local Express proxy (never Meta directly).
const BASE = import.meta.env.VITE_API_BASE || '/api';

export async function getAccounts() {
  const res = await fetch(`${BASE}/accounts`);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Request failed (${res.status})`);
  }
  return res.json(); // { accounts, default }
}

export async function getInsights({ since, until, level = 'ad', accountId } = {}) {
  const params = new URLSearchParams();
  if (since) params.set('since', since);
  if (until) params.set('until', until);
  if (level) params.set('level', level);
  if (accountId) params.set('accountId', accountId);

  const res = await fetch(`${BASE}/insights?${params.toString()}`);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Request failed (${res.status})`);
  }
  const { rows } = await res.json();
  return rows;
}

export async function getCreatives(adIds) {
  const res = await fetch(`${BASE}/creatives`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ adIds }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Request failed (${res.status})`);
  }
  const { map } = await res.json();
  return map;
}

export async function getImageDataUrl(url) {
  const res = await fetch(`${BASE}/image?url=${encodeURIComponent(url)}`);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Request failed (${res.status})`);
  }
  const { dataUrl } = await res.json();
  return dataUrl;
}

export async function getPreview(adId, format) {
  const params = new URLSearchParams({ adId });
  if (format) params.set('format', format);

  const res = await fetch(`${BASE}/preview?${params.toString()}`);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Request failed (${res.status})`);
  }
  const { html } = await res.json();
  return html;
}
