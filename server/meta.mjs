// Talks to the Meta Marketing (Graph) API and maps each row to the exact
// columns of the New-Creative-Report spreadsheet.

const GRAPH = 'https://graph.facebook.com';

// --- Simple in-memory cache to avoid burning the Meta rate limit ---
// Repeated requests for the same data within the TTL are served from memory.
// On a rate-limit error we fall back to stale cache if we have any.
const INSIGHTS_TTL = 10 * 60 * 1000; // 10 minutes
const PREVIEW_TTL = 30 * 60 * 1000; // 30 minutes
const cache = new Map(); // key -> { ts, data }

function getFresh(key, ttl) {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.ts < ttl) return hit.data;
  return undefined;
}
function getStale(key) {
  return cache.get(key)?.data;
}
function setCache(key, data) {
  cache.set(key, { ts: Date.now(), data });
}
const isRateLimit = (msg) =>
  /request limit|rate limit|#4\b|reduce the amount|too many calls/i.test(msg || '');

// Fields requested at the "ad" level. These cover every column in the report.
const FIELDS = [
  'ad_id',
  'campaign_name',
  'adset_name',
  'ad_name',
  'reach',
  'frequency',
  'impressions',
  'spend',
  'cpm',
  'ctr',
  'clicks',
  'cpc',
  'inline_link_click_ctr',
  'cost_per_inline_link_click',
  'actions',
  'action_values',
  'cost_per_action_type',
  'objective',
].join(',');

const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

// Pull a single action value (e.g. number of leads) out of the actions array.
const pickAction = (arr, type) => {
  if (!Array.isArray(arr)) return null;
  const hit = arr.find((a) => a.action_type === type);
  return hit ? Number(hit.value) : null;
};

// First matching purchase value (revenue) from action_values, for ROAS.
const PURCHASE_TYPES = ['omni_purchase', 'purchase', 'offsite_conversion.fb_pixel_purchase'];
const pickPurchaseValue = (arr) => {
  for (const t of PURCHASE_TYPES) {
    const v = pickAction(arr, t);
    if (v != null) return v;
  }
  return null;
};

function transformRow(r, { resultAction, resultLabel }) {
  const spend = num(r.spend);
  const results = pickAction(r.actions, resultAction);
  const costPerResult =
    pickAction(r.cost_per_action_type, resultAction) ??
    (results ? spend / results : null);
  const clicks = num(r.clicks);
  const leads = pickAction(r.actions, 'lead');
  const purchaseValue = pickPurchaseValue(r.action_values);

  // Keys here must match COLUMNS in src/utils/exportExcel.js
  return {
    adId: r.ad_id ?? null,
    campaignName: r.campaign_name ?? '',
    ads: r.ad_name ?? '',
    adSetName: r.adset_name ?? '',
    resultType: results != null ? resultLabel : '',
    results,
    reach: num(r.reach),
    frequency: num(r.frequency),
    costPerResult,
    amountSpent: spend,
    impressions: num(r.impressions),
    cpm: num(r.cpm),
    cpcLink: num(r.cost_per_inline_link_click) ?? num(r.cpc),
    ctr: num(r.inline_link_click_ctr),
    clicksAll: clicks,
    cpcAll: spend != null && clicks ? spend / clicks : null,
    leads,
    purchaseValue,
    reportingStarts: r.date_start ?? '',
    reportingEnds: r.date_stop ?? '',
  };
}

