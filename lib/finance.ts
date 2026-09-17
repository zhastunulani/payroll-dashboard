export const FINANCE_CATEGORIES = {
  payroll: "Айлық / ФОТ",
  contractors: "Мердігерлер және контент",
  marketing: "Таргет (Facebook / Instagram)",
  promo: "Сыртқы жарнама және баспа",
  tax: "Салық және аударымдар",
  rent: "Аренда",
  services: "Сервистер және байланыс",
  variable: "Өнімнің тікелей шығыны",
  office: "Кеңсе және шаруашылық",
  travel: "Іссапар",
  events: "Іс-шаралар",
  equipment: "Жабдық және жиһаз",
  deposit: "Қайтарылатын депозит",
  other: "Басқа шығын",
  revenue: "Табыс",
} as const;
export type FinanceCategory = keyof typeof FINANCE_CATEGORIES;

/** Management P&L groups. Every cost category belongs to exactly one group. */
export const COST_GROUPS = {
  payroll: "ФОТ",
  marketing: "Таргет / маркетинг",
  opex: "Операциялық шығын",
  tax: "Салық",
  capex: "Жабдық / депозит",
} as const;
export type CostGroup = keyof typeof COST_GROUPS;

const CATEGORY_GROUP: Record<Exclude<FinanceCategory, "revenue">, CostGroup> = {
  payroll: "payroll",
  marketing: "marketing",
  promo: "opex",
  tax: "tax",
  contractors: "opex",
  rent: "opex",
  services: "opex",
  variable: "opex",
  office: "opex",
  travel: "opex",
  events: "opex",
  other: "opex",
  equipment: "capex",
  deposit: "capex",
};

/**
 * How money leaves a project, as the owner tracks it:
 * salaries and mandatory monthly payments (rent, internet, subscriptions) are obligations that are paid or not yet;
 * advertising and other spending are money already spent.
 */
export const FINANCE_KINDS = {
  salary: "Айлық",
  mandatory: "Міндетті төлемдер",
  target: "Таргет (Facebook)",
  other: "Басқа шығындар",
} as const;
export type FinanceKind = keyof typeof FINANCE_KINDS;
export const KIND_ORDER: FinanceKind[] = ["salary", "mandatory", "target", "other"];

/** P&L presentation order: team, acquisition, operations, taxes, then capital below the line. */
export const PNL_ORDER: Array<Exclude<FinanceCategory, "revenue">> = [
  "payroll", "contractors", "marketing", "promo", "variable", "rent", "services",
  "office", "travel", "events", "other", "tax", "equipment", "deposit",
];

export type FinanceEntry = {
  id: string;
  workspaceId: string;
  period: string;
  name: string;
  category: FinanceCategory;
  amount: number | null;
  basis: "actual" | "plan";
  status: "paid" | "unpaid" | "unknown";
  disposition: "included" | "duplicate" | "review";
  source: string;
  note: string;
  relatedId: string;
  origin: "salary" | "expense" | "legacy" | "import" | "manual" | "meta";
  updatedAt: string;
  costBehavior?: "fixed" | "variable";
  /** Department for payroll rows, expense category for Payroll expenses. */
  group?: string;
  /** Payroll expense from the one-time «Басқа шығындар» register (always spent). */
  oneTime?: boolean;
  /** Original currency data, e.g. an advertising top-up paid in USD. */
  currency?: "KZT" | "USD";
  currencyAmount?: number | null;
  fxRate?: number | null;
};

export type FinanceMetrics = {
  revenue: number | null;
  receipts: number | null;
  units: number | null;
  leads: number | null;
  customers: number | null;
  retentionMonths: number | null;
  unitType: "client" | "order" | "service";
  marketingAligned: boolean;
  costsReviewed: boolean;
  notes: string;
};
export type FinanceProject = { id: string; name: string };

