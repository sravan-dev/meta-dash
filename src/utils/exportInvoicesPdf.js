import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { downloadBlob } from './exportPdf.js';

// No ₹ symbol — jsPDF's built-in font can't render it. Headers say "(INR)".
const nf2 = new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const nf0 = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 });
const money = (v) => (v == null ? '-' : nf2.format(v));
const int = (v) => (v == null ? '-' : nf0.format(v));

const BLUE = [37, 99, 235];

// Builds the Invoices PDF (summary, monthly billing, official invoices) and
// downloads it straight away.
export function exportInvoicesPdf({ data, rows, totals }) {
  const { account, year, invoices } = data;
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const now = new Date();

  doc.setFontSize(16);
  doc.text(`Meta Billing Report ${year}`, 14, 16);
  doc.setFontSize(10);
  doc.setTextColor(110);
  doc.text(`${account.name}  ·  Generated ${now.toLocaleString('en-IN')}`, 14, 22);
  doc.setTextColor(0);

  autoTable(doc, {
    startY: 28,
    theme: 'plain',
    styles: { fontSize: 10, cellPadding: 1.5 },
    columnStyles: { 0: { textColor: 110, cellWidth: 55 }, 1: { fontStyle: 'bold' } },
    body: [
      [`Spend in ${year} (INR)`, money(totals.spend)],
      ['Est. GST 18% (INR)', money(totals.gst)],
      ['Est. total paid (INR)', money(totals.total)],
      ['Lifetime spent (INR)', money(account.lifetimeSpent)],
      ['Balance due (INR)', money(account.balance)],
      ['Payment method', account.paymentMethod || '-'],
    ],
  });

  doc.setFontSize(12);
  doc.text('Monthly billing', 14, doc.lastAutoTable.finalY + 10);
  autoTable(doc, {
    startY: doc.lastAutoTable.finalY + 13,
    head: [['Month', 'Spend (INR)', 'Est. GST 18%', 'Est. total paid', 'Impressions', 'Clicks']],
    body: rows.map((r) => [r.label, money(r.spend), money(r.gst), money(r.total), int(r.impressions), int(r.clicks)]),
    foot: [['Total', money(totals.spend), money(totals.gst), money(totals.total), '', '']],
    styles: { fontSize: 9, halign: 'right' },
    columnStyles: { 0: { halign: 'left' } },
    headStyles: { fillColor: BLUE, halign: 'right' },
    footStyles: { fillColor: [240, 242, 245], textColor: 20, halign: 'right' },
    // columnStyles only reach the body; left-align the Month header/footer too.
    didParseCell: (c) => {
      if (c.column.index === 0) c.cell.styles.halign = 'left';
    },
  });

  if (invoices.length) {
    doc.setFontSize(12);
    doc.text('Official Meta invoices', 14, doc.lastAutoTable.finalY + 10);
    autoTable(doc, {
      startY: doc.lastAutoTable.finalY + 13,
      head: [['Invoice #', 'Date', 'Status', 'Net', 'Tax', 'Total', 'PDF']],
      body: invoices.map((i) => [
        i.id, i.date, i.status || '-', money(i.net), money(i.tax), money(i.total), i.downloadUrl ? 'Open' : '-',
      ]),
      styles: { fontSize: 9 },
      headStyles: { fillColor: BLUE },
      // Make the "Open" cell a clickable link to Meta's invoice PDF.
      didDrawCell: (c) => {
        const url = c.section === 'body' && c.column.index === 6 && invoices[c.row.index]?.downloadUrl;
        if (url) doc.link(c.cell.x, c.cell.y, c.cell.width, c.cell.height, { url });
      },
    });
  }

  doc.setFontSize(8);
  doc.setTextColor(120);
  doc.text(
    'Spend from Meta insights. GST is an 18% estimate — see Ads Manager > Billing for exact receipts.',
    14,
    doc.internal.pageSize.getHeight() - 10
  );

  const pad = (n) => String(n).padStart(2, '0');
  const safeName = account.name.replace(/[^\w-]+/g, '-');
  const filename = `Meta-Billing-${safeName}-${year}_${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}.pdf`;
  downloadBlob(doc.output('blob'), filename);
}