// Lists every ad account the access token can see.
export async function fetchAccounts() {
  const token = process.env.META_ACCESS_TOKEN;
  const version = process.env.META_API_VERSION || 'v21.0';
  if (!token) throw new Error('Missing META_ACCESS_TOKEN.');

  const cacheKey = 'accounts';
  const fresh = getFresh(cacheKey, PREVIEW_TTL); // reuse 30-min TTL
  if (fresh !== undefined) return fresh;

  const params = new URLSearchParams({
    fields: 'name,account_id,currency',
    limit: '200',
    access_token: token,
  });
  let url = `${GRAPH}/${version}/me/adaccounts?${params.toString()}`;
  const raw = [];

  try {
    while (url) {
      const resp = await fetch(url);
      const json = await resp.json();
      if (json.error) throw new Error(`Meta API: ${json.error.message}`);
      raw.push(...(json.data || []));
      url = json.paging?.next || null;
    }
  } catch (err) {
    if (isRateLimit(err.message)) {
      const stale = getStale(cacheKey);
      if (stale !== undefined) return stale;
    }
    throw err;
  }

  const accounts = raw.map((a) => ({
    id: a.account_id,
    name: a.name || a.account_id,
    currency: a.currency || '',
  }));
  setCache(cacheKey, accounts);
  return accounts;
}

export async function fetchInsights({ since, until, level = 'ad', accountId }) {
  const token = process.env.META_ACCESS_TOKEN;
  const acct = accountId || process.env.META_AD_ACCOUNT_ID;
  const version = process.env.META_API_VERSION || 'v21.0';
  const resultAction = process.env.META_RESULT_ACTION || 'lead';
  const resultLabel = process.env.META_RESULT_LABEL || 'Leads (form)';

  if (!token || !acct) {
    throw new Error(
      'Missing credentials. Copy server/.env.example to server/.env and set META_ACCESS_TOKEN and META_AD_ACCOUNT_ID.'
    );
  }

  const cacheKey = `insights:${acct}:${level}:${since || ''}:${until || ''}`;
  const fresh = getFresh(cacheKey, INSIGHTS_TTL);
  if (fresh) return fresh;

  const params = new URLSearchParams({
    level,
    fields: FIELDS,
    limit: '500',
    access_token: token,
  });
  if (since && until) {
    params.set('time_range', JSON.stringify({ since, until }));
  } else {
    params.set('date_preset', 'maximum');
  }

  let url = `${GRAPH}/${version}/act_${acct}/insights?${params.toString()}`;
  const raw = [];

  try {
    // Follow pagination until there are no more pages.
    while (url) {
      const resp = await fetch(url);
      const json = await resp.json();
      if (json.error) throw new Error(`Meta API: ${json.error.message}`);
      raw.push(...(json.data || []));
      url = json.paging?.next || null;
    }
  } catch (err) {
    // If rate-limited, serve the last successful result rather than failing.
    if (isRateLimit(err.message)) {
      const stale = getStale(cacheKey);
      if (stale) return stale;
    }
    throw err;
  }

  const data = raw.map((r) => transformRow(r, { resultAction, resultLabel }));
  setCache(cacheKey, data);
  return data;
}

// Returns the rendered ad-preview iframe HTML for a single ad.
// adFormat options: DESKTOP_FEED_STANDARD, MOBILE_FEED_STANDARD,
// INSTAGRAM_STANDARD, INSTAGRAM_STORY, etc.
export async function fetchPreview(adId, adFormat = 'DESKTOP_FEED_STANDARD') {
  const token = process.env.META_ACCESS_TOKEN;
  const version = process.env.META_API_VERSION || 'v21.0';
  if (!token) throw new Error('Missing META_ACCESS_TOKEN.');
  if (!adId) throw new Error('adId is required.');

  const cacheKey = `preview:${adId}:${adFormat}`;
  const fresh = getFresh(cacheKey, PREVIEW_TTL);
  if (fresh !== undefined) return fresh;

  const params = new URLSearchParams({ ad_format: adFormat, access_token: token });
  const url = `${GRAPH}/${version}/${adId}/previews?${params.toString()}`;

  let html;
  try {
    const resp = await fetch(url);
    const json = await resp.json();
    if (json.error) throw new Error(`Meta API: ${json.error.message}`);
    // Meta returns an array of { body: "<iframe ...></iframe>" }.
    html = json.data?.[0]?.body || '';
  } catch (err) {
    // If rate-limited, serve the last successful preview rather than failing.
    if (isRateLimit(err.message)) {
      const stale = getStale(cacheKey);
      if (stale !== undefined) return stale;
    }
    throw err;
  }

  setCache(cacheKey, html);
  return html;
}