export const EMPTY_FINANCE_METRICS: FinanceMetrics = {
  revenue: null,
  receipts: null,
  units: null,
  leads: null,
  customers: null,
  retentionMonths: null,
  unitType: "client",
  marketingAligned: false,
  costsReviewed: false,
  notes: "",
};

export const isOperatingCost = (category: FinanceCategory) =>
  !["equipment", "deposit", "revenue"].includes(category);

export function categoryGroup(category: FinanceCategory): CostGroup | null {
  return category === "revenue" ? null : CATEGORY_GROUP[category];
}

/** Paid social advertising: the only spending that counts as «Таргет». */
export function isFacebookTarget(text: string): boolean {
  return /таргет|target|facebook|фейсбук|инстаграм|instagram|\bmeta\b|\bfb\b|ads manager/i.test(text);
}

/**
 * Imported rows were once filed as marketing for any advertising. Only Facebook / Instagram target stays
 * «Таргет»; offline advertising (billboards, banners, signs, print) becomes a one-time purchase.
 * Manually entered rows keep the category the owner chose.
 */
export function importedCategory(e: Pick<FinanceEntry, "origin" | "category" | "name" | "note" | "currency">): FinanceCategory {
  if (e.origin !== "import" || e.category !== "marketing" || e.currency === "USD") return e.category;
  return isFacebookTarget(`${e.name} ${e.note}`) ? "marketing" : "promo";
}

export function entryKind(e: Pick<FinanceEntry, "origin" | "category" | "oneTime">): FinanceKind {
  if (e.origin === "salary") return "salary";
  if (e.origin === "expense" && !e.oneTime) return "mandatory";
  return e.category === "marketing" ? "target" : "other";
}

/**
 * Only an explicit «unpaid» is still owed. Salary advances and imported spending without a confirmed
 * status were paid out already, and the one-time register is spent by definition.
 */
export function isOutstanding(e: Pick<FinanceEntry, "status" | "origin" | "oneTime">): boolean {
  return e.status === "unpaid" && !e.oneTime;
}

export function financePeriod(value: unknown): string {
  const period = String(value ?? "");
  if (!/^20\d{2}-(0[1-9]|1[0-2])$/.test(period)) throw new Error("Есептік ай дұрыс емес.");
  return period;
}

/** Calendar months ending at `period`, oldest first. */
export function periodWindow(period: string, count: number): string[] {
  const [year, month] = financePeriod(period).split("-").map(Number);
  return Array.from({ length: count }, (_, index) => {
    const date = new Date(Date.UTC(year!, month! - 1 - (count - 1 - index), 1));
    return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
  });
}

export function optionalAmount(value: unknown, count = false): number | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "string" && typeof value !== "number") throw new Error("Сома дұрыс емес.");
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0 || n > 999_999_999_999 || (count && !Number.isInteger(n))) {
    throw new Error("Сома немесе сан дұрыс емес.");
  }
  return Math.round(n * 100) / 100;
}

function cleanText(value: unknown, max: number): string {
  const s = String(value ?? "").trim();
  if (s.length > max) throw new Error("Мәтін тым ұзын.");
  return s;
}

export function normalizeFinanceMetrics(input: Partial<FinanceMetrics>): FinanceMetrics {
  return {
    revenue: optionalAmount(input.revenue),
    receipts: optionalAmount(input.receipts),
    units: optionalAmount(input.units, true),
    leads: optionalAmount(input.leads, true),
    customers: optionalAmount(input.customers, true),
    retentionMonths: optionalAmount(input.retentionMonths),
    unitType: input.unitType === "order" || input.unitType === "service" ? input.unitType : "client",
    marketingAligned: input.marketingAligned === true,
    costsReviewed: input.costsReviewed === true,
    notes: cleanText(input.notes, 1200),
  };
}

export type NormalizedFinanceEntry = Omit<FinanceEntry, "id" | "origin" | "updatedAt" | "costBehavior" | "group">;

