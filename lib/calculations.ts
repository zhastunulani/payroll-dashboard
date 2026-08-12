import type {
  BreakdownItem,
  DashboardStats,
  ExpenseRecord,
  SalaryComponent,
  SalaryRecord,
} from "./types";

export function salaryTotal(
  baseSalary: number,
  components: SalaryComponent[],
): number {
  return Math.max(
    0,
    Math.round(baseSalary) +
      components.reduce(
        (sum, component) =>
          sum +
          (component.kind === "deduction"
            ? -Math.round(component.amount)
            : Math.round(component.amount)),
        0,
      ),
  );
}

export function computeStats(
  salaries: SalaryRecord[],
  expenses: ExpenseRecord[],
): DashboardStats {
  const salarySum = salaries.reduce((sum, salary) => sum + salary.total, 0);
  const expenseSum = expenses.reduce((sum, expense) => sum + expense.amount, 0);
  const paidSalary = salaries.reduce(
    (sum, salary) => sum + (salary.isPaid ? salary.total : 0),
    0,
  );
  const paidExpenses = expenses.reduce(
    (sum, expense) => sum + (expense.isPaid ? expense.amount : 0),
    0,
  );
  const plannedTotal = salarySum + expenseSum;
  const paidTotal = paidSalary + paidExpenses;

  return {
    salaryTotal: salarySum,
    expenseTotal: expenseSum,
    plannedTotal,
    paidTotal,
    remainingTotal: Math.max(0, plannedTotal - paidTotal),
    paidEmployees: salaries.filter((salary) => salary.isPaid).length,
    employeeCount: salaries.length,
    paymentProgress: plannedTotal
      ? Math.min(100, Math.round((paidTotal / plannedTotal) * 100))
      : 0,
  };
}

export function buildBreakdown(
  current: Array<{ id: string; name: string; amount: number }>,
  previous: Array<{ id: string; name: string; amount: number }>,
): BreakdownItem[] {
  const previousMap = new Map(previous.map((item) => [item.id, item]));
  const all = new Map<string, { id: string; name: string; amount: number }>();

  for (const item of previous) all.set(item.id, { ...item, amount: 0 });
  for (const item of current) all.set(item.id, item);

  return [...all.values()]
    .map((item) => {
      const previousAmount = previousMap.get(item.id)?.amount ?? 0;
      const change = item.amount - previousAmount;
      return {
        ...item,
        previousAmount,
        change,
        changePercent: previousAmount
          ? Math.round((change / previousAmount) * 1000) / 10
          : item.amount
            ? null
            : 0,
      };
    })
    .sort((a, b) => b.amount - a.amount);
}

export function monthLabel(year: number, month: number): string {
  const monthNames = [
    "қаңтар",
    "ақпан",
    "наурыз",
    "сәуір",
    "мамыр",
    "маусым",
    "шілде",
    "тамыз",
    "қыркүйек",
    "қазан",
    "қараша",
    "желтоқсан",
  ];
  return `${year} ж. ${monthNames[month - 1] ?? String(month).padStart(2, "0")}`;
}
