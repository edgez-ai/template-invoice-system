export function parseActionBody(body) {
  if (!body) return {};
  if (typeof body === "object") return body;
  try {
    const parsed = JSON.parse(body);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    throw new Error("Request body must be valid JSON.");
  }
}

export function projectNumber(year, value, padding = 4) {
  if (!Number.isInteger(year) || year < 2000 || year > 2200) throw new Error("Invalid sequence year.");
  if (!Number.isInteger(value) || value < 1) throw new Error("Invalid sequence value.");
  return `PRJ-${year}-${String(value).padStart(padding, "0")}`;
}

export function invoiceDueDate(issueDate, paymentTermsDays) {
  const date = new Date(`${issueDate}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) throw new Error("Invalid invoice issue date.");
  const terms = Number(paymentTermsDays);
  if (!Number.isInteger(terms) || terms < 0 || terms > 3650) throw new Error("Invalid customer payment terms.");
  date.setUTCDate(date.getUTCDate() + terms);
  return date.toISOString().slice(0, 10);
}

export function assertInvoiceRegenerable(status) {
  if (status === "paid") throw new Error("A paid invoice cannot be regenerated.");
}

export function cleanText(value, name, maxLength, required = false) {
  const result = typeof value === "string" ? value.trim() : "";
  if (required && !result) throw new Error(`${name} is required.`);
  if (result.length > maxLength) throw new Error(`${name} is too long.`);
  return result;
}

export function safeJson(value) {
  const json = JSON.stringify(value ?? null);
  return json.length <= 10000 ? json : `${json.slice(0, 9997)}...`;
}