export function normalizeFinanceEntry(input: Partial<FinanceEntry>): NormalizedFinanceEntry {
  const category = String(input.category) as FinanceCategory;
  if (!Object.hasOwn(FINANCE_CATEGORIES, category)) throw new Error("Категория дұрыс емес.");
  const name = cleanText(input.name, 200), workspaceId = cleanText(input.workspaceId, 120);
  if (!name || !workspaceId) throw new Error("Жоба мен атауды толтырыңыз.");
  if (!["actual", "plan"].includes(String(input.basis))) throw new Error("Факт немесе жоспарды таңдаңыз.");
  if (!["paid", "unpaid", "unknown"].includes(String(input.status))) throw new Error("Төлем күйі дұрыс емес.");
  if (!["included", "duplicate", "review"].includes(String(input.disposition))) throw new Error("Есепке қосылу күйі дұрыс емес.");
  let amount = optionalAmount(input.amount);
  let currency: "KZT" | "USD" = "KZT", currencyAmount: number | null = null, fxRate: number | null = null;
  if (input.currency === "USD") {
    currency = "USD";
    currencyAmount = optionalAmount(input.currencyAmount);
    fxRate = optionalAmount(input.fxRate);
    if (!currencyAmount || !fxRate) throw new Error("USD сомасы мен бағамын толтырыңыз.");
    // The tenge amount is always derived, so the ledger never disagrees with its own FX inputs.
    amount = Math.round(currencyAmount * fxRate * 100) / 100;
  }
  return {
    workspaceId,
    period: financePeriod(input.period),
    name,
    category,
    amount,
    basis: input.basis!,
    status: input.status!,
    disposition: input.disposition!,
    source: cleanText(input.source, 1000),
    note: cleanText(input.note, 3000),
    relatedId: cleanText(input.relatedId, 200),
    currency,
    currencyAmount,
    fxRate,
  };
}

