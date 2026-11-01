import { Client, ID, Permission, Query, Role, Storage, TablesDB } from "node-appwrite";
import { InputFile } from "node-appwrite/file";
import { cleanText, invoiceDueDate, parseActionBody, projectNumber, safeJson } from "./business.js";
import { renderInvoicePdf } from "./invoice-pdf.js";

const DATABASE_ID = process.env.INVOICE_DATABASE_ID || "invoice-system";
const STAFF_TEAM_ID = process.env.INVOICE_STAFF_TEAM_ID || "invoice-staff";
const FILES_BUCKET_ID = process.env.INVOICE_FILES_BUCKET_ID || "invoice-files";
const LEDGER_TABLE_ID = "number-sequences";
let ledgerColumnCache;

function serverClient(req) {
  return new Client()
    .setEndpoint(process.env.APPWRITE_FUNCTION_API_ENDPOINT)
    .setProject(process.env.APPWRITE_FUNCTION_PROJECT_ID)
    .setKey(req.headers["x-appwrite-key"]);
}

async function membershipFor(req, userId) {
  const endpoint = process.env.APPWRITE_FUNCTION_API_ENDPOINT.replace(/\/$/, "");
  const response = await fetch(`${endpoint}/users/${encodeURIComponent(userId)}/memberships`, {
    headers: {
      "x-appwrite-project": process.env.APPWRITE_FUNCTION_PROJECT_ID,
      "x-appwrite-key": req.headers["x-appwrite-key"],
    },
  });
  if (!response.ok) throw Object.assign(new Error("Could not verify staff membership."), { status: 403 });
  const payload = await response.json();
  return payload.memberships?.find((item) => item.teamId === STAFF_TEAM_ID && item.confirm);
}

function requireRole(membership, allowed) {
  if (!membership || !membership.roles?.some((role) => allowed.includes(role))) {
    throw Object.assign(new Error("Your staff role cannot perform this action."), { status: 403 });
  }
}

async function ledgerColumns(tables) {
  if (ledgerColumnCache) return ledgerColumnCache;
  const table = await tables.getTable({ databaseId: DATABASE_ID, tableId: LEDGER_TABLE_ID });
  ledgerColumnCache = new Set((table.columns || []).map((column) => column.key));
  return ledgerColumnCache;
}

function compatibleLedgerData(columns, core, payload, legacy) {
  const data = { ...core };
  if (columns.has("payload")) data.payload = payload;
  for (const [key, value] of Object.entries(legacy)) {
    if (columns.has(key)) data[key] = value;
  }
  return data;
}

async function nextDocumentNumber(tables, kind, prefix) {
  const year = new Date().getUTCFullYear();
  const rowId = `${kind}-${year}`;
  const columns = await ledgerColumns(tables);
  let sequence;
  try {
    sequence = await tables.getRow({ databaseId: DATABASE_ID, tableId: LEDGER_TABLE_ID, rowId });
  } catch (error) {
    if ((error?.code ?? error?.status) !== 404) throw error;
    sequence = await tables.createRow({
      databaseId: DATABASE_ID,
      tableId: LEDGER_TABLE_ID,
      rowId,
      data: compatibleLedgerData(
        columns,
        { prefix, year, nextValue: 1, padding: 4 },
        JSON.stringify({ kind: "sequence", key: rowId, nextValue: 1 }),
        {
          actorUserId: "system", action: `sequence.${kind}`, entityType: "system", entityId: rowId,
          beforeJson: "", afterJson: JSON.stringify({ nextValue: 1 }), requestId: rowId,
          createdAt: new Date().toISOString(),
        },
      ),
    });
  }
  const number = `${prefix}-${sequence.year}-${String(sequence.nextValue).padStart(sequence.padding, "0")}`;
  await tables.updateRow({
    databaseId: DATABASE_ID,
    tableId: LEDGER_TABLE_ID,
    rowId,
    data: compatibleLedgerData(
      columns,
      { nextValue: sequence.nextValue + 1 },
      JSON.stringify({ kind: "sequence", key: rowId, nextValue: sequence.nextValue + 1 }),
      { afterJson: JSON.stringify({ nextValue: sequence.nextValue + 1 }) },
    ),
  });
  return number;
}

function parseJson(value, fallback) {
  try { return typeof value === "string" && value ? JSON.parse(value) : fallback; }
  catch { return fallback; }
}

function commercialOf(project) {
  const value = parseJson(project.commercialJson, {});
  return {
    stages: Array.isArray(value.stages) ? value.stages : [],
    invoices: Array.isArray(value.invoices) ? value.invoices : [],
  };
}

function vatRateOf(company) {
  const tag = Array.isArray(company.tags) ? company.tags.find((value) => value.startsWith("vat-rate-bps:")) : "";
  const rate = Number(tag?.slice("vat-rate-bps:".length) || 0);
  return Number.isInteger(rate) && rate >= 0 && rate <= 10000 ? rate : 0;
}

