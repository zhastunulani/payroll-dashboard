import assert from "node:assert/strict";
import test from "node:test";
import { computeUnitEconomics, defaultExpenseGroup } from "../lib/unit-economics.ts";
import type { ExpenseRecord, UnitEconomicsSettings } from "../lib/types.ts";

function expense(id: string, categoryName: string, name: string, amount: number): ExpenseRecord {
  return {
    id,
    categoryId: id,
    categoryName,
    name,
    departmentId: null,
    departmentName: null,
    amount,
    isRecurring: true,
    isPaid: true,
    paidAt: null,
    isOneTime: false,
  };
}

test("automatically recognizes marketing and variable expenses", () => {
  assert.equal(defaultExpenseGroup(expense("a", "Маркетинг", "Таргет", 1)), "marketing");
  assert.equal(defaultExpenseGroup(expense("b", "Логистика", "Доставка", 1)), "variable");
  assert.equal(defaultExpenseGroup(expense("c", "Офис", "Аренда", 1)), "fixed");
});

test("calculates contribution, profit, CAC and break-even point", () => {
  const settings: UnitEconomicsSettings = {
    unitType: "order",
    revenue: 1_000_000,
    unitCount: 100,
    leads: 50,
    acquiredCustomers: 20,
    marketingPeriod: "01.08–31.08",
    marketingSpend: 0,
    marketingSpendUsd: 0,
    payrollTaxes: 50_000,
    contractorPayments: 25_000,
    categoryGroups: {},
  };
  const result = computeUnitEconomics(300_000, [
    expense("marketing", "Маркетинг", "Таргет", 100_000),
    expense("delivery", "Логистика", "Доставка", 200_000),
    expense("rent", "Офис", "Аренда", 75_000),
  ], settings);

  assert.equal(result.summary.payroll, 375_000);
  assert.equal(result.summary.variable, 200_000);
  assert.equal(result.summary.marketing, 100_000);
  assert.equal(result.summary.fixed, 75_000);
  assert.equal(result.summary.contribution, 700_000);
  assert.equal(result.summary.operatingProfit, 250_000);
  assert.equal(result.summary.revenuePerUnit, 10_000);
  assert.equal(result.summary.contributionPerUnit, 7_000);
  assert.equal(result.summary.customerAcquisitionCost, 5_000);
  assert.equal(result.summary.costPerLead, 2_000);
  assert.equal(result.summary.breakEvenUnits, 65);
});

test("allows a category to be excluded without losing its amount", () => {
  const result = computeUnitEconomics(0, [expense("misc", "Басқа", "Тест", 10_000)], {
    unitType: "service",
    revenue: 20_000,
    unitCount: 1,
    leads: 0,
    acquiredCustomers: 0,
    marketingPeriod: "",
    marketingSpend: 0,
    marketingSpendUsd: 0,
    payrollTaxes: 0,
    contractorPayments: 0,
    categoryGroups: { misc: "excluded" },
  });
  assert.equal(result.summary.totalCosts, 0);
  assert.equal(result.summary.excluded, 10_000);
  assert.equal(result.summary.operatingProfit, 20_000);
});
