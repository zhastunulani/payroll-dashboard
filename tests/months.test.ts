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
});

test("new month API excludes the two empty-start departments", async () => {
  const route = await readFile(
    new URL("app/api/payroll/route.ts", root),
    "utf8",
  );
  assert.match(route, /e\.department_id NOT IN \(\?, \?\)/);
  assert.match(route, /EMPTY_DEPARTMENT_IDS_ON_NEW_MONTH/);
});
