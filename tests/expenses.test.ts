import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  isOneTimeOtherExpense,
  OTHER_EXPENSE_CATEGORY_ID,
  OTHER_EXPENSE_CATEGORY_NAME,
} from "../lib/expenses.ts";
import type { ExpenseRecord } from "../lib/types.ts";

const root = new URL("../", import.meta.url);

function expense(overrides: Partial<ExpenseRecord> = {}): ExpenseRecord {
  return {
    id: "expense-1",
    categoryId: OTHER_EXPENSE_CATEGORY_ID,
    categoryName: OTHER_EXPENSE_CATEGORY_NAME,
    name: "Парта",
    departmentId: null,
    departmentName: null,
    amount: 120_000,
    isRecurring: false,
    isPaid: false,
    paidAt: null,
    isOneTime: true,
    ...overrides,
  };
}

test("only non-recurring records in the system category enter the other-expense registry", () => {
  assert.equal(isOneTimeOtherExpense(expense()), true);
  assert.equal(isOneTimeOtherExpense(expense({ isRecurring: true })), false);
  assert.equal(
    isOneTimeOtherExpense(expense({ categoryId: "expense-internet" })),
    false,
  );
});

test("new month copying and one-time saving use opposite recurring flags", async () => {
  const route = await readFile(
    new URL("app/api/payroll/route.ts", root),
    "utf8",
  );
  assert.match(route, /FROM expenses WHERE month_id = \? AND is_recurring = 1/);
  assert.match(
    route,
    /VALUES \(\?, \?, \?, \?, \?, \?, 0, 1, CURRENT_TIMESTAMP, \?\)/,
  );
  assert.match(route, /is_paid = 1,/);
  assert.match(route, /WHERE id = \? AND month_id = \? AND category_id = \? AND is_recurring = 0/);
});

test("existing one-time other expenses are migrated to spent records", async () => {
  const database = await readFile(
    new URL("lib/database.ts", root),
    "utf8",
  );
  assert.match(
    database,
    /SET is_paid = 1,\s+paid_at = COALESCE\(paid_at, created_at\)/,
  );
  assert.match(
    database,
    /WHERE category_id = \? AND is_recurring = 0/,
  );
});

test("subscriptions store their department and copy it to a new month", async () => {
  const [database, route, form, page, css] = await Promise.all([
    readFile(new URL("lib/database.ts", root), "utf8"),
    readFile(new URL("app/api/payroll/route.ts", root), "utf8"),
    readFile(new URL("app/components/ExpenseForm.vue", root), "utf8"),
    readFile(new URL("app/pages/expenses.vue", root), "utf8"),
    readFile(new URL("app/assets/css/main.css", root), "utf8"),
  ]);
  assert.match(database, /department_id TEXT/);
  assert.match(database, /department_name TEXT/);
  assert.match(route, /Подписка қай бөлімге тиесілі екенін таңдаңыз/);
  assert.match(route, /expense\.department_id/);
  assert.match(form, /Қай бөлімге тиесілі\?/);
  assert.match(form, /Не алынды\?/);
  assert.match(page, /Подписка қосу/);
  assert.match(page, /expense\.departmentName/);
  assert.match(css, /settings-workspace:has\(\.smart-select\.open\)/);
  assert.match(css, /management-filter \.smart-select-menu/);
  assert.match(css, /@media \(max-width: 480px\)/);
  assert.match(css, /metric-grid \{ grid-template-columns: 1fr; \}/);
});
