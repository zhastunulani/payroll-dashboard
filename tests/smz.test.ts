import assert from "node:assert/strict";
import test from "node:test";
import { buildSmzPlan } from "../lib/smz.ts";

test("бір қызметкердің айлығы бірнеше SMZ шотына бөлінбейді", () => {
  const plan = buildSmzPlan([
    { id: "a", employeeName: "A", position: "", departmentName: "D", amount: 1_500_000, jobLevel: 1 },
  ], [
    { salaryId: "r1", employeeName: "R1", jobLevel: 1, limit: 1_200_000 },
    { salaryId: "r2", employeeName: "R2", jobLevel: 1, limit: 1_200_000 },
  ]);
  assert.deepEqual(plan.accounts.map((account) => account.used), [0, 0]);
  assert.equal(plan.unallocatedTotal, 1_500_000);
  assert.equal(plan.unallocated[0]?.amount, 1_500_000);
});

test("толық орналастыру мүмкін болса, алгоритм 100 пайыз комбинацияны табады", () => {
  const salaries = [6, 5, 3, 2, 2, 2].map((amount, index) => ({
    id: String(index), employeeName: String(index), position: "", departmentName: "D", amount, jobLevel: 1,
  }));
  const plan = buildSmzPlan(salaries, [
    { salaryId: "r1", employeeName: "R1", jobLevel: 1, limit: 10 },
    { salaryId: "r2", employeeName: "R2", jobLevel: 1, limit: 10 },
  ]);
  assert.equal(plan.allocated, 20);
  assert.equal(plan.unallocatedTotal, 0);
  assert.equal(new Set(plan.accounts.flatMap((account) => account.allocations.map((item) => item.salaryId))).size, salaries.length);
});

test("төмен деңгейлі SMZ шоты директор ақшасын қабылдамайды", () => {
  const plan = buildSmzPlan([
    { id: "director", employeeName: "Director", position: "Директор", departmentName: "D", amount: 500_000, jobLevel: 4 },
  ], [
    { salaryId: "staff", employeeName: "Staff", jobLevel: 1, limit: 1_200_000 },
  ]);
  assert.equal(plan.allocated, 0);
  assert.equal(plan.unallocatedTotal, 500_000);
});

test("өз айлығы алдымен өз SMZ шотына бөлінеді", () => {
  const plan = buildSmzPlan([
    { id: "self", employeeName: "Self", position: "", departmentName: "D", amount: 300_000, jobLevel: 2 },
  ], [
    { salaryId: "other", employeeName: "Other", jobLevel: 2, limit: 1_200_000 },
    { salaryId: "self", employeeName: "Self", jobLevel: 2, limit: 1_200_000 },
  ]);
  assert.equal(plan.accounts.find((account) => account.salaryId === "self")?.used, 300_000);
});

test("төленген айлық жоспарға кірмейді", () => {
  const plan = buildSmzPlan([
    { id: "paid", employeeName: "Paid", position: "", departmentName: "D", amount: 300_000, jobLevel: 1, isPaid: true },
  ], [
    { salaryId: "receiver", employeeName: "Receiver", jobLevel: 1, limit: 1_200_000 },
  ]);
  assert.equal(plan.total, 0);
});

test("шектеусіз SMZ шоты лауазымына қарамастан директор ақшасын қабылдайды", () => {
  const plan = buildSmzPlan([
    { id: "director", employeeName: "Director", position: "Директор", departmentName: "D", amount: 500_000, jobLevel: 4 },
  ], [
    { salaryId: "owner", employeeName: "Owner", jobLevel: 1, unrestricted: true, limit: 1_200_000 },
  ]);
  assert.equal(plan.allocated, 500_000);
  assert.equal(plan.unallocatedTotal, 0);
});
