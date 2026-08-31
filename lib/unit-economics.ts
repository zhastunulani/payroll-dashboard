import type {
  ExpenseRecord,
  UnitCostGroup,
  UnitEconomicsData,
  UnitEconomicsSettings,
  UnitEconomicsSummary,
  UnitType,
} from "./types";

export const DEFAULT_UNIT_ECONOMICS_SETTINGS: UnitEconomicsSettings = {
  unitType: "order",
  revenue: 0,
  unitCount: 0,
  leads: 0,
  acquiredCustomers: 0,
  marketingPeriod: "",
  marketingSpend: 0,
  marketingSpendUsd: 0,
  payrollTaxes: 0,
  contractorPayments: 0,
  categoryGroups: {},
};

const UNIT_TYPES = new Set<UnitType>(["order", "client", "product", "service"]);
const COST_GROUPS = new Set<UnitCostGroup>([
  "payroll",
  "variable",
  "marketing",
  "fixed",
  "excluded",
]);

function nonNegative(value: unknown): number {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0
    ? Math.min(2_000_000_000, Math.round(number))
    : 0;
}

function nonNegativeDecimal(value: unknown): number {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0
    ? Math.min(2_000_000_000, Math.round(number * 100) / 100)
    : 0;
}

export function normalizeUnitEconomicsSettings(
  value: unknown,
): UnitEconomicsSettings {
  const raw = value && typeof value === "object"
    ? value as Record<string, unknown>
    : {};
  const categoryGroups: Record<string, UnitCostGroup> = {};
  if (raw.categoryGroups && typeof raw.categoryGroups === "object") {
    for (const [id, group] of Object.entries(raw.categoryGroups)) {
      if (id && COST_GROUPS.has(group as UnitCostGroup)) {
        categoryGroups[id] = group as UnitCostGroup;
      }
    }
  }
  return {
    unitType: UNIT_TYPES.has(raw.unitType as UnitType)
      ? raw.unitType as UnitType
      : DEFAULT_UNIT_ECONOMICS_SETTINGS.unitType,
    revenue: nonNegative(raw.revenue),
    unitCount: nonNegative(raw.unitCount),
    leads: nonNegative(raw.leads),
    acquiredCustomers: nonNegative(raw.acquiredCustomers),
    marketingPeriod: String(raw.marketingPeriod ?? "").trim().slice(0, 40),
    marketingSpend: nonNegative(raw.marketingSpend),
    marketingSpendUsd: nonNegativeDecimal(raw.marketingSpendUsd),
    payrollTaxes: nonNegative(raw.payrollTaxes),
    contractorPayments: nonNegative(raw.contractorPayments),
    categoryGroups,
  };
}

export function defaultExpenseGroup(
  expense: Pick<ExpenseRecord, "name" | "categoryName">,
): UnitCostGroup {
  const text = `${expense.categoryName} ${expense.name}`.toLocaleLowerCase("kk-KZ");
  if (/таргет|маркет|реклам|smm|лид|продвиж|контент|блогер/.test(text)) {
    return "marketing";
  }
  if (/себесто|упаков|достав|логист|комисси|эквайр|маркетплейс|возврат|қолдау|поддерж/.test(text)) {
    return "variable";
  }
  if (/подряд|фриланс|гонорар|еңбекақы|зарплат|айлық/.test(text)) {
    return "payroll";
  }
  return "fixed";
}

function safeDivide(value: number, divisor: number): number | null {
  return divisor > 0 ? Math.round((value / divisor) * 100) / 100 : null;
}

export function computeUnitEconomics(
  salaryTotal: number,
  expenses: ExpenseRecord[],
  input: UnitEconomicsSettings,
): UnitEconomicsData {
  const settings = normalizeUnitEconomicsSettings(input);
  const totals: Record<UnitCostGroup, number> = {
    payroll: 0,
    variable: 0,
    marketing: 0,
    fixed: 0,
    excluded: 0,
  };
  const categoryMap = new Map<string, {
    id: string;
    name: string;
    amount: number;
    group: UnitCostGroup;
  }>();

  for (const expense of expenses) {
    const group = settings.categoryGroups[expense.categoryId]
      ?? defaultExpenseGroup(expense);
    totals[group] += expense.amount;
    const category = categoryMap.get(expense.categoryId) ?? {
      id: expense.categoryId,
      name: expense.categoryName,
      amount: 0,
      group,
    };
    category.amount += expense.amount;
    category.group = group;
    categoryMap.set(expense.categoryId, category);
  }

  const payroll = Math.round(salaryTotal)
    + settings.payrollTaxes
    + settings.contractorPayments
    + totals.payroll;
  const variable = totals.variable;
  const marketing = totals.marketing + settings.marketingSpend;
  const fixed = totals.fixed;
  const totalCosts = payroll + variable + marketing + fixed;
  const contribution = settings.revenue - variable - marketing;
  const operatingProfit = settings.revenue - totalCosts;
  const contributionPerUnit = safeDivide(contribution, settings.unitCount);
  const summary: UnitEconomicsSummary = {
    payroll,
    variable,
    marketing,
    fixed,
    excluded: totals.excluded,
    totalCosts,
    contribution,
    operatingProfit,
    revenuePerUnit: safeDivide(settings.revenue, settings.unitCount),
    variablePerUnit: safeDivide(variable, settings.unitCount),
    contributionPerUnit,
    customerAcquisitionCost: safeDivide(marketing, settings.acquiredCustomers),
    costPerLead: safeDivide(marketing, settings.leads),
    operatingMarginPercent: settings.revenue > 0
      ? Math.round((operatingProfit / settings.revenue) * 1000) / 10
      : null,
    breakEvenUnits: contributionPerUnit && contributionPerUnit > 0
      ? Math.ceil((payroll + fixed) / contributionPerUnit)
      : null,
  };

  return {
    settings,
    summary,
    categories: [...categoryMap.values()].sort((a, b) => b.amount - a.amount),
  };
}
