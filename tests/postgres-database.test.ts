import assert from "node:assert/strict";
import test from "node:test";
import { postgresQuery } from "../lib/postgres-database.ts";

test("converts D1 placeholders to ordered Postgres parameters", () => {
  assert.equal(
    postgresQuery(
      "UPDATE salary_snapshots SET base_salary = ? WHERE month_id = ? AND employee_id = ?",
    ),
    "UPDATE salary_snapshots SET base_salary = $1 WHERE month_id = $2 AND employee_id = $3",
  );
});

test("converts INSERT OR IGNORE to a Postgres conflict clause", () => {
  assert.equal(
    postgresQuery(
      "INSERT OR IGNORE INTO months (id, year, month) VALUES (?, ?, ?);",
    ),
    "INSERT INTO months (id, year, month) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING",
  );
});

test("turns numeric CASE conditions into Postgres booleans", () => {
  assert.equal(
    postgresQuery(
      "UPDATE expenses SET is_paid = ?, paid_at = CASE WHEN ? THEN CURRENT_TIMESTAMP ELSE NULL END WHERE id = ?",
    ),
    "UPDATE expenses SET is_paid = $1, paid_at = CASE WHEN ($2 <> 0) THEN CURRENT_TIMESTAMP ELSE NULL END WHERE id = $3",
  );
});

test("keeps native Postgres SQL unchanged", () => {
  const query =
    "SELECT value FROM app_settings WHERE key = $1 ORDER BY updated_at DESC";
  assert.equal(postgresQuery(query), query);
});