// Fetch creative thumbnail URLs for a specific set of ad ids, using Meta's
// batch `?ids=` endpoint (50 per call). Only fetches ids not already cached,
// so re-exports are nearly free. Returns a map { [adId]: thumbnail_url }.
const THUMB_SIZE = 480; // request larger thumbnails so the PDF squares aren't blurry

export async function fetchCreatives(adIds = []) {
  const token = process.env.META_ACCESS_TOKEN;
  const version = process.env.META_API_VERSION || 'v21.0';
  if (!token) throw new Error('Missing META_ACCESS_TOKEN.');

  const ids = [...new Set(adIds.filter(Boolean).map(String))];
  const result = {};
  const missing = [];

  // Cache key includes the size so changing THUMB_SIZE invalidates old small URLs.
  const ckey = (id) => `creative:${id}:${THUMB_SIZE}`;

  // Serve cached thumbnails; collect the rest.
  for (const id of ids) {
    const cached = getFresh(ckey(id), PREVIEW_TTL);
    if (cached !== undefined) {
      if (cached) result[id] = cached;
    } else {
      missing.push(id);
    }
  }

  // Batch the missing ids, 50 at a time.
  for (let i = 0; i < missing.length; i += 50) {
    const chunk = missing.slice(i, i + 50);
    const params = new URLSearchParams({
      ids: chunk.join(','),
      // Size params must be applied to the creative node itself (field modifier),
      // not the ad — the nested {thumbnail_url} form ignores them.
      fields: `creative.thumbnail_width(${THUMB_SIZE}).thumbnail_height(${THUMB_SIZE}){image_url,thumbnail_url}`,
      access_token: token,
    });
    const url = `${GRAPH}/${version}/?${params.toString()}`;

    let json;
    try {
      const resp = await fetch(url);
      json = await resp.json();
      if (json.error) throw new Error(`Meta API: ${json.error.message}`);
    } catch (err) {
      // On rate limit, return whatever we've gathered so far (partial is fine).
      if (isRateLimit(err.message)) break;
      throw err;
    }

    for (const id of chunk) {
      const c = json[id]?.creative;
      // Prefer the full-res image_url when it's Meta-hosted (sharper); else thumbnail.
      const metaHosted = (u) => u && /(\.fbcdn\.net|facebook\.com)/i.test(u);
      const best = (metaHosted(c?.image_url) ? c.image_url : c?.thumbnail_url) || '';
      setCache(ckey(id), best);
      if (best) result[id] = best;
    }
  }

  return result;
}

// Fetches an image from Meta's CDN server-side and returns a base64 data URL.
// (Avoids browser CORS taint and gives jsPDF something it can embed.)
export async function fetchImageDataUrl(imageUrl) {
  if (!imageUrl) throw new Error('url is required.');

  let host;
  try {
    const u = new URL(imageUrl);
    if (u.protocol !== 'https:') throw new Error('bad protocol');
    host = u.hostname;
  } catch {
    throw new Error('Invalid image URL.');
  }
  // SSRF guard: only Meta's CDN / facebook hosts.
  if (!/(\.fbcdn\.net|facebook\.com)$/i.test(host)) {
    throw new Error('Only Meta CDN image URLs are allowed.');
  }

  const cacheKey = `image:${imageUrl}`;
  const fresh = getFresh(cacheKey, PREVIEW_TTL);
  if (fresh !== undefined) return fresh;

  const resp = await fetch(imageUrl);
  if (!resp.ok) throw new Error(`Image fetch failed (${resp.status})`);
  const contentType = resp.headers.get('content-type') || 'image/jpeg';
  const buf = Buffer.from(await resp.arrayBuffer());
  const dataUrl = `data:${contentType};base64,${buf.toString('base64')}`;

  setCache(cacheKey, dataUrl);
  return dataUrl;
}
