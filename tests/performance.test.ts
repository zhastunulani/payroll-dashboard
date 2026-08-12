import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const database = readFileSync(new URL("../lib/database.ts", import.meta.url), "utf8");
const route = readFileSync(new URL("../app/api/payroll/route.ts", import.meta.url), "utf8");
const composable = readFileSync(
  new URL("../app/composables/usePayroll.ts", import.meta.url),
  "utf8",
);

test("ready databases skip request-time schema and seed batches", () => {
  assert.match(
    database,
    /existingSchema\?\.table_name[\s\S]*existingSchema\.workspaces_table[\s\S]*existingSchema\.has_salary_note[\s\S]*existingSchema\.has_workspace_scope/,
  );
});

test("salary snapshots and components are loaded in one query", () => {
  assert.match(database, /LEFT JOIN salary_components c ON c\.salary_snapshot_id = s\.id/);
  assert.doesNotMatch(database, /const components = await queryAll<ComponentRow>/);
});

test("frequent row actions use compact responses and optimistic updates", () => {
  assert.match(route, /compact: true[\s\S]*action,[\s\S]*id,[\s\S]*isPaid: paid/);
  assert.match(composable, /const optimisticActions = new Set/);
  assert.match(composable, /applyOptimisticMutation\(data\.value, action, payload\)/);
  assert.match(composable, /if \(!\("compact" in result\)\)/);
});
