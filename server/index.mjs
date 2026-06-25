import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import {
  fetchInsights,
  fetchPreview,
  fetchAccounts,
  fetchCreatives,
  fetchImageDataUrl,
} from './meta.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '.env') });

const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors());
app.use(express.json({ limit: '1mb' }));

app.get('/api/health', (_req, res) => res.json({ ok: true }));

// GET /api/accounts -> { accounts: [{id,name,currency}], default }
app.get('/api/accounts', async (_req, res) => {
  try {
    const accounts = await fetchAccounts();
    res.json({ accounts, default: process.env.META_AD_ACCOUNT_ID || '' });
  } catch (err) {
    console.error('[accounts] error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/insights?since=2026-01-01&until=2026-05-13&level=ad&accountId=123
app.get('/api/insights', async (req, res) => {
  try {
    const { since, until, level, accountId } = req.query;
    const rows = await fetchInsights({ since, until, level, accountId });
    res.json({ rows });
  } catch (err) {
    console.error('[insights] error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/preview?adId=123&format=DESKTOP_FEED_STANDARD
app.get('/api/preview', async (req, res) => {
  try {
    const { adId, format } = req.query;
    const html = await fetchPreview(adId, format);
    res.json({ html });
  } catch (err) {
    console.error('[preview] error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/creatives  body: { adIds: [...] } -> { map: { adId: thumbnail_url } }
app.post('/api/creatives', async (req, res) => {
  try {
    const map = await fetchCreatives(req.body?.adIds || []);
    res.json({ map });
  } catch (err) {
    console.error('[creatives] error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/image?url=<meta cdn url> -> { dataUrl }
app.get('/api/image', async (req, res) => {
  try {
    const dataUrl = await fetchImageDataUrl(req.query.url);
    res.json({ dataUrl });
  } catch (err) {
    console.error('[image] error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Serve the built React app (Vite output) so this runs as a single Node
// process in production — the frontend and /api live on the same origin.
const distDir = join(__dirname, '..', 'dist');
app.use(express.static(distDir));

// SPA fallback: any non-API GET returns index.html so client routing works.
app.get(/^\/(?!api\/).*/, (_req, res) => {
  res.sendFile(join(distDir, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Meta proxy listening on http://localhost:${PORT}`);
});
