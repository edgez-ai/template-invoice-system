import test from "node:test";
import assert from "node:assert/strict";
import { cleanText, parseActionBody, projectNumber, safeJson } from "./business.js";

test("parses an action payload", () => {
  assert.deepEqual(parseActionBody('{"action":"health"}'), { action: "health" });
});

test("formats deterministic project numbers", () => {
  assert.equal(projectNumber(2026, 7), "PRJ-2026-0007");
});

test("validates required and bounded text", () => {
  assert.equal(cleanText("  Acme  ", "Name", 10, true), "Acme");
  assert.throws(() => cleanText("", "Name", 10, true), /required/);
});

test("bounds audit JSON", () => {
  assert.ok(safeJson({ value: "x".repeat(20000) }).length <= 10000);
});
