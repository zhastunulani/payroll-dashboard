import assert from "node:assert/strict";
import test from "node:test";
import { buildBreakdown, computeStats, monthLabel, salaryTotal } from "../lib/calculations.ts";
import type { ExpenseRecord, SalaryRecord } from "../lib/types.ts";

test("salary total combines base, additions and deductions", () => {
  assert.equal(
    salaryTotal(500_000, [
      { id: "1", name: "ПС", kind: "addition", amount: 120_000 },
      { id: "2", name: "Ұсталым", kind: "deduction", amount: 20_000 },
    ]),
    600_000,
  );
});

test("paid and remaining totals include salaries and expenses", () => {
  const salaries: SalaryRecord[] = [
    {
      id: "s1",
      employeeId: "e1",
      employeeName: "A",
      position: "",
      departmentId: "d1",
      departmentName: "Академ",
      paymentMethodId: "p1",
      paymentMethodName: "Аударым",
      baseSalary: 400_000,
      note: "",
      components: [],
      total: 400_000,
      isPaid: true,
      paidAt: null,
      archivedAt: null,
    },
    {
      id: "s2",
      employeeId: "e2",
      employeeName: "B",
      position: "",
      departmentId: "d2",
      departmentName: "Мұғалімдер",
      paymentMethodId: "p1",
      paymentMethodName: "Аударым",
      baseSalary: 600_000,
      note: "50% берілді",
      components: [],
      total: 600_000,
      isPaid: false,
      paidAt: null,
      archivedAt: null,
    },
  ];
  const expenses: ExpenseRecord[] = [
    {
      id: "x1",
      categoryId: "c1",
      categoryName: "Интернет",
      name: "Интернет",
      amount: 50_000,
      isRecurring: true,
      isPaid: true,
      paidAt: null,
    },
  ];
  assert.deepEqual(computeStats(salaries, expenses), {
    salaryTotal: 1_000_000,
    expenseTotal: 50_000,
    plannedTotal: 1_050_000,
    paidTotal: 450_000,
    remainingTotal: 600_000,
    paidEmployees: 1,
    employeeCount: 2,
    paymentProgress: 43,
  });
});

test("one-time other expenses are immediately counted as spent", () => {
  const expenses: ExpenseRecord[] = [
    {
      id: "x-one-time",
      categoryId: "expense-other",
      categoryName: "Басқа шығындар",
      name: "Парта",
      amount: 420_000,
      isRecurring: false,
      isPaid: true,
      paidAt: null,
    },
  ];

  assert.deepEqual(computeStats([], expenses), {
    salaryTotal: 0,
    expenseTotal: 420_000,
    plannedTotal: 420_000,
    paidTotal: 420_000,
    remainingTotal: 0,
    paidEmployees: 0,
    employeeCount: 0,
    paymentProgress: 100,
  });
});

test("breakdown compares current and previous month", () => {
  const result = buildBreakdown(
    [{ id: "d1", name: "Академ", amount: 1_200_000 }],
    [
      { id: "d1", name: "Академ", amount: 1_000_000 },
      { id: "d2", name: "Сату", amount: 400_000 },
    ],
  );
  assert.deepEqual(result, [
    {
      id: "d1",
      name: "Академ",
      amount: 1_200_000,
      previousAmount: 1_000_000,
      change: 200_000,
      changePercent: 20,
    },
    {
      id: "d2",
      name: "Сату",
      amount: 0,
      previousAmount: 400_000,
      change: -400_000,
      changePercent: -100,
    },
  ]);
});

test("month labels use stable Kazakh names in every runtime", () => {
  assert.equal(monthLabel(2026, 8), "2026 ж. тамыз");
  assert.equal(monthLabel(2026, 7), "2026 ж. шілде");
  assert.equal(monthLabel(2026, 3), "2026 ж. наурыз");
});
