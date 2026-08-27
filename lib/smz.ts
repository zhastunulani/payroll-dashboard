export type SmzSalaryInput = {
  id: string;
  employeeName: string;
  position: string;
  departmentName: string;
  amount: number;
  jobLevel: number;
  isPaid?: boolean;
};

export type SmzAccountInput = {
  salaryId: string;
  employeeName: string;
  jobLevel: number;
  unrestricted?: boolean;
  limit: number;
};

export type SmzAllocation = {
  salaryId: string;
  employeeName: string;
  position: string;
  departmentName: string;
  amount: number;
};

export type SmzAccountPlan = SmzAccountInput & {
  used: number;
  remaining: number;
  allocations: SmzAllocation[];
};

export type SmzPlan = {
  accounts: SmzAccountPlan[];
  unallocated: SmzAllocation[];
  total: number;
  allocated: number;
  unallocatedTotal: number;
};

function normalizedMoney(value: number): number {
  return Math.max(0, Math.round(Number.isFinite(value) ? value : 0));
}

type NormalizedSalary = SmzSalaryInput & { amount: number; jobLevel: number };

function canReceive(account: SmzAccountPlan, salary: NormalizedSalary): boolean {
  return Boolean(account.unrestricted) || account.jobLevel >= salary.jobLevel;
}

function allocationItem(salary: NormalizedSalary): SmzAllocation {
  return {
    salaryId: salary.id,
    employeeName: salary.employeeName,
    position: salary.position,
    departmentName: salary.departmentName,
    amount: salary.amount,
  };
}

function findCompleteAssignment(
  salaries: NormalizedSalary[],
  accounts: SmzAccountPlan[],
): { salaries: NormalizedSalary[]; accountIndexes: number[] } | null {
  const ordered = [...salaries].sort((left, right) => {
    const leftOptions = accounts.filter((account) => canReceive(account, left) && account.limit >= left.amount).length;
    const rightOptions = accounts.filter((account) => canReceive(account, right) && account.limit >= right.amount).length;
    return leftOptions - rightOptions || right.jobLevel - left.jobLevel || right.amount - left.amount || left.employeeName.localeCompare(right.employeeName);
  });
  if (ordered.some((salary) => !accounts.some((account) => canReceive(account, salary) && account.limit >= salary.amount))) return null;

  const remaining = accounts.map((account) => account.limit);
  const assignment = Array<number>(ordered.length).fill(-1);
  const suffix = Array<number>(ordered.length + 1).fill(0);
  for (let index = ordered.length - 1; index >= 0; index -= 1) suffix[index] = suffix[index + 1]! + ordered[index]!.amount;
  const memo = new Set<string>();
  let visited = 0;
  const maxStates = 250_000;

  function search(index: number): boolean {
    if (index === ordered.length) return true;
    if (visited >= maxStates || suffix[index]! > remaining.reduce((sum, value) => sum + value, 0)) return false;
    const key = `${index}:${remaining.join(",")}`;
    if (memo.has(key)) return false;
    memo.add(key);
    visited += 1;
    const salary = ordered[index]!;
    const candidates = accounts.map((account, accountIndex) => ({ account, accountIndex }))
      .filter(({ account, accountIndex }) => canReceive(account, salary) && remaining[accountIndex]! >= salary.amount)
      .sort((left, right) => {
        const leftOwn = left.account.salaryId === salary.id ? 0 : 1;
        const rightOwn = right.account.salaryId === salary.id ? 0 : 1;
        const leftFlex = left.account.unrestricted ? 1 : 0;
        const rightFlex = right.account.unrestricted ? 1 : 0;
        return leftOwn - rightOwn || leftFlex - rightFlex || (remaining[left.accountIndex]! - salary.amount) - (remaining[right.accountIndex]! - salary.amount);
      });
    const symmetric = new Set<string>();
    for (const { account, accountIndex } of candidates) {
      const symmetryKey = `${remaining[accountIndex]}:${account.jobLevel}:${Boolean(account.unrestricted)}`;
      if (symmetric.has(symmetryKey)) continue;
      symmetric.add(symmetryKey);
      remaining[accountIndex] = remaining[accountIndex]! - salary.amount;
      assignment[index] = accountIndex;
      if (search(index + 1)) return true;
      remaining[accountIndex] = remaining[accountIndex]! + salary.amount;
      assignment[index] = -1;
    }
    return false;
  }

  return search(0) ? { salaries: ordered, accountIndexes: assignment } : null;
}

export function buildSmzPlan(
  salaries: SmzSalaryInput[],
  accounts: SmzAccountInput[],
): SmzPlan {
  const plans: SmzAccountPlan[] = accounts
    .filter((account) => normalizedMoney(account.limit) > 0)
    .map((account) => ({
      ...account,
      jobLevel: Math.min(4, Math.max(1, Math.round(account.jobLevel))),
      limit: normalizedMoney(account.limit),
      used: 0,
      remaining: normalizedMoney(account.limit),
      allocations: [],
    }));
  const payable: NormalizedSalary[] = salaries
    .filter((salary) => !salary.isPaid && normalizedMoney(salary.amount) > 0)
    .map((salary) => ({
      ...salary,
      jobLevel: Math.min(4, Math.max(1, Math.round(salary.jobLevel))),
      amount: normalizedMoney(salary.amount),
    }))
    .sort((left, right) => right.jobLevel - left.jobLevel || right.amount - left.amount || left.employeeName.localeCompare(right.employeeName));
  const unallocated: SmzAllocation[] = [];
  const complete = findCompleteAssignment(payable, plans);

  if (complete) {
    complete.salaries.forEach((salary, index) => {
      const account = plans[complete.accountIndexes[index]!]!;
      account.allocations.push(allocationItem(salary));
      account.used += salary.amount;
      account.remaining -= salary.amount;
    });
  } else {
    for (const salary of payable) {
      const account = plans
        .filter((candidate) => canReceive(candidate, salary) && candidate.remaining >= salary.amount)
        .sort((left, right) => {
          const leftOwn = left.salaryId === salary.id ? 0 : 1;
          const rightOwn = right.salaryId === salary.id ? 0 : 1;
          const leftFlex = left.unrestricted ? 1 : 0;
          const rightFlex = right.unrestricted ? 1 : 0;
          return leftOwn - rightOwn || leftFlex - rightFlex || (left.remaining - salary.amount) - (right.remaining - salary.amount);
        })[0];
      if (!account) {
        unallocated.push(allocationItem(salary));
        continue;
      }
      account.allocations.push(allocationItem(salary));
      account.used += salary.amount;
      account.remaining -= salary.amount;
    }
  }

  const total = payable.reduce((sum, salary) => sum + salary.amount, 0);
  const allocated = plans.reduce((sum, account) => sum + account.used, 0);
  return {
    accounts: plans,
    unallocated,
    total,
    allocated,
    unallocatedTotal: total - allocated,
  };
}