async function audit(tables, actorUserId, action, entityType, entityId, before, after, requestId) {
  const columns = await ledgerColumns(tables);
  const payload = safeJson({ kind: "audit", actorUserId, action, entityType, entityId, before, after, requestId });
  await tables.createRow({
    databaseId: DATABASE_ID,
    tableId: LEDGER_TABLE_ID,
    rowId: requestId,
    data: compatibleLedgerData(
      columns,
      { prefix: "AUDIT", year: new Date().getUTCFullYear(), nextValue: 1, padding: 1 },
      payload,
      {
        actorUserId, action, entityType, entityId,
        beforeJson: safeJson(before), afterJson: safeJson(after), requestId,
        createdAt: new Date().toISOString(),
      },
    ),
  });
}

async function convertInterest(tables, actorUserId, body, requestId) {
  const interestId = cleanText(body.interestId, "Interest ID", 36, true);
  const interest = await tables.getRow({ databaseId: DATABASE_ID, tableId: "interests", rowId: interestId });
  if (interest.convertedProjectId) {
    return tables.getRow({ databaseId: DATABASE_ID, tableId: "projects", rowId: interest.convertedProjectId });
  }
  if (["lost", "on_hold"].includes(interest.status)) {
    throw Object.assign(new Error("This interest cannot be converted in its current state."), { status: 409 });
  }
  const projectId = ID.unique();
  const project = await tables.createRow({
    databaseId: DATABASE_ID,
    tableId: "projects",
    rowId: projectId,
    data: {
      companyId: interest.companyId,
      interestId,
      projectNumber: await nextDocumentNumber(tables, "project", "PRJ"),
      name: cleanText(body.name || interest.title, "Project name", 220, true),
      description: cleanText(body.description || interest.description, "Description", 5000),
      detailsJson: JSON.stringify({ scope: "", startDate: "", targetDate: "", notes: "", reverseVat: false }),
      commercialJson: JSON.stringify({ stages: [], invoices: [] }),
      status: "draft",
      ownerUserId: interest.ownerUserId || actorUserId,
      currency: interest.currency,
      contractValueMinor: 0,
      createdBy: actorUserId,
      updatedBy: actorUserId,
    },
  });
  await tables.updateRow({
    databaseId: DATABASE_ID,
    tableId: "interests",
    rowId: interestId,
    data: { status: "won", convertedProjectId: projectId, updatedBy: actorUserId },
  });
  await audit(tables, actorUserId, "interest.convert", "project", projectId, null, project, requestId);
  return project;
}

async function updateProject(tables, actorUserId, body) {
  const projectId = cleanText(body.projectId, "Project ID", 36, true);
  const project = await tables.getRow({ databaseId: DATABASE_ID, tableId: "projects", rowId: projectId });
  const commercial = commercialOf(project);
  const contractValueMinor = commercial.stages.reduce((sum, item) => sum + Number(item.amountMinor || 0), 0);
  const details = {
    scope: cleanText(body.scope, "Scope", 10000),
    startDate: cleanText(body.startDate, "Start date", 40),
    targetDate: cleanText(body.targetDate, "Target date", 40),
    notes: cleanText(body.notes, "Notes", 10000),
    reverseVat: body.reverseVat === true,
  };
  return tables.updateRow({
    databaseId: DATABASE_ID, tableId: "projects", rowId: projectId,
    data: {
      name: cleanText(body.name || project.name, "Project name", 220, true),
      description: cleanText(body.description, "Description", 5000),
      detailsJson: JSON.stringify(details), contractValueMinor, updatedBy: actorUserId,
    },
  });
}

async function addStage(tables, actorUserId, body) {
  const projectId = cleanText(body.projectId, "Project ID", 36, true);
  const project = await tables.getRow({ databaseId: DATABASE_ID, tableId: "projects", rowId: projectId });
  const commercial = commercialOf(project);
  const amountMinor = Math.round(Number(body.amountMinor));
  if (!Number.isSafeInteger(amountMinor) || amountMinor <= 0) throw new Error("Stage amount must be greater than zero.");
  const stage = {
    id: crypto.randomUUID(), name: cleanText(body.name, "Stage name", 160, true),
    description: cleanText(body.description, "Stage description", 1000), amountMinor,
    status: "planned",
    createdAt: new Date().toISOString(), createdBy: actorUserId,
  };
  commercial.stages.push(stage);
  const contractValueMinor = commercial.stages.reduce((sum, item) => sum + Number(item.amountMinor || 0), 0);
  await tables.updateRow({ databaseId: DATABASE_ID, tableId: "projects", rowId: projectId,
    data: { commercialJson: JSON.stringify(commercial), contractValueMinor, updatedBy: actorUserId } });
  return stage;
}

