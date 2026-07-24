import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

test("bulk salary status is scoped to the selected month", async () => {
  const route = await readFile(
    new URL("app/api/payroll/route.ts", root),
    "utf8",
  );
  assert.match(route, /action === "setSalaryPaidBulk"/);
  assert.match(
    route,
    /WHERE month_id = \? AND id IN \(\$\{placeholders\}\)/,
  );
});

test("bulk employee deletion removes components, snapshots and employees", async () => {
  const route = await readFile(
    new URL("app/api/payroll/route.ts", root),
    "utf8",
  );
  assert.match(route, /action === "deleteEmployeesBulk"/);
  assert.match(route, /WHERE month_id = \? AND employee_id IN/);
  assert.match(route, /DELETE FROM salary_components/);
  assert.match(route, /DELETE FROM salary_snapshots/);
  assert.match(route, /DELETE FROM employees WHERE id IN/);
});

test("imported components are folded into the main salary", async () => {
  const route = await readFile(
    new URL("app/api/payroll/route.ts", root),
    "utf8",
  );
  assert.match(route, /const importedSalary = importedComponents\.reduce/);
  assert.match(route, /importedSalary,\s+flag\(row\.isPaid\)/);
});

test("bulk expense actions are scoped to the month and exclude spent registry records", async () => {
  const route = await readFile(
    new URL("app/api/payroll/route.ts", root),
    "utf8",
  );
  assert.match(route, /action === "setExpensePaidBulk"/);
  assert.match(route, /action === "deleteExpensesBulk"/);
  assert.match(
    route,
    /WHERE month_id = \? AND id IN \(\$\{placeholders\}\)\s+AND \(category_id <> \? OR is_recurring <> 0\)/,
  );
});
