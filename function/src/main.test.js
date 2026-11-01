import test from "node:test";
import assert from "node:assert/strict";
import { assertInvoiceRegenerable, cleanText, invoiceDueDate, parseActionBody, projectNumber, safeJson } from "./business.js";
import { renderInvoicePdf } from "./invoice-pdf.js";

test("parses an action payload", () => {
  assert.deepEqual(parseActionBody('{"action":"health"}'), { action: "health" });
});

test("formats deterministic project numbers", () => {
  assert.equal(projectNumber(2026, 7), "PRJ-2026-0007");
});

test("calculates invoice due date from customer payment terms", () => {
  assert.equal(invoiceDueDate("2026-11-01", 30), "2026-12-01");
  assert.equal(invoiceDueDate("2026-11-01", 0), "2026-11-01");
});

test("allows regeneration until an invoice is paid", () => {
  assert.doesNotThrow(() => assertInvoiceRegenerable("issued"));
  assert.doesNotThrow(() => assertInvoiceRegenerable("overdue"));
  assert.throws(() => assertInvoiceRegenerable("paid"), /cannot be regenerated/);
});

test("validates required and bounded text", () => {
  assert.equal(cleanText("  Acme  ", "Name", 10, true), "Acme");
  assert.throws(() => cleanText("", "Name", 10, true), /required/);
});

test("bounds audit JSON", () => {
  assert.ok(safeJson({ value: "x".repeat(20000) }).length <= 10000);
});

test("renders a branded invoice PDF", async () => {
  const pdf = await renderInvoicePdf({
    issuer: { name: "Example Trading", legalName: "Example Trading Limited", vatNumber: "EU123", invoiceFooter: "Pay by bank transfer." },
    customer: { name: "Customer Company" },
    project: { projectNumber: "PRJ-2026-0001", name: "Implementation", currency: "EUR" },
    stage: { name: "Deposit", description: "First stage" },
    invoice: { number: "INV-2026-0001", revision: 2, publicUrl: "https://invoice.example.test/invoice/project/invoice/2/token/", issueDate: "2026-11-01", dueDate: "2026-11-15", subtotalMinor: 100000, vatRateBasisPoints: 2000, reverseVat: false, vatMinor: 20000, totalMinor: 120000 },
  });
  assert.equal(pdf.subarray(0, 4).toString(), "%PDF");
  assert.ok(pdf.length > 1000);
});