async function generateInvoice(tables, storage, actorUserId, body) {
  const projectId = cleanText(body.projectId, "Project ID", 36, true);
  const stageId = cleanText(body.stageId, "Stage ID", 36, true);
  const project = await tables.getRow({ databaseId: DATABASE_ID, tableId: "projects", rowId: projectId });
  const customer = await tables.getRow({ databaseId: DATABASE_ID, tableId: "companies", rowId: project.companyId });
  const issuerList = await tables.listRows({ databaseId: DATABASE_ID, tableId: "companies",
    queries: [Query.equal("isOwnCompany", true), Query.limit(1)] });
  const issuer = issuerList.rows?.[0];
  if (!issuer) throw new Error("Complete Our company before generating an invoice.");
  const commercial = commercialOf(project);
  const stage = commercial.stages.find((candidate) => candidate.id === stageId);
  if (!stage) throw new Error("Payment stage was not found.");
  if (stage.invoiceId) throw new Error("This stage already has an invoice.");
  const details = parseJson(project.detailsJson, {});
  const reverseVat = details.reverseVat === true;
  const vatRateBasisPoints = vatRateOf(issuer);
  const issueDate = new Date().toISOString().slice(0, 10);
  const dueDate = invoiceDueDate(issueDate, customer.paymentTermsDays);
  const vatMinor = reverseVat ? 0 : Math.round(stage.amountMinor * vatRateBasisPoints / 10000);
  const invoice = {
    id: crypto.randomUUID(), number: await nextDocumentNumber(tables, "invoice", "INV"), stageId,
    fileId: "", issueDate, dueDate, subtotalMinor: stage.amountMinor, vatRateBasisPoints, reverseVat,
    vatMinor, totalMinor: stage.amountMinor + vatMinor, status: "issued", createdBy: actorUserId,
  };
  const pdf = await renderInvoicePdf({ issuer, customer, project, stage, invoice });
  const fileId = ID.unique();
  const fileName = `${invoice.number}.pdf`;
  const permissions = [
    Permission.read(Role.team(STAFF_TEAM_ID)),
    Permission.update(Role.team(STAFF_TEAM_ID, "admin")),
    Permission.update(Role.team(STAFF_TEAM_ID, "finance")),
    Permission.delete(Role.team(STAFF_TEAM_ID, "admin")),
  ];
  const file = await storage.createFile({ bucketId: FILES_BUCKET_ID, fileId,
    file: InputFile.fromBuffer(pdf, fileName), permissions });
  invoice.fileId = file.$id;
  commercial.invoices.push(invoice);
  stage.status = "invoiced"; stage.invoiceId = invoice.id;
  await tables.createRow({ databaseId: DATABASE_ID, tableId: "files", rowId: ID.unique(), data: {
    fileId: file.$id, folder: `projects/${projectId}/invoices/`, entityType: "project", entityId: projectId,
    category: "invoice", originalName: fileName, mimeType: file.mimeType || "application/pdf",
    sizeBytes: file.sizeOriginal || pdf.length, uploadedBy: actorUserId, uploadedAt: new Date().toISOString(),
  }});
  await tables.updateRow({ databaseId: DATABASE_ID, tableId: "projects", rowId: projectId,
    data: { commercialJson: JSON.stringify(commercial), updatedBy: actorUserId } });
  return invoice;
}

export default async ({ req, res, log, error }) => {
  const requestId = req.headers["x-appwrite-execution-id"] || crypto.randomUUID();
  try {
    const userId = req.headers["x-appwrite-user-id"];
    if (!userId) return res.json({ ok: false, error: "Authentication required." }, 401);
    const membership = await membershipFor(req, userId);
    if (!membership) return res.json({ ok: false, error: "Confirmed staff membership required." }, 403);
    const body = parseActionBody(req.bodyText || req.body);
    const action = cleanText(body.action, "Action", 80, true);
    const client = serverClient(req);
    const tables = new TablesDB(client);
    const storage = new Storage(client);

    if (action === "health") return res.json({ ok: true, userId, roles: membership.roles });
    if (action === "interest.convert") {
      requireRole(membership, ["admin", "sales"]);
      const project = await convertInterest(tables, userId, body, requestId);
      log(`Converted interest ${body.interestId} to project ${project.$id}`);
      return res.json({ ok: true, project });
    }
    if (action === "project.update") {
      requireRole(membership, ["admin", "sales"]);
      return res.json({ ok: true, project: await updateProject(tables, userId, body) });
    }
    if (action === "project.stage.add") {
      requireRole(membership, ["admin", "sales", "finance"]);
      return res.json({ ok: true, stage: await addStage(tables, userId, body) });
    }
    if (action === "project.invoice.generate") {
      requireRole(membership, ["admin", "sales", "finance"]);
      return res.json({ ok: true, invoice: await generateInvoice(tables, storage, userId, body) });
    }
    return res.json({ ok: false, error: "Unknown action." }, 404);
  } catch (caught) {
    error(caught?.stack || String(caught));
    return res.json({ ok: false, error: caught?.message || "Unexpected workflow error." }, caught?.status || 500);
  }
};
