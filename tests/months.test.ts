import assert from "node:assert/strict";
import test from "node:test";
import { addMonths, nextAvailableMonthId } from "../lib/months.ts";

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
