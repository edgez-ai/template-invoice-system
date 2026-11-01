import { Client, ID, TablesDB } from "node-appwrite";
import { cleanText, parseActionBody, projectNumber, safeJson } from "./business.js";

const DATABASE_ID = process.env.INVOICE_DATABASE_ID || "invoice-system";
const STAFF_TEAM_ID = process.env.INVOICE_STAFF_TEAM_ID || "invoice-staff";
const LEDGER_TABLE_ID = "number-sequences";

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

async function nextProjectNumber(tables) {
  const year = new Date().getUTCFullYear();
  const rowId = `project-${year}`;
  let sequence;
  try {
    sequence = await tables.getRow({ databaseId: DATABASE_ID, tableId: LEDGER_TABLE_ID, rowId });
  } catch (error) {
    if ((error?.code ?? error?.status) !== 404) throw error;
    sequence = await tables.createRow({
      databaseId: DATABASE_ID,
      tableId: LEDGER_TABLE_ID,
      rowId,
      data: {
        prefix: "PRJ", year, nextValue: 1, padding: 4,
        actorUserId: "system", action: "sequence.project", entityType: "system",
        entityId: rowId, beforeJson: "", afterJson: JSON.stringify({ nextValue: 1 }),
        requestId: rowId, createdAt: new Date().toISOString(),
      },
    });
  }
  const number = projectNumber(sequence.year, sequence.nextValue, sequence.padding);
  await tables.updateRow({
    databaseId: DATABASE_ID,
    tableId: LEDGER_TABLE_ID,
    rowId,
    data: { nextValue: sequence.nextValue + 1, afterJson: JSON.stringify({ nextValue: sequence.nextValue + 1 }) },
  });
  return number;
}

async function audit(tables, actorUserId, action, entityType, entityId, before, after, requestId) {
  await tables.createRow({
    databaseId: DATABASE_ID,
    tableId: LEDGER_TABLE_ID,
    rowId: ID.unique(),
    data: {
      prefix: "AUDIT", year: new Date().getUTCFullYear(), nextValue: 1, padding: 1,
      actorUserId, action, entityType, entityId,
      beforeJson: safeJson(before), afterJson: safeJson(after),
      requestId, createdAt: new Date().toISOString(),
    },
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
      projectNumber: await nextProjectNumber(tables),
      name: cleanText(body.name || interest.title, "Project name", 220, true),
      description: cleanText(body.description || interest.description, "Description", 5000),
      status: "draft",
      ownerUserId: interest.ownerUserId || actorUserId,
      currency: interest.currency,
      contractValueMinor: interest.estimatedValueMinor,
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

export default async ({ req, res, log, error }) => {
  const requestId = req.headers["x-appwrite-execution-id"] || crypto.randomUUID();
  try {
    const userId = req.headers["x-appwrite-user-id"];
    if (!userId) return res.json({ ok: false, error: "Authentication required." }, 401);
    const membership = await membershipFor(req, userId);
    if (!membership) return res.json({ ok: false, error: "Confirmed staff membership required." }, 403);
    const body = parseActionBody(req.bodyText || req.body);
    const action = cleanText(body.action, "Action", 80, true);
    const tables = new TablesDB(serverClient(req));

    if (action === "health") return res.json({ ok: true, userId, roles: membership.roles });
    if (action === "interest.convert") {
      requireRole(membership, ["admin", "sales"]);
      const project = await convertInterest(tables, userId, body, requestId);
      log(`Converted interest ${body.interestId} to project ${project.$id}`);
      return res.json({ ok: true, project });
    }
    return res.json({ ok: false, error: "Unknown action." }, 404);
  } catch (caught) {
    error(caught?.stack || String(caught));
    return res.json({ ok: false, error: caught?.message || "Unexpected workflow error." }, caught?.status || 500);
  }
};
