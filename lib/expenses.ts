import type { ExpenseRecord } from "./types";

export const OTHER_EXPENSE_CATEGORY_ID = "expense-other";
export const OTHER_EXPENSE_CATEGORY_NAME = "Басқа шығындар";

export function isOneTimeOtherExpense(expense: ExpenseRecord): boolean {
  return (
    expense.categoryId === OTHER_EXPENSE_CATEGORY_ID &&
    !expense.isRecurring
  );
}
