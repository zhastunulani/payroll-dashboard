import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const database = readFileSync(
  new URL("../lib/database.ts", import.meta.url),
  "utf8",
);
const route = readFileSync(
  new URL("../app/api/payroll/route.ts", import.meta.url),
  "utf8",
);
const app = readFileSync(
  new URL("../app/pages/departments.vue", import.meta.url),
  "utf8",
);

test("employee notes are stored in the selected month's salary snapshot", () => {
  assert.match(database, /note TEXT NOT NULL DEFAULT ''/);
  assert.match(
    database,
    /ALTER TABLE salary_snapshots ADD COLUMN IF NOT EXISTS note TEXT NOT NULL DEFAULT ''/,
  );
  assert.match(database, /s\.base_salary, s\.note, s\.is_paid/);
  assert.match(database, /note: row\.note/);
  assert.match(route, /action === "saveEmployeeNote"/);
  assert.match(
    route,
    /SET note = \?, updated_at = CURRENT_TIMESTAMP\s+WHERE id = \? AND month_id = \?/,
  );
});

test("editing a note does not reset salary payment status", () => {
  const salaryChangedStart = route.indexOf("const salaryChanged =");
  const statementsStart = route.indexOf("const statements = []", salaryChangedStart);
  assert.ok(salaryChangedStart > 0);
  assert.ok(statementsStart > salaryChangedStart);
  assert.doesNotMatch(
    route.slice(salaryChangedStart, statementsStart),
    /note/,
  );
});

test("a new month starts with blank employee notes", () => {
  const createMonthStart = route.indexOf('action === "createMonth"');
  const resetMonthStart = route.indexOf(
    'action === "resetMonthPayments"',
    createMonthStart,
  );
  assert.ok(createMonthStart > 0);
  assert.ok(resetMonthStart > createMonthStart);
  assert.doesNotMatch(
    route.slice(createMonthStart, resetMonthStart),
    /payment_method_name,\s*base_salary,\s*note/,
  );
});

test("employee notes have a visible quick editor in the Nuxt department table", () => {
  assert.match(app, /class="note-button"/);
  assert.match(app, /Пікір қосу/);
  assert.match(app, /payroll\.mutate\("saveEmployeeNote"/);
  assert.match(app, /placeholder="Мысалы: 50% берілді"/);
});
