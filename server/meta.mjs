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
  'campaign_id',
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

// Ad account ids are numeric. Rejecting anything else stops a crafted
// accountId (e.g. "123/../<node>") from steering requests to other Graph paths.
function checkAccountId(id) {
  if (id && !/^\d+$/.test(String(id))) throw new Error('Invalid ad account id.');
  return id;
}

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
    campaignId: r.campaign_id ?? '',
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
  const acct = checkAccountId(accountId || process.env.META_AD_ACCOUNT_ID);
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

// --- Invoices / billing ---------------------------------------------------
// Monthly spend for one ad account (insights with time_increment=monthly),
// plus account-level billing info. If META_BUSINESS_ID is set, also pulls the
// official Meta invoices (only exists for businesses on monthly invoicing).
const INVOICES_TTL = 30 * 60 * 1000;

async function graphGet(path, params) {
  const token = process.env.META_ACCESS_TOKEN;
  const version = process.env.META_API_VERSION || 'v21.0';
  const qs = new URLSearchParams({ ...params, access_token: token });
  let url = `${GRAPH}/${version}/${path}?${qs.toString()}`;
  const out = [];
  let single;
  while (url) {
    const resp = await fetch(url);
    const json = await resp.json();
    if (json.error) throw new Error(`Meta API: ${json.error.message}`);
    if (!Array.isArray(json.data)) {
      single = json;
      break;
    }
    out.push(...json.data);
    url = json.paging?.next || null;
  }
  return single ?? out;
}

export async function fetchInvoices({ accountId, year }) {
  const acct = checkAccountId(accountId || process.env.META_AD_ACCOUNT_ID);
  if (!process.env.META_ACCESS_TOKEN || !acct) {
    throw new Error('Missing META_ACCESS_TOKEN or ad account id.');
  }
  const y = Number(year) || new Date().getFullYear();

  const cacheKey = `invoices:${acct}:${y}`;
  const fresh = getFresh(cacheKey, INVOICES_TTL);
  if (fresh) return fresh;

  // Clamp the range to today so the current year doesn't ask for future dates.
  const today = new Date().toISOString().slice(0, 10);
  const since = `${y}-01-01`;
  const until = `${y}-12-31` < today ? `${y}-12-31` : today;

  let result;
  try {
    const [monthlyRaw, account] = await Promise.all([
      since > today
        ? []
        : graphGet(`act_${acct}/insights`, {
            level: 'account',
            fields: 'spend,impressions,clicks,reach,account_currency',
            time_increment: 'monthly',
            time_range: JSON.stringify({ since, until }),
            limit: '50',
          }),
      graphGet(`act_${acct}`, {
        fields: 'name,currency,amount_spent,balance,spend_cap,funding_source_details,business{id,name}',
      }),
    ]);

    const months = monthlyRaw.map((r) => ({
      month: (r.date_start || '').slice(0, 7), // YYYY-MM
      since: r.date_start,
      until: r.date_stop,
      spend: num(r.spend) ?? 0,
      impressions: num(r.impressions),
      clicks: num(r.clicks),
      reach: num(r.reach),
    }));

    // amount_spent / balance / spend_cap come back in minor units (paise, cents).
    const minor = (v) => (num(v) != null ? num(v) / 100 : null);
    const accountInfo = {
      name: account.name || acct,
      currency: account.currency || '',
      lifetimeSpent: minor(account.amount_spent),
      balance: minor(account.balance),
      spendCap: num(account.spend_cap) ? minor(account.spend_cap) : null,
      paymentMethod: account.funding_source_details?.display_string || '',
    };

    let invoices = [];
    let invoicesNote = '';
    // The ad account's owning Business Manager; META_BUSINESS_ID overrides it.
    const businessId = process.env.META_BUSINESS_ID || account.business?.id;
    if (!businessId) {
      invoicesNote =
        'This ad account is not owned by a Business Manager, so Meta has no official invoices for it.';
    } else {
      try {
        const raw = await graphGet(`${businessId}/business_invoices`, {
          fields:
            'invoice_id,invoice_date,due_date,type,payment_status,billed_amount_details,download_uri,currency,ad_account_ids,billing_period',
          issue_start_date: since,
          issue_end_date: `${y}-12-31`,
          limit: '100',
        });
        invoices = raw
          .filter((i) => !i.ad_account_ids || i.ad_account_ids.map(String).includes(String(acct)))
          .map((i) => ({
            id: i.invoice_id || i.id,
            date: i.invoice_date || '',
            dueDate: i.due_date || '',
            type: i.type || '',
            status: i.payment_status || '',
            period: i.billing_period || '',
            currency: i.currency || i.billed_amount_details?.currency || '',
            net: num(i.billed_amount_details?.net_amount),
            tax: num(i.billed_amount_details?.tax_amount),
            total: num(i.billed_amount_details?.total_amount),
            downloadUrl: i.download_uri || '',
          }));
      } catch (err) {
        invoicesNote = `Official invoices unavailable for ${account.business?.name || businessId}: ${err.message} (Meta only issues these to monthly-invoiced businesses; the token also needs business_management.)`;
      }
    }

    result = { year: y, account: accountInfo, months, invoices, invoicesNote };
  } catch (err) {
    if (isRateLimit(err.message)) {
      const stale = getStale(cacheKey);
      if (stale) return stale;
    }
    throw err;
  }

  setCache(cacheKey, result);
  return result;
}

