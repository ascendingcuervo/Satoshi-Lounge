// lib/invoice.js — erzeugt eine PDF-Rechnung im Satoshi-Lounge-Design (Bitcoin-Branding).
// Läuft rein serverseitig (Node.js, kein Browser nötig) via pdfkit.

const PDFDocument = require("pdfkit");
const fs = require("fs");
const path = require("path");

const LOGO_PATH = path.join(__dirname, "../assets/logo.png");

const ORANGE = "#F7931A";
const DARK = "#0a0a0d";
const GRAY = "#6b6b70";
const LINE = "#dddddd";

function generateInvoicePDF({ invoiceNumber, date, items, subtotal, shipping, total, customerName, addressLines, customerEmail }) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 50 });
    const chunks = [];
    doc.on("data", (c) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    // ---- Kopfbereich: echtes Satoshi-Lounge-Logo + Wortmarke ----
    const logoX = 50, logoY = 40, logoSize = 48;
    try {
      doc.image(LOGO_PATH, logoX, logoY, { width: logoSize, height: logoSize });
    } catch (e) {
      // Falls das Logo-Bild aus irgendeinem Grund nicht geladen werden kann: sauberer Fallback,
      // statt die ganze Rechnung fehlschlagen zu lassen.
      doc.circle(logoX + logoSize / 2, logoY + logoSize / 2, logoSize / 2).fill(ORANGE);
      doc.fillColor(DARK).fontSize(20).font("Helvetica-Bold")
         .text("B", logoX, logoY + logoSize / 2 - 10, { width: logoSize, align: "center" });
    }

    doc.fillColor(DARK).fontSize(16).font("Helvetica-Bold")
       .text("SATOSHI LOUNGE", logoX + logoSize + 14, logoY + 8);
    doc.fillColor(GRAY).fontSize(9).font("Helvetica")
       .text("Bitcoin-Only Merchandise · satoshi-lounge.com", logoX + logoSize + 14, logoY + 28);

    doc.fillColor(DARK).fontSize(20).font("Helvetica-Bold")
       .text("RECHNUNG", 350, 45, { width: 195, align: "right" });
    doc.fontSize(9.5).font("Helvetica").fillColor(GRAY)
       .text("Rechnungsnr.: " + invoiceNumber, 350, 74, { width: 195, align: "right" })
       .text("Datum: " + date, 350, 88, { width: 195, align: "right" });

    doc.moveTo(50, 130).lineTo(545, 130).strokeColor(LINE).lineWidth(1).stroke();

    // ---- Verkäufer / Rechnungsempfänger ----
    doc.fontSize(8.5).fillColor(GRAY).font("Helvetica-Bold").text("VERKÄUFER", 50, 150);
    doc.fontSize(10).fillColor(DARK).font("Helvetica-Bold").text("Max Stock (AscendingCuervo)", 50, 165);
    doc.font("Helvetica").fontSize(9).fillColor(GRAY)
       .text("Emsdettener Straße 10\n48268 Greven\nDeutschland\nascendingcuervo@t-online.de", 50, 180, { width: 240, lineGap: 2 });

    doc.fontSize(8.5).fillColor(GRAY).font("Helvetica-Bold").text("RECHNUNGSEMPFÄNGER", 320, 150);
    doc.fontSize(10).fillColor(DARK).font("Helvetica-Bold").text(customerName || "-", 320, 165);
    const addressText = (addressLines || []).join("\n") || "-";
    doc.font("Helvetica").fontSize(9).fillColor(GRAY);
    const addressHeight = doc.heightOfString(addressText, { width: 225, lineGap: 2 });
    doc.text(addressText, 320, 180, { width: 225, lineGap: 2 });
    if (customerEmail) {
      doc.fillColor(GRAY).text(customerEmail, 320, 180 + addressHeight + 4, { width: 225 });
    }

    // ---- Positionstabelle ----
    let y = 280;
    doc.moveTo(50, y).lineTo(545, y).strokeColor(LINE).stroke();
    y += 10;
    doc.fontSize(8.5).font("Helvetica-Bold").fillColor(GRAY);
    doc.text("ARTIKEL", 50, y);
    doc.text("MENGE", 330, y, { width: 60, align: "right" });
    doc.text("EINZELPREIS", 385, y, { width: 80, align: "right" });
    doc.text("GESAMT", 465, y, { width: 80, align: "right" });
    y += 16;
    doc.moveTo(50, y).lineTo(545, y).strokeColor(LINE).stroke();
    y += 12;

    doc.font("Helvetica").fillColor(DARK).fontSize(9.5);
    items.forEach((item) => {
      const nameHeight = doc.heightOfString(item.name, { width: 265 });
      doc.text(item.name, 50, y, { width: 265 });
      doc.text(String(item.qty), 330, y, { width: 60, align: "right" });
      doc.text(item.unitPrice, 385, y, { width: 80, align: "right" });
      doc.text(item.total, 465, y, { width: 80, align: "right" });
      y += Math.max(nameHeight, 14) + 8;
    });

    y += 6;
    doc.moveTo(330, y).lineTo(545, y).strokeColor(LINE).stroke();
    y += 10;

    doc.fontSize(9.5).fillColor(GRAY).font("Helvetica").text("Zwischensumme", 330, y, { width: 135, align: "right" });
    doc.fillColor(DARK).text(subtotal, 465, y, { width: 80, align: "right" });
    y += 16;
    doc.fillColor(GRAY).text("Versand", 330, y, { width: 135, align: "right" });
    doc.fillColor(DARK).text(shipping, 465, y, { width: 80, align: "right" });
    y += 22;

    doc.moveTo(330, y).lineTo(545, y).strokeColor(DARK).lineWidth(1.2).stroke();
    y += 10;
    doc.fontSize(12.5).font("Helvetica-Bold").fillColor(DARK).text("Gesamtbetrag", 330, y, { width: 135, align: "right" });
    doc.text(total, 465, y, { width: 80, align: "right" });

    // ---- Fußbereich ----
    y += 60;
    doc.fontSize(8.5).font("Helvetica").fillColor(GRAY)
       .text("Gemäß § 19 UStG wird keine Umsatzsteuer ausgewiesen.", 50, y, { width: 495 });

    y = 740;
    doc.moveTo(50, y).lineTo(545, y).strokeColor(LINE).stroke();
    y += 12;
    doc.fontSize(8).fillColor(GRAY)
       .text("Vielen Dank für deine Bestellung bei Satoshi Lounge — Bitcoin verstehen, vergleichen und tragen.", 50, y, { width: 495, align: "center" });

    doc.end();
  });
}

module.exports = { generateInvoicePDF };
