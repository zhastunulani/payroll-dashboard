import assert from "node:assert/strict";
import test from "node:test";
import { buildPayrollStatement, buildPayrollStatementSheet, payrollStatementFileName } from "../lib/payroll-export.ts";
import type { PayrollData, SalaryRecord } from "../lib/types.ts";

function salary(overrides: Partial<SalaryRecord>): SalaryRecord {
  return {
    id: "salary-1",
    employeeId: "employee-1",
    employeeName: "Айым",
    position: "Маман",
    departmentId: "department-1",
    departmentName: "Академ",
    paymentMethodId: "transfer",
    paymentMethodName: "Аударым",
    baseSalary: 100_000,
    note: "50% берілді",
    components: [
      { id: "bonus", name: "Бонус", kind: "addition", amount: 25_000 },
      { id: "deduction", name: "Ұсталым", kind: "deduction", amount: 5_000 },
    ],
    total: 120_000,
    isPaid: false,
    paidAt: null,
    archivedAt: null,
    ...overrides,
  };
}

const data = {
  selectedWorkspace: { id: "workspace-main", name: "EdUser", initials: "E" },
  selectedMonth: { id: "2026-08", year: 2026, month: 8, label: "2026 ж. тамыз" },
  departments: [
    { id: "department-1", name: "Академ", sortOrder: 1, archivedAt: null, employees: [salary({})], total: 120_000, paid: 0, remaining: 120_000 },
    { id: "department-2", name: "Маркетинг", sortOrder: 2, archivedAt: null, employees: [salary({ id: "salary-2", employeeId: "employee-2", employeeName: "Дана", departmentId: "department-2", departmentName: "Маркетинг", total: 90_000, baseSalary: 90_000, components: [] })], total: 90_000, paid: 0, remaining: 90_000 },
  ],
} as PayrollData;

test("payroll statement exports only selected departments and final payable salary", () => {
  const statement = buildPayrollStatement(data, ["department-1"]);
  assert.equal(statement.departments.length, 1);
  assert.equal(statement.employeeCount, 1);
  assert.equal(statement.employees[0]?.baseSalary, 100_000);
  assert.equal(statement.employees[0]?.additions, 25_000);
  assert.equal(statement.employees[0]?.deductions, 5_000);
  assert.equal(statement.employees[0]?.payableAmount, 120_000);
  assert.equal(statement.payableAmount, 120_000);
});

test("payroll statement total includes every selected department", () => {
  const statement = buildPayrollStatement(data, ["department-1", "department-2"]);
  assert.equal(statement.employeeCount, 2);
  assert.equal(statement.payableAmount, 210_000);
  assert.equal(payrollStatementFileName(statement), "EdUser-2026-08-төлем-ведомосы.xlsx");
});

test("payroll statement sheet is a plain bordered table without decorative styles", () => {
  const statement = buildPayrollStatement(data, ["department-1"]);
  const sheet = buildPayrollStatementSheet(statement);
  assert.deepEqual(sheet.rows[0]?.map((cell) => cell && "value" in cell ? cell.value : null), [
    "№", "Бөлім", "Қызметкер", "Лауазымы", "Төлем түрі", "Негізгі айлық",
    "Қосымша", "Ұсталым", "Нақты төленетін сома", "Статус", "Пікір",
  ]);
  assert.equal(sheet.rows.length, statement.employeeCount + 2);
  for (const row of sheet.rows) {
    assert.equal(row.length, 11);
    for (const cell of row) {
      assert.ok(cell);
      assert.equal(cell.borderColor, "#000000");
      assert.equal(cell.borderStyle, "thin");
      assert.equal(cell.backgroundColor, undefined);
      assert.equal(cell.color, undefined);
      assert.equal(cell.fontWeight, undefined);
      assert.equal(cell.span, undefined);
    }
  }
});
