import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { getBillingReport } from '../api/client.js';
import { downloadBlob } from './exportPdf.js';

// Same layout as Ads Manager's monthly "Billing report" PDF.
// Meta India's billing entity — the seller on every Indian ad account receipt.
const SELLER = [
  'Facebook India Online Services Pvt. Ltd.',
  'DLF Atria Block N, Jacaranda Marg',
  'DLF City Phase II, Gurugram - 122002 Haryana',
  'India',
  'GSTIN : 06AABCF5150G1ZZ',
  'PAN : AABCF5150G',
];
const GST_RATE = 0.18; // already included in the billed amount
const TDS_RATE = 0.02; // deducted on the billed amount

const nf2 = new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const pad = (n) => String(n).padStart(2, '0');

// Unix seconds -> dd/mm/yyyy in IST.
const istDate = (sec) =>
  new Date(sec * 1000).toLocaleDateString('en-GB', { timeZone: 'Asia/Kolkata' });

const STATUS_COLOR = { Funded: [22, 163, 74], Refunded: [22, 163, 74], Failed: [180, 35, 24] };

// Fetches the month's transactions and downloads the PDF.
export async function exportBillingReportPdf({ accountId, month, accountLabel }) {
  const r = await getBillingReport({ accountId, month });
  const cur = r.account.currency || 'INR';
  const amt = (v) => `${nf2.format(v)} ${cur}`;

  const billed = r.transactions.filter((t) => t.status !== 'Funded').reduce((a, t) => a + t.amount, 0);
  const funded = r.transactions.filter((t) => t.status === 'Funded').reduce((a, t) => a + t.amount, 0);
  // Meta truncates (not rounds) these to paise: 3,737.51 billed -> GST 570.12.
  const paise = (v) => Math.floor(v * 100 + 1e-6) / 100;
  const gst = paise((billed * GST_RATE) / (1 + GST_RATE));
  const tds = paise(billed * TDS_RATE);

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const W = doc.internal.pageSize.getWidth();
  const L = 14;
  const R = W - 14;

  // Header: seller on the left, ad account / business on the right.
  doc.setFontSize(8);
  doc.setTextColor(40);
  SELLER.forEach((line, i) => doc.text(line, L, 16 + i * 5));

  const b = r.account.business;
  const right = [
    `Account: ${r.account.id}`,
    b.name && `Business: ${b.name}`,
    ...b.lines,
    b.taxId && `GSTIN: ${b.taxId}`,
  ].filter(Boolean);
  right.forEach((line, i) => doc.text(line, R, 16 + i * 5, { align: 'right' }));

  const top = 16 + Math.max(SELLER.length, right.length) * 5 + 14;
  doc.setFontSize(15);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(20);
  doc.text(`Billing report: ${istDate(r.periodStart)} - ${istDate(r.periodEnd)}`, L, top);
  doc.setFont('helvetica', 'normal');

  let y = top + 6;
  if (r.estimated) {
    doc.setFontSize(8);
    doc.setTextColor(180, 35, 24);
    const lines = doc.splitTextToSize(r.note, R - L);
    doc.text(lines, L, y + 2);
    y += lines.length * 4 + 2;
  }

  autoTable(doc, {
    startY: y,
    margin: { left: L, right: 14 },
    theme: 'grid',
    head: [['Date', 'Transaction ID', 'Transaction Description', 'Payment method', 'Amount', 'Payment status']],
    body: r.transactions.map((t) => [
      istDate(t.time),
      t.id,
      t.description,
      t.paymentMethod === 'N/A' ? 'N/A' : t.paymentMethod,
      amt(t.amount),
      t.status,
    ]),
    foot: [
      [{ content: 'Total amount billed', colSpan: 4 }, { content: amt(billed), colSpan: 2 }],
      [{ content: 'Total funds added', colSpan: 4 }, { content: amt(funded), colSpan: 2 }],
    ],
    styles: {
      fontSize: 7.5,
      cellPadding: 3,
      textColor: 30,
      lineColor: [205, 208, 213],
      lineWidth: 0.2,
      valign: 'middle',
    },
    headStyles: { fillColor: 255, textColor: 20, fontStyle: 'bold' },
    footStyles: { fillColor: 255, textColor: 20, fontStyle: 'bold', halign: 'right' },
    columnStyles: {
      1: { cellWidth: 38 },
      4: { halign: 'right' },
      5: { halign: 'right' },
    },
    didParseCell: (c) => {
      if (c.section === 'head' && c.column.index >= 4) c.cell.styles.halign = 'right';
      if (c.section === 'foot' && c.column.index === 4) c.cell.styles.fontStyle = 'normal';
      if (c.section === 'body' && c.column.index === 5) {
        const color = STATUS_COLOR[c.cell.raw];
        if (color) c.cell.styles.textColor = color;
      }
    },
  });

  // Tax summary, same wording as Meta's report.
  let ty = doc.lastAutoTable.finalY + 12;
  if (ty > doc.internal.pageSize.getHeight() - 40) {
    doc.addPage();
    ty = 20;
  }
  doc.setFontSize(8);
  doc.setTextColor(40);
  [
    `VAT Rate: ${GST_RATE * 100}%`,
    `GST Amount in ${cur}: ${nf2.format(gst)}`,
    `TDS Rate: ${TDS_RATE * 100}%`,
    `TDS Amount in ${cur}: ${nf2.format(tds)}`,
  ].forEach((line, i) => doc.text(line, L, ty + i * 7));

  // Footer on every page: make clear this is our export, not Meta's own document.
  const pages = doc.getNumberOfPages();
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p);
    doc.setFontSize(7);
    doc.setTextColor(140);
    doc.text(
      `Generated by Meta Tracker from Meta Marketing API data - not an official Meta document.   Page ${p}/${pages}`,
      L,
      doc.internal.pageSize.getHeight() - 8
    );
  }

  const [yy, mm] = month.split('-');
  const monName = new Date(Number(yy), Number(mm) - 1, 1).toLocaleString('en-US', { month: 'short' });
  const label = (accountLabel || r.account.name).replace(/[\\/:*?"<>|]+/g, '-');
  const now = new Date();
  const filename = `${label} ${monName} ${yy}_Invoice_summary_${pad(now.getHours())}-${pad(now.getMinutes())}.pdf`;
  downloadBlob(doc.output('blob'), filename);
}
