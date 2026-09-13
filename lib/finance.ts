export const FINANCE_CATEGORIES = {
  payroll: "Айлық / ФОТ", contractors: "Мердігерлер және контент", marketing: "Маркетинг / таргет",
  tax: "Салық және аударымдар", rent: "Аренда", services: "Сервистер және байланыс",
  variable: "Өнімнің тікелей шығыны", office: "Кеңсе және шаруашылық", travel: "Іссапар",
  events: "Іс-шаралар", equipment: "Жабдық және жиһаз", deposit: "Қайтарылатын депозит",
  other: "Басқа шығын", revenue: "Табыс",
} as const;
export type FinanceCategory = keyof typeof FINANCE_CATEGORIES;
export type FinanceEntry = {
  id: string; workspaceId: string; period: string; name: string; category: FinanceCategory;
  amount: number | null; basis: "actual" | "plan"; status: "paid" | "unpaid" | "unknown";
  disposition: "included" | "duplicate" | "review"; source: string; note: string;
  relatedId: string; origin: "salary" | "expense" | "legacy" | "import" | "manual";
  updatedAt: string;
  costBehavior?: "fixed" | "variable";
};
export type FinanceMetrics = {
  revenue: number | null; receipts: number | null; units: number | null;
  leads: number | null; customers: number | null; unitType: "client" | "order" | "service";
  marketingAligned: boolean; costsReviewed: boolean; notes: string;
};
export type FinanceProject = { id: string; name: string };
export const EMPTY_FINANCE_METRICS: FinanceMetrics = {
  revenue: null, receipts: null, units: null, leads: null, customers: null,
  unitType: "client", marketingAligned: false, costsReviewed: false, notes: "",
};
export const isOperatingCost = (category: FinanceCategory) => !["equipment", "deposit", "revenue"].includes(category);
export function financePeriod(value: unknown): string {
  const period = String(value ?? "");
  if (!/^20\d{2}-(0[1-9]|1[0-2])$/.test(period)) throw new Error("Есептік ай дұрыс емес.");
  return period;
}
export function optionalAmount(value: unknown, count = false): number | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "string" && typeof value !== "number") throw new Error("Сома дұрыс емес.");
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0 || n > 999_999_999_999 || (count && !Number.isInteger(n))) throw new Error("Сома немесе сан дұрыс емес.");
  return Math.round(n * 100) / 100;
}
function cleanText(value: unknown, max: number): string {
  const s = String(value ?? "").trim();
  if (s.length > max) throw new Error("Мәтін тым ұзын.");
  return s;
}
export function normalizeFinanceMetrics(input: Partial<FinanceMetrics>): FinanceMetrics {
  return {
    revenue: optionalAmount(input.revenue), receipts: optionalAmount(input.receipts),
    units: optionalAmount(input.units, true), leads: optionalAmount(input.leads, true), customers: optionalAmount(input.customers, true),
    unitType: input.unitType === "order" || input.unitType === "service" ? input.unitType : "client",
    marketingAligned: input.marketingAligned === true, costsReviewed: input.costsReviewed === true, notes: cleanText(input.notes, 1200),
  };
}
export function normalizeFinanceEntry(input: Partial<FinanceEntry>): Omit<FinanceEntry, "id" | "origin" | "updatedAt"> {
  const category = String(input.category) as FinanceCategory;
  if (!Object.hasOwn(FINANCE_CATEGORIES, category)) throw new Error("Категория дұрыс емес.");
  const name = cleanText(input.name, 200), workspaceId = cleanText(input.workspaceId, 120);
  if (!name || !workspaceId) throw new Error("Жоба мен атауды толтырыңыз.");
  if (!["actual", "plan"].includes(String(input.basis))) throw new Error("Факт немесе жоспарды таңдаңыз.");
  if (!["paid", "unpaid", "unknown"].includes(String(input.status))) throw new Error("Төлем күйі дұрыс емес.");
  if (!["included", "duplicate", "review"].includes(String(input.disposition))) throw new Error("Есепке қосылу күйі дұрыс емес.");
  return {
    workspaceId, period: financePeriod(input.period), name, category, amount: optionalAmount(input.amount),
    basis: input.basis!, status: input.status!, disposition: input.disposition!,
    source: cleanText(input.source, 1000), note: cleanText(input.note, 3000), relatedId: cleanText(input.relatedId, 200),
  };
}
export function classifyFinanceCost(name: string, category = ""): FinanceCategory {
  const value = `${name} ${category}`.toLocaleLowerCase();
  if (/депозит/.test(value)) return "deposit";
  if (/налог|салық|соц.*аударым/.test(value)) return "tax";
  if (/парта|стуль|орындық|мебель|панель|жиһаз/.test(value)) return "equipment";
  if (/таргет|жарнама|реклам|билборд|баннер|банер|роллап|брошюр/.test(value)) return "marketing";
  if (/аренда/.test(value)) return "rent";
  if (/подписк|интернет|wifi|wi-fi|wazz|вазз|срм|crm|тариф/.test(value)) return "services";
  if (/билет|іссапар|прожив|питание/.test(value)) return "travel";
  if (/іс-шара|фуршет|пицца/.test(value)) return "events";
  if (/дизайн|видеосабақ|келісім|тест|кітап/.test(value)) return "contractors";
  if (/айлық|жалақы/.test(value)) return "payroll";
  if (/жуу|убор|тазалық|кеңсе|канц|конц|бумаг|офис|распечат|шаруашылық/.test(value)) return "office";
  return "other";
}
const sum = (values: number[]) => Math.round(values.reduce((a, b) => a + Math.round(b * 100), 0)) / 100;
export function summarizeFinance(entries: FinanceEntry[], metrics: FinanceMetrics) {
  const included = entries.filter(e => e.disposition === "included" && e.amount !== null);
  const actual = included.filter(e => e.basis === "actual" && e.category !== "revenue");
  const planned = included.filter(e => e.basis === "plan" && e.category !== "revenue");
  const cost = sum(actual.map(e => e.amount!));
  const operating = sum(actual.filter(e => isOperatingCost(e.category)).map(e => e.amount!));
  const capital = sum(actual.filter(e => !isOperatingCost(e.category)).map(e => e.amount!));
  const paid = sum(actual.filter(e => e.status === "paid").map(e => e.amount!));
  const unpaid = sum(actual.filter(e => e.status === "unpaid").map(e => e.amount!));
  const unknown = sum(actual.filter(e => e.status === "unknown").map(e => e.amount!));
  const marketingRows = actual.filter(e => e.category === "marketing");
  const marketing = marketingRows.length ? sum(marketingRows.map(e => e.amount!)) : null;
  const taxRows = actual.filter(e => e.category === "tax");
  const tax = taxRows.length ? sum(taxRows.map(e => e.amount!)) : null;
  const variable = sum(actual.filter(e => isOperatingCost(e.category) && e.category !== "marketing" && (e.costBehavior === "variable" || (!e.costBehavior && e.category === "variable"))).map(e => e.amount!));
  const revenueRows = included.filter(e => e.category === "revenue" && e.basis === "actual");
  // Revenue is owned by the commercial metrics form. Ledger revenue is a fallback for imported ledgers.
  const revenue = metrics.revenue ?? (revenueRows.length ? sum(revenueRows.map(e => e.amount!)) : null);
  const profit = revenue === null ? null : sum([revenue, -operating]);
  const contribution = revenue === null ? null : sum([revenue, -variable, -(marketing ?? 0)]);
  const units = metrics.units;
  const plan = planned.length ? sum(planned.map(e => e.amount!)) : null;
  const categories = (Object.keys(FINANCE_CATEGORIES) as FinanceCategory[]).filter(k => k !== "revenue").map(key => {
    const rows = actual.filter(e => e.category === key);
    const plans = planned.filter(e => e.category === key);
    return { key, name: FINANCE_CATEGORIES[key], amount: rows.length ? sum(rows.map(e => e.amount!)) : null,
      paid: sum(rows.filter(e => e.status === "paid").map(e => e.amount!)),
      plan: plans.length ? sum(plans.map(e => e.amount!)) : null };
  }).filter(c => c.amount !== null || c.plan !== null).sort((a, b) => (b.amount ?? 0) - (a.amount ?? 0));
  return {
    cost, operating, capital, paid, unpaid, unknown, revenue, profit, tax, marketing, plan,
    revenueRecorded: revenue !== null, categories,
    cashNet: metrics.receipts === null ? null : sum([metrics.receipts, -paid]),
    margin: profit !== null && revenue! > 0 ? profit / revenue! : null,
    unitCost: units !== null && units > 0 ? operating / units : null,
    unitRevenue: units !== null && units > 0 && revenue !== null ? revenue / units : null,
    unitContribution: metrics.costsReviewed && units !== null && units > 0 && contribution !== null ? contribution / units : null,
    cpl: metrics.marketingAligned && marketing !== null && metrics.leads !== null && metrics.leads > 0 ? marketing / metrics.leads : null,
    cac: metrics.marketingAligned && marketing !== null && metrics.customers !== null && metrics.customers > 0 ? marketing / metrics.customers : null,
    breakEvenUnits: metrics.costsReviewed && units && units > 0 && contribution !== null && contribution > 0 ? Math.ceil((operating - variable - (marketing ?? 0)) / (contribution / units)) : null,
    missingAmounts: entries.filter(e => e.disposition === "included" && e.amount === null).length,
    review: entries.filter(e => e.disposition === "review").length,
    duplicates: entries.filter(e => e.disposition === "duplicate").length,
  };
}
export function consolidateFinance(projects: Array<{ entries: FinanceEntry[]; metrics: FinanceMetrics }>) {
  const summaries = projects.map(p => summarizeFinance(p.entries, p.metrics));
  const total = summarizeFinance(projects.flatMap(p => p.entries), EMPTY_FINANCE_METRICS);
  const revenueComplete = summaries.length > 0 && summaries.every(s => s.revenue !== null);
  return { ...total, revenue: revenueComplete ? sum(summaries.map(s => s.revenue!)) : null,
    profit: revenueComplete ? sum(summaries.map(s => s.profit!)) : null,
    revenueRecorded: revenueComplete, revenueCoverage: summaries.filter(s => s.revenue !== null).length,
    margin: null, unitCost: null, unitRevenue: null, unitContribution: null, cac: null, cpl: null, breakEvenUnits: null,
    cashNet: projects.length && projects.every(p => p.metrics.receipts !== null) ? sum(summaries.map(s => s.cashNet!)) : null };
}
