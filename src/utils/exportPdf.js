import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { getCreatives, getImageDataUrl } from '../api/client.js';

// PDF-only number formatting — NO ₹ symbol (jsPDF's built-in font can't render
// it; it shows as garbage). The "(INR)" header already conveys the currency.
const nf2 = new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const nf0 = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 });
const money = (v) => (v == null ? '' : nf2.format(v));
const int = (v) => (v == null ? '' : nf0.format(v));
const dec = (v) => (v == null ? '' : Number(v).toFixed(2));
const pct = (v) => (v == null ? '' : `${Number(v).toFixed(2)}%`);
const str = (v) => (v == null ? '' : String(v));

// Full report columns (matching New-Creative-Report) + the creative square.
const COLUMNS = [
  { header: 'Preview', preview: true },
  { header: 'Campaign name', get: (r) => str(r.campaignName) },
  { header: 'Ads', get: (r) => str(r.ads) },
  { header: 'Ad set name', get: (r) => str(r.adSetName) },
  { header: 'Result type', get: (r) => str(r.resultType) },
  { header: 'Results', get: (r) => int(r.results) },
  { header: 'Reach', get: (r) => int(r.reach) },
  { header: 'Frequency', get: (r) => dec(r.frequency) },
  { header: 'Cost per result', get: (r) => money(r.costPerResult) },
  { header: 'Amount spent (INR)', get: (r) => money(r.amountSpent) },
  { header: 'Impressions', get: (r) => int(r.impressions) },
  { header: 'CPM (cost per 1,000 impressions)', get: (r) => money(r.cpm) },
  { header: 'CPC (cost per link click)', get: (r) => money(r.cpcLink) },
  { header: 'CTR (link click-through rate)', get: (r) => pct(r.ctr) },
  { header: 'Clicks (all)', get: (r) => int(r.clicksAll) },
  { header: 'CPC (all)', get: (r) => money(r.cpcAll) },
  { header: 'Reporting starts', get: (r) => str(r.reportingStarts) },
  { header: 'Reporting ends', get: (r) => str(r.reportingEnds) },
];

const SQUARE = 32; // mm, the rendered creative square (≈ two thumbnails)
const CELL_PAD = 1;

// Run async tasks with a concurrency cap.
async function mapLimit(items, limit, fn) {
  const results = [];
  let i = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) {
      const idx = i++;
      results[idx] = await fn(items[idx], idx);
    }
  });
  await Promise.all(workers);
  return results;
}

const mime = (dataUrl) => (dataUrl.startsWith('data:image/png') ? 'PNG' : 'JPEG');

export async function exportToPdf(rows, { filename = 'Creative-Report.pdf', onProgress } = {}) {
  // 1. Look up the thumbnail URL for each ad in the export set.
  const creativeMap = await getCreatives(rows.map((r) => r.adId).filter(Boolean));

  // 2. Resolve unique thumbnails to base64 data URLs (concurrency-capped).
  const urlByAd = {};
  const uniqueUrls = new Set();
  for (const r of rows) {
    const u = r.adId && creativeMap[r.adId];
    if (u) {
      urlByAd[r.adId] = u;
      uniqueUrls.add(u);
    }
  }
  const urls = [...uniqueUrls];
  const dataByUrl = {};
  let done = 0;
  await mapLimit(urls, 6, async (u) => {
    try {
      dataByUrl[u] = await getImageDataUrl(u);
    } catch {
      /* skip images that fail to load */
    }
    done += 1;
    onProgress?.(done, urls.length);
  });

  // Per-row data URL for the Preview column.
  const imgForRow = rows.map((r) => {
    const u = urlByAd[r.adId];
    return u ? dataByUrl[u] : undefined;
  });

  // 3. Build the PDF.
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  doc.setFontSize(14);
  doc.text('Meta Creative Report', 14, 14);
  doc.setFontSize(9);
  doc.setTextColor(120);
  const span = rows[0] ? `${rows[0].reportingStarts} → ${rows[0].reportingEnds}` : '';
  doc.text(`${rows.length} ads  ·  ${span}`, 14, 19);
  doc.setTextColor(0);

  autoTable(doc, {
    startY: 23,
    margin: { left: 6, right: 6 },
    tableWidth: 'auto',
    head: [COLUMNS.map((c) => c.header)],
    body: rows.map((r) => COLUMNS.map((c) => (c.preview ? '' : c.get(r)))),
    styles: { fontSize: 5, cellPadding: CELL_PAD, valign: 'middle', overflow: 'linebreak' },
    headStyles: { fillColor: [37, 99, 235], textColor: 255, fontSize: 5, halign: 'center' },
    columnStyles: {
      0: { cellWidth: SQUARE + CELL_PAD * 2, halign: 'center' }, // Preview
      1: { cellWidth: 32 }, // Campaign name
      2: { cellWidth: 32 }, // Ads
      3: { cellWidth: 30 }, // Ad set name
    },
    bodyStyles: { minCellHeight: SQUARE + CELL_PAD * 2 },
    // Draw the creative square into the Preview column.
    didDrawCell: (data) => {
      if (data.section !== 'body' || data.column.index !== 0) return;
      const dataUrl = imgForRow[data.row.index];
      if (!dataUrl) return;
      const x = data.cell.x + (data.cell.width - SQUARE) / 2;
      const y = data.cell.y + (data.cell.height - SQUARE) / 2;
      try {
        doc.addImage(dataUrl, mime(dataUrl), x, y, SQUARE, SQUARE);
      } catch {
        /* ignore unrenderable image */
      }
    },
  });

  doc.save(filename);
}
