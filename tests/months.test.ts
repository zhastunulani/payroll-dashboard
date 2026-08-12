import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  addMonths,
  nextAvailableMonthId,
  shouldCopyDepartmentToNewMonth,
} from "../lib/months.ts";

const root = new URL("../", import.meta.url);

test("month helper crosses the year boundary", () => {
  assert.equal(addMonths("2026-12", 1), "2027-01");
  assert.equal(addMonths("2026-01", -1), "2025-12");
});

test("new month suggestion skips months that already exist", () => {
  assert.equal(
    nextAvailableMonthId("2026-07", ["2026-07", "2026-08", "2026-09"]),
    "2026-10",
  );
});

test("curators and sales start empty in a new month", () => {
  assert.equal(shouldCopyDepartmentToNewMonth("dept-curators"), false);
  assert.equal(shouldCopyDepartmentToNewMonth("dept-sales"), false);
  assert.equal(shouldCopyDepartmentToNewMonth("dept-academ"), true);
  assert.equal(shouldCopyDepartmentToNewMonth("dept-teachers"), true);
  assert.equal(shouldCopyDepartmentToNewMonth("custom-curators", "Кураторлар"), false);
  assert.equal(shouldCopyDepartmentToNewMonth("custom-sales", "Сату бөлімі"), false);
});

test("new month API excludes the two empty-start departments", async () => {
  const route = await readFile(
    new URL("app/api/payroll/route.ts", root),
    "utf8",
  );
  assert.match(route, /e\.department_id NOT IN \(\?, \?\)/);
  assert.match(route, /EMPTY_DEPARTMENT_IDS_ON_NEW_MONTH/);
});

test("new month API accepts any existing month as the copy source", async () => {
  const route = await readFile(
    new URL("app/api/payroll/route.ts", root),
    "utf8",
  );
  assert.match(route, /body\.sourceMonthId \?\? body\.monthId/);
  assert.match(
    route,
    /INSERT INTO months \(id, year, month, source_month_id, workspace_id\)/,
  );
});

test("month payment reset preserves one-time spent expenses", async () => {
  const route = await readFile(
    new URL("app/api/payroll/route.ts", root),
    "utf8",
  );
  assert.match(route, /action === "resetMonthPayments"/);
  assert.match(
    route,
    /SET is_paid = 0, paid_at = NULL, updated_at = CURRENT_TIMESTAMP/,
  );
  assert.match(
    route,
    /category_id <> \? OR is_recurring <> 0/,
  );
  assert.match(route, /\.bind\(targetId, otherCategoryId\)/);
});

test("month delete removes only month snapshots before the month record", async () => {
  const route = await readFile(
    new URL("app/api/payroll/route.ts", root),
    "utf8",
  );
  assert.match(route, /action === "deleteMonth"/);
  assert.match(route, /Соңғы есептік айды өшіруге болмайды/);

  const componentsDelete = route.indexOf("DELETE FROM salary_components");
  const snapshotsDelete = route.indexOf(
    'DELETE FROM salary_snapshots WHERE month_id = ?',
  );
  const monthDelete = route.indexOf('DELETE FROM months WHERE id = ?');
  assert.ok(componentsDelete >= 0);
  assert.ok(snapshotsDelete > componentsDelete);
  assert.ok(monthDelete > snapshotsDelete);
});
