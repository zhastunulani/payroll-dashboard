import assert from "node:assert/strict";
import test from "node:test";
import { computeUnitEconomics } from "../lib/unit-economics.ts";

test("keeps lead cost separate from customer acquisition cost", () => {
  const result = computeUnitEconomics(0, [], {
    unitType: "client",
    revenue: 0,
    unitCount: 0,
    leads: 3_160,
    acquiredCustomers: 0,
    marketingPeriod: "29.07–29.08",
    marketingSpend: 3_346_923,
    marketingSpendUsd: 7_031.35,
    payrollTaxes: 0,
    contractorPayments: 0,
    categoryGroups: {},
  });

  assert.equal(result.summary.marketing, 3_346_923);
  assert.equal(result.summary.costPerLead, 1_059.15);
  assert.equal(result.summary.customerAcquisitionCost, null);
});