// --- Monthly billing report (transaction level) ---------------------------
// Mirrors Ads Manager's "Billing report" PDF: every payment / refund / fund
// top-up on the ad account for one calendar month (IST). Uses the ad account
// `transactions` edge; if Meta refuses it for this token, falls back to daily
// spend from insights (marked as estimated).
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
const istMonthStart = (y, m) => Math.floor((Date.UTC(y, m - 1, 1) - IST_OFFSET_MS) / 1000);

// Meta returns amounts either as plain numbers/strings or as a CurrencyAmount
// object ({ amount, amount_in_hundredths, currency }).
function txAmount(a) {
  if (a == null) return null;
  if (typeof a === 'object') {
    if (a.amount != null) return num(a.amount);
    if (a.amount_in_hundredths != null) return num(a.amount_in_hundredths) / 100;
    return null;
  }
  return num(a);
}

function txRow(t) {
  const amount = txAmount(t.amount) ?? 0;
  const kind = `${t.charge_type || ''} ${t.tx_type || ''} ${t.billing_reason || ''}`.toLowerCase();
  const isRefund = amount < 0 || /refund/.test(kind);
  const isFunding = /fund|prepay|add_funds|deposit/.test(kind);
  const status = String(t.status || '').toLowerCase();
  return {
    time: Number(t.time) || 0,
    id: String(t.id || ''),
    description: isRefund ? 'Meta ads refund' : 'Meta ads payment',
    paymentMethod: t.payment_option && t.payment_option !== 'unknown' ? String(t.payment_option) : 'N/A',
    amount: isRefund && amount > 0 ? -amount : amount,
    status: isRefund
      ? 'Refunded'
      : isFunding
        ? 'Funded'
        : /fail|declin/.test(status)
          ? 'Failed'
          : 'Paid',
  };
}

export async function fetchBillingReport({ accountId, month }) {
  const acct = checkAccountId(accountId || process.env.META_AD_ACCOUNT_ID);
  if (!process.env.META_ACCESS_TOKEN || !acct) {
    throw new Error('Missing META_ACCESS_TOKEN or ad account id.');
  }
  const m = /^(\d{4})-(\d{2})$/.exec(month || '');
  if (!m) throw new Error('month must be YYYY-MM.');
  const y = Number(m[1]);
  const mo = Number(m[2]);

  const cacheKey = `billing:${acct}:${month}`;
  const fresh = getFresh(cacheKey, INVOICES_TTL);
  if (fresh) return fresh;

  const start = istMonthStart(y, mo);
  const end = mo === 12 ? istMonthStart(y + 1, 1) : istMonthStart(y, mo + 1);

  let result;
  try {
    const account = await graphGet(`act_${acct}`, {
      fields:
        'account_id,name,currency,business_name,business_street,business_street2,business_city,business_state,business_zip,business_country_code,tax_id,funding_source_details',
    });

    let transactions = [];
    let estimated = false;
    let note = '';
    try {
      const raw = await graphGet(`act_${acct}/transactions`, {
        fields: 'id,time,amount,status,charge_type,tx_type,payment_option,billing_reason',
        time_start: String(start),
        time_stop: String(end),
        limit: '200',
      });
      transactions = raw.map(txRow).filter((t) => t.time >= start && t.time < end);
    } catch (err) {
      // Fallback: one row per day of ad spend, grossed up by 18% GST.
      estimated = true;
      note = `Meta did not return transactions (${err.message}). Rows below are daily ad spend + 18% GST, not actual charges.`;
      const pad = (n) => String(n).padStart(2, '0');
      const last = new Date(Date.UTC(y, mo, 0)).getUTCDate();
      const days = await graphGet(`act_${acct}/insights`, {
        level: 'account',
        fields: 'spend',
        time_increment: '1',
        time_range: JSON.stringify({ since: `${y}-${pad(mo)}-01`, until: `${y}-${pad(mo)}-${pad(last)}` }),
        limit: '50',
      });
      transactions = days
        .filter((d) => num(d.spend))
        .map((d) => ({
          time: Math.floor((Date.parse(`${d.date_start}T12:00:00Z`) - IST_OFFSET_MS) / 1000),
          id: '-',
          description: 'Ad spend incl. GST (estimated)',
          paymentMethod: 'N/A',
          amount: Math.round(num(d.spend) * 118) / 100,
          status: 'Estimated',
        }));
    }
    transactions.sort((a, b) => b.time - a.time); // newest first, like Meta's report

    const card = account.funding_source_details?.display_string || '';
    result = {
      month,
      periodStart: start,
      periodEnd: end,
      estimated,
      note,
      account: {
        id: account.account_id || acct,
        name: account.name || acct,
        currency: account.currency || 'INR',
        card,
        business: {
          name: account.business_name || '',
          lines: [
            account.business_street,
            account.business_street2,
            [account.business_city, account.business_state, account.business_zip].filter(Boolean).join(', '),
            account.business_country_code === 'IN' ? 'India' : account.business_country_code,
          ].filter(Boolean),
          taxId: account.tax_id || '',
        },
      },
      transactions,
    };
  } catch (err) {
    if (isRateLimit(err.message)) {
      const stale = getStale(cacheKey);
      if (stale) return stale;
    }
    throw err;
  }

  setCache(cacheKey, result);
  return result;
}
