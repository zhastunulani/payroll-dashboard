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
    amount: 120_000,
    isRecurring: false,
    isPaid: false,
    paidAt: null,
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
  assert.match(route, /VALUES \(\?, \?, \?, \?, \?, \?, 0\)/);
  assert.match(route, /WHERE id = \? AND month_id = \? AND category_id = \? AND is_recurring = 0/);
});
