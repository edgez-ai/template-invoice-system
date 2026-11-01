import PDFDocument from "pdfkit";
import QRCode from "qrcode";

function money(amountMinor, currency) {
  return new Intl.NumberFormat("en", { style: "currency", currency }).format(amountMinor / 100);
}

function value(value, fallback = "—") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function trademarkWordmark(name) {
  const wordmark = value(name, "Invoice issuer");
  return /[®℠™]$/.test(wordmark) ? wordmark : `${wordmark}™`;
}

export async function renderInvoicePdf({ issuer, customer, project, stage, invoice }) {
  const qrCode = invoice.publicUrl
    ? await QRCode.toBuffer(invoice.publicUrl, { type: "png", errorCorrectionLevel: "M", margin: 1, width: 280 })
    : null;
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 50, info: { Title: `Invoice ${invoice.number}` } });
    const chunks = [];
    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    // The configured trading name is the document wordmark. This keeps the
    // invoice branded without requiring a separate image asset or logo upload.
    doc.fillColor("#17243e").font("Helvetica-Bold").fontSize(25)
      .text(trademarkWordmark(issuer.name), 50, 44, { width: 300, lineBreak: false });
    if (issuer.legalName && issuer.legalName !== issuer.name) {
      doc.fillColor("#737b8c").font("Helvetica").fontSize(7)
        .text(issuer.legalName, 51, 76, { width: 299, lineBreak: false });
    }
    doc.fillColor("#6657d9").fontSize(11).text("INVOICE", 410, 52, { width: 135, align: "right" });
    doc.fillColor("#17243e").fontSize(16).text(invoice.number, 360, 70, { width: 185, align: "right" });
    doc.fillColor("#737b8c").font("Helvetica").fontSize(8)
      .text(`Revision ${invoice.revision || 1}`, 410, 91, { width: 135, align: "right" });
    doc.moveTo(50, 105).lineTo(545, 105).strokeColor("#dfe1e7").stroke();

    doc.fillColor("#737b8c").font("Helvetica-Bold").fontSize(8).text("FROM", 50, 128);
    doc.fillColor("#1c2230").font("Helvetica-Bold").fontSize(11).text(value(issuer.legalName, issuer.name), 50, 145);
    doc.font("Helvetica").fontSize(9).fillColor("#4f5868").text(value(issuer.billingAddress, ""), 50, 161, { width: 210 });
    doc.text([issuer.billingEmail, issuer.phone].filter(Boolean).join(" · "), 50, doc.y + 4, { width: 210 });
    if (issuer.vatNumber) doc.text(`VAT: ${issuer.vatNumber}`, 50, doc.y + 3);

    doc.fillColor("#737b8c").font("Helvetica-Bold").fontSize(8).text("BILL TO", 310, 128);
    doc.fillColor("#1c2230").font("Helvetica-Bold").fontSize(11).text(value(customer.legalName, customer.name), 310, 145);
    doc.font("Helvetica").fontSize(9).fillColor("#4f5868").text(value(customer.billingAddress, ""), 310, 161, { width: 235 });
    if (customer.billingEmail) doc.text(customer.billingEmail, 310, doc.y + 4, { width: 235 });
    if (customer.vatNumber || customer.taxNumber) doc.text(`VAT: ${customer.vatNumber || customer.taxNumber}`, 310, doc.y + 3, { width: 235 });

    const metaY = 240;
    doc.fillColor("#737b8c").font("Helvetica-Bold").fontSize(8)
      .text("ISSUE DATE", 50, metaY).text("DUE DATE", 180, metaY).text("PROJECT", 310, metaY);
    doc.fillColor("#1c2230").font("Helvetica").fontSize(10)
      .text(invoice.issueDate, 50, metaY + 16).text(invoice.dueDate || "On receipt", 180, metaY + 16)
      .text(`${project.projectNumber} · ${project.name}`, 310, metaY + 16, { width: 235 });

    const tableY = 305;
    doc.rect(50, tableY, 495, 28).fill("#17243e");
    doc.fillColor("#ffffff").font("Helvetica-Bold").fontSize(8)
      .text("DESCRIPTION", 62, tableY + 10).text("AMOUNT", 430, tableY + 10, { width: 100, align: "right" });
    doc.fillColor("#1c2230").font("Helvetica-Bold").fontSize(10).text(stage.name, 62, tableY + 48, { width: 330 });
    doc.font("Helvetica").fontSize(8).fillColor("#737b8c").text(value(stage.description, "Project payment stage"), 62, tableY + 65, { width: 330 });
    doc.fillColor("#1c2230").font("Helvetica").fontSize(10).text(money(invoice.subtotalMinor, project.currency), 430, tableY + 49, { width: 100, align: "right" });
    doc.moveTo(50, tableY + 95).lineTo(545, tableY + 95).strokeColor("#e7e8ed").stroke();

    const totalsY = tableY + 120;
    doc.font("Helvetica").fontSize(9).fillColor("#737b8c").text("Subtotal", 360, totalsY, { width: 90, align: "right" });
    doc.fillColor("#1c2230").text(money(invoice.subtotalMinor, project.currency), 455, totalsY, { width: 75, align: "right" });
    const vatLabel = invoice.reverseVat ? "VAT" : `VAT ${(invoice.vatRateBasisPoints / 100).toFixed(2)}%`;
    const vatAmount = invoice.reverseVat ? "Not charged" : money(invoice.vatMinor, project.currency);
    doc.fillColor("#737b8c").text(vatLabel, 340, totalsY + 22, { width: 110, align: "right" });
    doc.fillColor("#1c2230").text(vatAmount, 455, totalsY + 22, { width: 75, align: "right", lineBreak: false });
    doc.rect(330, totalsY + 48, 215, 38).fill("#efedff");
    doc.fillColor("#5145b3").font("Helvetica-Bold").fontSize(10).text("TOTAL DUE", 345, totalsY + 63, { lineBreak: false });
    doc.fontSize(12.5).text(money(invoice.totalMinor, project.currency), 400, totalsY + 60, { width: 130, align: "right", lineBreak: false });
    if (invoice.reverseVat) {
      doc.fillColor("#737b8c").font("Helvetica").fontSize(8)
        .text("Reverse charge - customer to account for VAT.", 300, totalsY + 96, { width: 245, align: "right" });
    }

    if (qrCode) {
      doc.image(qrCode, 50, 610, { fit: [68, 68] });
      doc.fillColor("#1c2230").font("Helvetica-Bold").fontSize(8).text("VERIFY THIS INVOICE", 130, 620);
      doc.fillColor("#737b8c").font("Helvetica").fontSize(7)
        .text("Scan to verify this invoice and view its current revision.", 130, 636, { width: 210, lineGap: 2 });
    }
    doc.fillColor("#737b8c").font("Helvetica").fontSize(8).text(value(issuer.invoiceFooter, "Thank you for your business."), 50, 710, { width: 495, align: "center" });
    doc.end();
  });
}