export function classifyFinanceCost(name: string, category = ""): FinanceCategory {
  const value = `${name} ${category}`.toLocaleLowerCase();
  if (/депозит/.test(value)) return "deposit";
  if (/налог|салық|соц.*аударым/.test(value)) return "tax";
  if (/парта|стуль|орындық|мебель|панель|жиһаз/.test(value)) return "equipment";
  // «Таргет» is only paid social advertising (Facebook / Instagram); billboards, banners, signs and print are one-time purchases.
  if (isFacebookTarget(value)) return "marketing";
  if (/жарнама|реклам|билборд|баннер|банер|роллап|брошюр|вывеск|табличк|листовк|флаер|визитк/.test(value)) return "promo";
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
const ratio = (value: number | null, divisor: number | null) =>
  value === null || divisor === null || divisor <= 0 ? null : value / divisor;

export type CategoryLine = {
  key: Exclude<FinanceCategory, "revenue">;
  name: string;
  group: CostGroup;
  amount: number | null;
  paid: number;
  plan: number | null;
  count: number;
};

export type FinanceSummary = ReturnType<typeof summarizeFinance>;

/** Receipts confirmed by bank statements for one project-month (from lib/bank.ts). */
export interface BankFacts { gross: number; refunds: number; commission: number; tax: number | null; net: number; sales: number; avgCheck: number | null; credited: number | null; sources?: string[] }
/** Where the month's revenue comes from: bank statements win over the manual form, which wins over ledger rows. */
export type RevenueSource = "bank" | "manual" | "ledger" | null;

/**
 * What the ad cabinet reports for a project-month. `reach` and `linkClickPeople` count people, so they
 * are null whenever the window is not one Meta itself deduplicated. `MetaFacts` satisfies this shape.
 */
export interface AdFacts {
  spend: number;
  spendKzt: number | null;
  impressions: number;
  reach: number | null;
  linkClicks: number;
  linkClickPeople: number | null;
  landingViews: number;
  conversations: number;
}
/** Whether the lead count on screen came from the CRM form or stood in from the ad cabinet. */
export type LeadsSource = "manual" | "ads" | null;

export function summarizeFinance(entries: FinanceEntry[], metrics: FinanceMetrics, bank: BankFacts | null = null, ads: AdFacts | null = null) {
  const included = entries.filter(e => e.disposition === "included" && e.amount !== null);
  const actual = included.filter(e => e.basis === "actual" && e.category !== "revenue");
  const planned = included.filter(e => e.basis === "plan" && e.category !== "revenue");
  const amountOf = (rows: FinanceEntry[]) => sum(rows.map(e => e.amount!));
  const cost = amountOf(actual);
  const operating = amountOf(actual.filter(e => isOperatingCost(e.category)));
  const capital = amountOf(actual.filter(e => !isOperatingCost(e.category)));
  const unpaid = amountOf(actual.filter(isOutstanding));
  const paid = sum([cost, -unpaid]);
  const marketingRows = actual.filter(e => e.category === "marketing");
  const marketing = marketingRows.length ? amountOf(marketingRows) : null;
  const taxRows = actual.filter(e => e.category === "tax");
  const tax = taxRows.length ? amountOf(taxRows) : null;
  const variable = amountOf(actual.filter(e =>
    isOperatingCost(e.category) && e.category !== "marketing"
    && (e.costBehavior === "variable" || (!e.costBehavior && e.category === "variable"))));
  const revenueRows = included.filter(e => e.category === "revenue" && e.basis === "actual");
  // Bank-confirmed net receipts (turnover − refunds − fees − stated taxes) are the revenue when statements cover
  // the month; otherwise the commercial metrics form, then ledger revenue rows.
  const revenueSource: RevenueSource = bank ? "bank" : metrics.revenue !== null ? "manual" : revenueRows.length ? "ledger" : null;
  const revenue = bank ? bank.net : metrics.revenue ?? (revenueRows.length ? amountOf(revenueRows) : null);
  const profit = revenue === null ? null : sum([revenue, -operating]);
  const plan = planned.length ? amountOf(planned) : null;

  const groups = Object.fromEntries((Object.keys(COST_GROUPS) as CostGroup[])
    .map(group => [group, amountOf(actual.filter(e => categoryGroup(e.category) === group))])) as Record<CostGroup, number>;

  const categories: CategoryLine[] = PNL_ORDER.map(key => {
    const rows = actual.filter(e => e.category === key);
    const plans = planned.filter(e => e.category === key);
    return {
      key,
      name: FINANCE_CATEGORIES[key],
      group: CATEGORY_GROUP[key],
      amount: rows.length ? amountOf(rows) : null,
      paid: amountOf(rows.filter(e => !isOutstanding(e))),
      plan: plans.length ? amountOf(plans) : null,
      count: rows.length,
    };
  }).filter(c => c.amount !== null || c.plan !== null);

  // Payroll: salary rows carry the settled amount; advance rows are the already-deducted part of the same accrual.
  const salaryRows = actual.filter(e => e.category === "payroll" && e.origin === "salary" && e.id.startsWith("salary:"));
  const advanceRows = actual.filter(e => e.category === "payroll" && e.id.startsWith("advance:"));
  const staff = salaryRows.filter(e => e.amount! > 0);
  const departments = new Map<string, { name: string; amount: number; headcount: number; paid: number; unpaid: number }>();
  for (const row of [...salaryRows, ...advanceRows]) {
    const name = row.group || "Бөлімсіз";
    const item = departments.get(name) ?? { name, amount: 0, headcount: 0, paid: 0, unpaid: 0 };
    item.amount = sum([item.amount, row.amount!]);
    if (row.id.startsWith("salary:") && row.amount! > 0) item.headcount += 1;
    if (isOutstanding(row)) item.unpaid = sum([item.unpaid, row.amount!]);
    else item.paid = sum([item.paid, row.amount!]);
    departments.set(name, item);
  }
  const payroll = {
    total: groups.payroll,
    salaries: amountOf(salaryRows),
    advances: amountOf(advanceRows),
    other: sum([groups.payroll, -amountOf(salaryRows), -amountOf(advanceRows)]),
    headcount: staff.length,
    average: staff.length ? amountOf(staff) / staff.length : null,
    // Advances were handed out before the settlement, so they count as paid.
    paid: amountOf([...salaryRows, ...advanceRows].filter(e => !isOutstanding(e))),
    unpaid: amountOf(salaryRows.filter(isOutstanding)),
    unpaidPeople: salaryRows.filter(e => isOutstanding(e) && e.amount! > 0).length,
    departments: [...departments.values()].sort((a, b) => b.amount - a.amount),
  };

  const kinds = Object.fromEntries(KIND_ORDER.map(kind => {
    const rows = actual.filter(e => entryKind(e) === kind);
    const owed = rows.filter(isOutstanding);
    return [kind, { total: amountOf(rows), paid: sum([amountOf(rows), -amountOf(owed)]), unpaid: amountOf(owed), count: rows.length, unpaidCount: owed.filter(e => e.amount! > 0).length }];
  })) as Record<FinanceKind, { total: number; paid: number; unpaid: number; count: number; unpaidCount: number }>;
  // Obligations are what has to be paid every month: salaries and mandatory payments.
  const obligationTotal = sum([kinds.salary.total, kinds.mandatory.total]);
  const obligationPaid = sum([kinds.salary.paid, kinds.mandatory.paid]);
  const obligations = { total: obligationTotal, paid: obligationPaid, unpaid: sum([obligationTotal, -obligationPaid]), share: obligationTotal > 0 ? obligationPaid / obligationTotal : null };

  const usdRows = marketingRows.filter(e => e.currency === "USD" && e.currencyAmount);
  const customers = metrics.customers, units = metrics.units;
  /**
   * The hand-entered lead count comes from the CRM and is the business's own definition, so it wins.
   * Where it is missing, the cabinet's started conversations stand in — for messaging campaigns that
   * is the first contact with a person — and `leadsSource` says which number is on screen.
   */
  const leads = metrics.leads ?? (ads?.conversations ? ads.conversations : null);
  const leadsSource: "manual" | "ads" | null = metrics.leads !== null ? "manual" : leads !== null ? "ads" : null;
  const funnel = {
    spend: marketing,
    spendUsd: usdRows.length ? sum(usdRows.map(e => e.currencyAmount!)) : null,
    leads,
    leadsSource,
    customers,
    cpl: ratio(marketing, leads),
    cac: ratio(marketing, customers),
    conversion: ratio(customers, leads),
    confirmed: metrics.marketingAligned,
    // Straight from the ad cabinet: what the money bought before the CRM sees anything.
    impressions: ads?.impressions ?? null,
    linkClicks: ads?.linkClicks ?? null,
    linkClickPeople: ads?.linkClickPeople ?? null,
    landingViews: ads?.landingViews ?? null,
    conversations: ads?.conversations ?? null,
    reach: ads?.reach ?? null,
    costPerLinkClick: ads && ads.linkClicks > 0 ? ratio(marketing, ads.linkClicks) : null,
    costPerLandingView: ads && ads.landingViews > 0 ? ratio(marketing, ads.landingViews) : null,
    costPerConversation: ads && ads.conversations > 0 ? ratio(marketing, ads.conversations) : null,
    // Of the people who clicked, how many arrived, and how many wrote.
    landingRate: ads && ads.linkClicks > 0 ? ratio(ads.landingViews, ads.linkClicks) : null,
    conversationRate: ads && ads.linkClicks > 0 ? ratio(ads.conversations, ads.linkClicks) : null,
  };

  const arpu = ratio(revenue, units);
  const variablePerUnit = ratio(variable, units);
  const contributionPerUnit = arpu === null || variablePerUnit === null ? null : arpu - variablePerUnit;
  const ltv = contributionPerUnit !== null && metrics.retentionMonths ? contributionPerUnit * metrics.retentionMonths : null;
  const romiBase = ltv ?? contributionPerUnit;
  const unit = {
    units,
    unitType: metrics.unitType,
    arpu,
    costPerUnit: ratio(operating, units),
    payrollPerUnit: ratio(groups.payroll, units),
    variablePerUnit,
    contributionPerUnit,
    profitPerUnit: ratio(profit, units),
    ltv,
    ltvCac: ltv !== null && funnel.cac ? ltv / funnel.cac : null,
    paybackMonths: funnel.cac !== null && contributionPerUnit !== null && contributionPerUnit > 0 ? funnel.cac / contributionPerUnit : null,
    breakEvenUnits: contributionPerUnit !== null && contributionPerUnit > 0 ? Math.ceil(sum([operating, -variable]) / contributionPerUnit) : null,
    romi: marketing && customers !== null && romiBase !== null ? (customers * romiBase - marketing) / marketing : null,
    romiBasis: ltv !== null ? "ltv" as const : "month" as const,
    confirmed: metrics.costsReviewed,
    // Per sale, from the statements: one Kaspi payment is one sale.
    sales: bank && bank.sales > 0 ? bank.sales : null,
    avgCheck: bank?.avgCheck ?? null,
    netPerSale: bank && bank.sales > 0 ? bank.net / bank.sales : null,
    profitPerSale: bank && bank.sales > 0 && profit !== null ? profit / bank.sales : null,
    breakEvenSales: bank && bank.sales > 0 && bank.net > 0 ? Math.ceil(operating / (bank.net / bank.sales)) : null,
  };

  return {
    cost, operating, capital, paid, unpaid, revenue, profit, tax, marketing, plan, variable,
    revenueRecorded: revenue !== null,
    revenueSource,
    manualRevenue: metrics.revenue,
    bank,
    groups,
    kinds,
    obligations,
    categories,
    payroll,
    funnel,
    unit,
    cashNet: metrics.receipts === null ? null : sum([metrics.receipts, -paid]),
    margin: profit !== null && revenue! > 0 ? profit / revenue! : null,
    payrollShare: ratio(groups.payroll, revenue),
    marketingShare: ratio(marketing, revenue),
    // Kept for existing callers: the same values as the grouped objects above.
    unitCost: unit.costPerUnit,
    unitRevenue: unit.arpu,
    unitContribution: unit.contributionPerUnit,
    cpl: funnel.cpl,
    cac: funnel.cac,
    breakEvenUnits: unit.breakEvenUnits,
    missingAmounts: entries.filter(e => e.disposition === "included" && e.amount === null).length,
    review: entries.filter(e => e.disposition === "review").length,
    duplicates: entries.filter(e => e.disposition === "duplicate").length,
    otherCount: actual.filter(e => e.category === "other").length,
  };
}

/**
 * Pools ad facts across projects. Impressions, link clicks, landing views and conversations are events,
 * so they add up; reach and unique link clickers count people whose audiences overlap, so they are left
 * unknown rather than summed into a number that would overstate them.
 */
export function consolidateAdFacts(list: Array<AdFacts | null>): AdFacts | null {
  const facts = list.filter((f): f is AdFacts => f !== null);
  if (!facts.length) return null;
  const add = (pick: (f: AdFacts) => number) => facts.reduce((a, f) => a + pick(f), 0);
  const known = facts.filter(f => f.spendKzt !== null);
  return {
    spend: Math.round(add(f => f.spend) * 100) / 100,
    spendKzt: known.length === facts.length ? known.reduce((a, f) => a + f.spendKzt!, 0) : null,
    impressions: add(f => f.impressions),
    reach: null,
    linkClicks: add(f => f.linkClicks),
    linkClickPeople: null,
    landingViews: add(f => f.landingViews),
    conversations: add(f => f.conversations),
  };
}

export function consolidateFinance(projects: Array<{ entries: FinanceEntry[]; metrics: FinanceMetrics; bank?: BankFacts | null; ads?: AdFacts | null }>) {
  const summaries = projects.map(p => summarizeFinance(p.entries, p.metrics, p.bank ?? null, p.ads ?? null));
  // The pooled total keeps the traffic numbers: clicks and conversations are events, so they add up.
  // Reach and unique clickers do not, and `consolidateAdFacts` leaves those out.
  const total = summarizeFinance(projects.flatMap(p => p.entries), EMPTY_FINANCE_METRICS, null, consolidateAdFacts(projects.map(p => p.ads ?? null)));
  const revenueComplete = summaries.length > 0 && summaries.every(s => s.revenue !== null);
  const revenue = revenueComplete ? sum(summaries.map(s => s.revenue!)) : null;
  const profit = revenueComplete ? sum(summaries.map(s => s.profit!)) : null;
  // Leads can be pooled only if every project that spends on marketing also reports its funnel.
  const spenders = summaries.filter(s => s.marketing);
  const funnelComplete = spenders.length > 0 && spenders.every(s => s.funnel.leads !== null && s.funnel.customers !== null);
  const leads = funnelComplete ? sum(summaries.map(s => s.funnel.leads ?? 0)) : null;
  const customers = funnelComplete ? sum(summaries.map(s => s.funnel.customers ?? 0)) : null;
  // Bank facts add up across projects; per-sale figures are not pooled.
  const banks = summaries.map(s => s.bank).filter((b): b is BankFacts => !!b);
  const bank: BankFacts | null = banks.length ? {
    gross: sum(banks.map(b => b.gross)), refunds: sum(banks.map(b => b.refunds)), commission: sum(banks.map(b => b.commission)),
    tax: banks.some(b => b.tax !== null) ? sum(banks.map(b => b.tax ?? 0)) : null, net: sum(banks.map(b => b.net)), sales: sum(banks.map(b => b.sales)), avgCheck: null,
    credited: banks.some(b => b.credited !== null) ? sum(banks.map(b => b.credited ?? 0)) : null,
  } : null;
  return {
    ...total,
    bank,
    revenue,
    profit,
    revenueRecorded: revenueComplete,
    revenueCoverage: summaries.filter(s => s.revenue !== null).length,
    margin: profit !== null && revenue! > 0 ? profit / revenue! : null,
    payrollShare: ratio(total.groups.payroll, revenue),
    marketingShare: ratio(total.marketing, revenue),
    funnel: {
      ...total.funnel,
      leads,
      customers,
      cpl: ratio(total.marketing, leads),
      cac: ratio(total.marketing, customers),
      conversion: ratio(customers, leads),
    },
    // Different projects count different units; pooling them would be meaningless.
    unitCost: null, unitRevenue: null, unitContribution: null, cac: null, cpl: null, breakEvenUnits: null,
    cashNet: projects.length && projects.every(p => p.metrics.receipts !== null) ? sum(summaries.map(s => s.cashNet!)) : null,
  };
}

/** A small per-month record for trend charts and month-over-month comparisons. */
export type FinanceTrendPoint = {
  period: string;
  cost: number;
  operating: number;
  capital: number;
  groups: Record<CostGroup, number>;
  categories: Partial<Record<FinanceCategory, number>>;
  revenue: number | null;
  revenueSource: RevenueSource;
  profit: number | null;
  paid: number;
  unpaid: number;
  kinds: Record<FinanceKind, number>;
  plan: number | null;
  headcount: number;
  leads: number | null;
  /** Whether that lead count came from the CRM form or stood in from the ad cabinet. */
  leadsSource: LeadsSource;
  customers: number | null;
  units: number | null;
  cac: number | null;
  cpl: number | null;
  hasData: boolean;
};

export function trendPoint(period: string, entries: FinanceEntry[], metrics: FinanceMetrics, bank: BankFacts | null = null, ads: AdFacts | null = null): FinanceTrendPoint {
  const s = summarizeFinance(entries, metrics, bank, ads);
  return {
    period,
    cost: s.cost,
    operating: s.operating,
    capital: s.capital,
    groups: s.groups,
    categories: Object.fromEntries(s.categories.filter(c => c.amount !== null).map(c => [c.key, c.amount!])),
    revenue: s.revenue,
    revenueSource: s.revenueSource,
    profit: s.profit,
    paid: s.paid,
    unpaid: s.unpaid,
    kinds: Object.fromEntries(KIND_ORDER.map(k => [k, s.kinds[k].total])) as Record<FinanceKind, number>,
    plan: s.plan,
    headcount: s.payroll.headcount,
    leads: s.funnel.leads,
    leadsSource: s.funnel.leadsSource,
    customers: metrics.customers,
    units: metrics.units,
    cac: s.funnel.cac,
    cpl: s.funnel.cpl,
    hasData: s.cost > 0 || s.revenue !== null || s.plan !== null,
  };
}

export type FinanceIssue = {
  level: "critical" | "warning" | "info";
  code: string;
  text: string;
  amount?: number;
};

/** Data-quality checklist for one project-month: what is owed and what blocks a reliable P&L and unit economics. */
export function financeIssues(summary: FinanceSummary, metrics: FinanceMetrics, opts: { payrollMonth: boolean; closed: boolean }): FinanceIssue[] {
  const issues: FinanceIssue[] = [];
  if (!opts.payrollMonth) issues.push({ level: "warning", code: "no-payroll-month", text: "Бұл ай ашылмаған: айлық пен міндетті төлемдер әлі жоқ." });
  if (summary.payroll.unpaid > 0) {
    issues.push({ level: opts.closed ? "critical" : "warning", code: "unpaid-salary", text: `${summary.payroll.unpaidPeople} адамның айлығы төленбеген`, amount: summary.payroll.unpaid });
  }
  if (summary.kinds.mandatory.unpaid > 0) {
    issues.push({ level: opts.closed ? "critical" : "warning", code: "unpaid-mandatory", text: `${summary.kinds.mandatory.unpaidCount} міндетті төлем төленбеген`, amount: summary.kinds.mandatory.unpaid });
  }
  const otherOwed = sum([summary.kinds.target.unpaid, summary.kinds.other.unpaid]);
  if (otherOwed > 0) issues.push({ level: "warning", code: "unpaid-other", text: "Реестрде «төленуі керек» деп белгіленген шығын бар", amount: otherOwed });
  if (summary.revenue === null) issues.push({ level: "critical", code: "no-revenue", text: "Табыс енгізілмеген — пайда, маржа және юнит есептелмейді." });
  if (summary.marketing && metrics.leads === null) issues.push({ level: "warning", code: "no-leads", text: "Таргет шығыны бар, бірақ лид саны енгізілмеген — CPL белгісіз." });
  if (summary.marketing && metrics.customers === null) issues.push({ level: "warning", code: "no-customers", text: "Жаңа ақылы клиенттер саны жоқ — CAC белгісіз." });
  if (!summary.marketing && metrics.leads) issues.push({ level: "warning", code: "leads-without-spend", text: "Лидтер бар, бірақ таргет шығыны тіркелмеген." });
  if (summary.revenue !== null && metrics.units === null) issues.push({ level: "warning", code: "no-units", text: "Оқушы / клиент саны жоқ — ARPU және юнит маржасы есептелмейді." });
  if (summary.review > 0) issues.push({ level: "warning", code: "review", text: `${summary.review} жазба нақтылауды күтіп тұр (жиынға кірмейді).` });
  if (summary.missingAmounts > 0) issues.push({ level: "warning", code: "missing-amount", text: `${summary.missingAmounts} жазбаның сомасы жоқ.` });
  if (summary.tax === null && summary.groups.payroll > 0) issues.push({ level: "info", code: "no-tax", text: "Салық пен аударымдар енгізілмеген — нәтиже салыққа дейін." });
  if (summary.otherCount > 0) issues.push({ level: "info", code: "other-category", text: `${summary.otherCount} жазба «Басқа шығын» санатында — жіктеу ұсынылады.` });
  return issues;
}
