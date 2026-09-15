/**
 * Bank statements: operations from Kaspi Pay (sales detail) and Halyk (account statement), their project
 * assignment and the «actual receipts» figures. Pure functions only; storage lives in bank-database.ts.
 */

export type BankCode = "kaspi" | "halyk";
/** sale — one customer payment; settlement — a batch of card payments credited to the account; the rest are self-explanatory. */
export type BankOpKind = "sale" | "refund" | "settlement" | "commission" | "tax" | "transfer" | "other_in" | "other_out";
/** How the project was decided. Only auto and manual count in a project's figures. */
export type BankAssignment = "auto" | "manual" | "review" | "unknown" | "excluded" | "duplicate";
export type BankReconStatus = "match" | "partial" | "bank_only" | "crm_only" | "amount_diff" | "date_diff" | "refund" | "commission" | "tax" | "review" | "duplicate";
export type BankRuleField = "city" | "address" | "legalEntity" | "purpose" | "account" | "counterparty" | "comment" | "any";

export const BANK_LABELS: Record<BankCode, string> = { kaspi: "Kaspi Pay", halyk: "Halyk Bank" };
export const BANK_FORMATS: Record<BankCode, { ext: string; accept: string; hint: string }> = {
  kaspi: { ext: "xlsx", accept: ".xlsx", hint: "Kaspi Pay → «Детальная информация по операциям», .xlsx" },
  halyk: { ext: "pdf", accept: ".pdf", hint: "Halyk → «Выписка по счету», .pdf" },
};
export const KIND_LABELS: Record<BankOpKind, string> = {
  sale: "Сатылым", refund: "Қайтарым", settlement: "Карта бойынша есеп айырысу", commission: "Банк комиссиясы",
  tax: "Салық", transfer: "Өз шоттар арасында аударым", other_in: "Басқа кіріс", other_out: "Басқа шығыс",
};
export const ASSIGNMENT_LABELS: Record<BankAssignment, string> = {
  auto: "Автоматты бөлінді", manual: "Қолмен бөлінді", review: "Тексеру керек",
  unknown: "Жоба анықталмады", excluded: "Жобаға қатысы жоқ", duplicate: "Дубликат",
};
export const RECON_LABELS: Record<BankReconStatus, string> = {
  match: "Сәйкес", partial: "Ішінара сәйкес", bank_only: "Тек выпискада", crm_only: "Тек CRM-де",
  amount_diff: "Сомасы өзгеше", date_diff: "Күні өзгеше", refund: "Қайтарым", commission: "Комиссия",
  tax: "Салық", review: "Тексеру керек", duplicate: "Дубликат",
};
export const RULE_FIELD_LABELS: Record<BankRuleField, string> = {
  city: "Қала (сауда нүктесінің мекенжайынан)", address: "Сауда нүктесінің мекенжайы", legalEntity: "Заңды тұлға", purpose: "Төлем мақсаты / детальдары",
  account: "Банк шоты", counterparty: "Контрагент", comment: "Менеджер пікірі", any: "Кез келген өріс",
};

export interface BankOperation {
  id: string;
  statementId: string;
  bank: BankCode;
  legalEntity: string;
  legalEntityBin: string;
  account: string;
  /** Day of the sale (for settlements: the day the card payments were made). */
  date: string;
  time: string;
  /** Day the money reached the account, when the statement shows it. */
  creditedDate: string | null;
  /** Signed from the account's point of view: + money in, − money out (refunds are negative). */
  amount: number;
  /** Bank fee for this operation: + paid, − returned (e.g. the fee Kaspi gives back on a refund). */
  commission: number;
  /** Tax withheld, only when the statement states it. Never calculated. */
  tax: number | null;
  /** VAT included in a bank fee, when the statement states it. */
  vat: number | null;
  kind: BankOpKind;
  typeRaw: string;
  paymentMethod: string;
  channel: string;
  purpose: string;
  counterparty: string;
  address: string;
  operationNo: string;
  transactionNo: string;
  projectId: string | null;
  suggestedProjectId: string | null;
  assignment: BankAssignment;
  ruleId: string | null;
  reconStatus: BankReconStatus;
  comment: string;
  updatedAt: string;
}

/** An operation as read from a file, before it has an id, a statement and a project. */
export type ParsedOperation = Omit<BankOperation, "id" | "statementId" | "projectId" | "suggestedProjectId" | "assignment" | "ruleId" | "reconStatus" | "comment" | "updatedAt">;

export interface ParsedStatement {
  bank: BankCode;
  legalEntity: string;
  legalEntityBin: string;
  account: string;
  periodFrom: string | null;
  periodTo: string | null;
  operations: ParsedOperation[];
  /** Totals printed in the file itself, and whether the parsed operations add up to them. */
  checks: { label: string; expected: number; actual: number; ok: boolean }[];
  warnings: string[];
}

export interface BankRule {
  id: string;
  field: BankRuleField;
  pattern: string;
  /** null = «Жобаға қатысы жоқ». */
  projectId: string | null;
  /** An unapproved rule only suggests a project; the operation waits for a person («Жоба анықталмады»). */
  approved: boolean;
  priority: number;
  note: string;
  builtin?: boolean;
}

export interface BankProject { id: string; name: string }

/** Lowercase and fold Kazakh letters, so «Тұран» matches «Туран» and «Қызылорда» matches «Кызылорда». */
export function foldText(value: string): string {
  const map: Record<string, string> = { ә: "а", ғ: "г", қ: "к", ң: "н", ө: "о", ұ: "у", ү: "у", һ: "х", і: "и", ё: "е", й: "и" };
  return value.toLocaleLowerCase("ru-RU").replace(/[әғқңөұүһіёй]/g, c => map[c] ?? c).replace(/\s+/g, " ").trim();
}

/** Cities of Kazakhstan with the spellings met in bank statements (Kazakh, Russian, old names), already folded. */
export const CITIES: { name: string; variants: string[] }[] = [
  { name: "Астана", variants: ["астана", "нур-султан", "нурсултан", "акмола", "целиноград"] },
  { name: "Алматы", variants: ["алматы", "алма-ата"] },
  { name: "Шымкент", variants: ["шымкент", "чимкент"] },
  { name: "Тараз", variants: ["тараз", "джамбул", "жамбыл"] },
  { name: "Қызылорда", variants: ["кызылорда", "кзыл-орда", "кзылорда"] },
  { name: "Ақтөбе", variants: ["актобе", "актюбинск"] },
  { name: "Қарағанды", variants: ["караганды", "караганда"] },
  { name: "Павлодар", variants: ["павлодар"] },
  { name: "Өскемен", variants: ["оскемен", "усть-каменогорск"] },
  { name: "Семей", variants: ["семей", "семипалатинск"] },
  { name: "Атырау", variants: ["атырау"] },
  { name: "Ақтау", variants: ["актау"] },
  { name: "Орал", variants: ["орал", "уральск"] },
  { name: "Қостанай", variants: ["костанай", "кустанай"] },
  { name: "Петропавл", variants: ["петропавл", "петропавловск"] },
  { name: "Көкшетау", variants: ["кокшетау", "кокчетав"] },
  { name: "Талдықорған", variants: ["талдыкорган"] },
  { name: "Түркістан", variants: ["туркистан", "туркестан"] },
  { name: "Жезқазған", variants: ["жезказган"] },
  { name: "Екібастұз", variants: ["екибастуз"] },
  { name: "Қонаев", variants: ["конаев", "капшагаи"] },
];

/**
 * The city in a merchant-point address, in any spelling: «г. Тараз, пр. Толе би», «Кызылорда, Желтоқсан, 11б»,
 * «Нур-Султан …». Whole words only, so «семейный» is not Семей.
 */
export function detectCity(address: string): string | null {
  const words = foldText(address).split(/[^a-zа-я0-9-]+/).filter(Boolean);
  for (const city of CITIES) {
    if (words.some(word => city.variants.some(v => word === v || (v.length >= 6 && word.startsWith(v))))) return city.name;
  }
  return null;
}

/** By default a city belongs to the project named after it (Тараз → «Тараз Едусер»); Астана is the main project. */
export function defaultCityProject(city: string, projects: BankProject[]): string | null {
  const named = projects.find(p => detectCity(p.name) === city);
  if (named) return named.id;
  if (city !== "Астана") return null;
  return projects.find(p => !detectCity(p.name) && !/tamshy|тамшы/i.test(p.name))?.id ?? null;
}

export const cityRuleId = (city: string) => `city-${foldText(city)}`;

/**
 * Rules every installation starts with. TamshyLab payments are mixed with others, so its rule is not approved:
 * matching operations wait for review and never enter its totals by themselves. Then the city of the merchant
 * point decides the project (the owner can reassign any city).
 */
export function builtinRules(projects: BankProject[]): BankRule[] {
  const tamshy = projects.find(p => /tamshy|тамшы/i.test(foldText(p.name)))?.id ?? null;
  const rules: BankRule[] = [
    { id: "builtin-tamshy", field: "any", pattern: "тамшы", projectId: tamshy, approved: false, priority: 1000, note: "Тамшылаб ережесі бекітілмеген: тексеруге түседі", builtin: true },
    { id: "builtin-tamshy-lat", field: "any", pattern: "tamshy", projectId: tamshy, approved: false, priority: 1000, note: "Тамшылаб ережесі бекітілмеген: тексеруге түседі", builtin: true },
    ...CITIES.map(c => ({ id: cityRuleId(c.name), field: "city" as const, pattern: c.name, projectId: defaultCityProject(c.name, projects), approved: true, priority: 50, note: "Қала бойынша (автоматты)", builtin: true })),
  ];
  return rules.filter(r => r.projectId);
}

/** City decisions made by the owner replace the default mapping of the same city. */
export function withCityOverrides(rules: BankRule[]): BankRule[] {
  const owned = new Set(rules.filter(r => r.field === "city" && !r.builtin).map(r => foldText(r.pattern)));
  return rules.filter(r => !(r.field === "city" && r.builtin && owned.has(foldText(r.pattern))));
}

function ruleText(op: Pick<BankOperation, "address" | "legalEntity" | "legalEntityBin" | "purpose" | "account" | "counterparty" | "comment" | "paymentMethod" | "channel">, field: BankRuleField): string {
  switch (field) {
    case "city": return detectCity(op.address) ?? "";
    case "address": return op.address;
    case "legalEntity": return `${op.legalEntity} ${op.legalEntityBin}`;
    case "purpose": return op.purpose;
    case "account": return op.account;
    case "counterparty": return op.counterparty;
    case "comment": return op.comment;
    default: return [op.address, op.legalEntity, op.legalEntityBin, op.purpose, op.account, op.counterparty, op.comment, op.paymentMethod, op.channel].join(" ");
  }
}

export function ruleMatches(rule: Pick<BankRule, "field" | "pattern">, op: Parameters<typeof ruleText>[0]): boolean {
  const pattern = foldText(rule.pattern);
  if (!pattern) return false;
  const text = foldText(ruleText(op, rule.field));
  return rule.field === "city" ? text === pattern : text.includes(pattern);
}

export type AssignmentResult = Pick<BankOperation, "projectId" | "suggestedProjectId" | "assignment" | "ruleId">;

/**
 * Decides the project of an operation. Manual decisions and duplicates are never overridden; own transfers belong
 * to no project. Order: specific owner rules (an address, a contract…), then the TamshyLab caution, then the
 * city of the merchant point. Within a stage the highest priority wins.
 */
export const MANUAL_RULE = "manual";
const stage = (r: BankRule) => r.field === "city" ? 2 : r.builtin ? 1 : 0;
export function assignOperation(op: ParsedOperation & Partial<Pick<BankOperation, "assignment" | "projectId" | "comment" | "ruleId">>, rules: BankRule[]): AssignmentResult {
  // A decision by a person (a project, or «not a project» marked with MANUAL_RULE) and duplicates stay as they are.
  if (op.assignment === "manual" || op.assignment === "duplicate" || op.ruleId === MANUAL_RULE) {
    return { projectId: op.projectId ?? null, suggestedProjectId: null, assignment: op.assignment!, ruleId: op.ruleId ?? null };
  }
  if (op.kind === "transfer") return { projectId: null, suggestedProjectId: null, assignment: "excluded", ruleId: null };
  const target = { comment: "", ...op };
  const ordered = withCityOverrides(rules).sort((a, b) => stage(a) - stage(b) || b.priority - a.priority);
  const rule = ordered.find(r => ruleMatches(r, target));
  if (!rule) return { projectId: null, suggestedProjectId: null, assignment: "review", ruleId: null };
  if (!rule.approved) return { projectId: null, suggestedProjectId: rule.projectId, assignment: "unknown", ruleId: rule.id };
  return rule.projectId
    ? { projectId: rule.projectId, suggestedProjectId: null, assignment: "auto", ruleId: rule.id }
    : { projectId: null, suggestedProjectId: null, assignment: "excluded", ruleId: rule.id };
}

/** Per-operation reconciliation status while no CRM payments are linked. */
export function reconStatusOf(op: Pick<BankOperation, "kind" | "assignment">): BankReconStatus {
  if (op.assignment === "duplicate") return "duplicate";
  if (op.assignment === "review" || op.assignment === "unknown") return "review";
  if (op.kind === "refund") return "refund";
  if (op.kind === "commission") return "commission";
  if (op.kind === "tax") return "tax";
  return "bank_only";
}

export function counts(op: Pick<BankOperation, "assignment">): boolean {
  return op.assignment === "auto" || op.assignment === "manual";
}
export function needsAssignment(op: Pick<BankOperation, "assignment">): boolean {
  return op.assignment === "review" || op.assignment === "unknown";
}

/** Stable identity of an operation across overlapping statements. */
export function dedupeKey(op: Pick<ParsedOperation, "bank" | "legalEntityBin" | "account" | "operationNo" | "transactionNo" | "date" | "amount" | "kind">): string {
  const id = op.operationNo || op.transactionNo;
  return [op.bank, op.legalEntityBin || op.account, id, op.date, op.amount.toFixed(2), op.kind].join("|");
}

/** Canonical payment method names for the report. */
export function paymentMethodOf(raw: string, kind: BankOpKind): string {
  const value = foldText(raw);
  if (kind === "settlement") return "Карта (Halyk POS)";
  if (/кредит на покупк/.test(value)) return "Кредит на покупки";
  if (/kaspi red/.test(value)) return "Kaspi Red";
  if (/рассроч/.test(value)) return "Рассрочка";
  if (/kaspi gold/.test(value)) return "Kaspi Gold";
  if (/kaspi qr/.test(value)) return "Kaspi QR";
  if (/kaspi pay/.test(value)) return "Kaspi Pay";
  if (/налич/.test(value)) return CASH_METHOD;
  if (/перевод|аударым/.test(value)) return "Шотқа аударым";
  return value ? raw.trim() : "Анықталмаған";
}
export const CASH_METHOD = "Қолма-қол ақша";
export function isInstallment(method: string): boolean {
  return /кредит на покупки|kaspi red|рассрочка/i.test(method);
}

export const round2 = (value: number) => Math.round(value * 100) / 100;
function median(values: number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b), mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}
const share = (part: number, whole: number) => whole > 0 ? part / whole : null;

export interface BankMethodRow { method: string; count: number; turnover: number; share: number | null; commission: number; commissionShare: number | null; avg: number | null; rate: number | null }
export interface BankEntityRow { entity: string; volume: number; commission: number; rate: number | null; count: number; refunds: number; refundShare: number | null }

export interface BankSummary {
  operations: number;
  /** Individual customer payments (Kaspi detail). */
  grossSales: number;
  salesCount: number;
  /** Card batches credited to an account (Halyk), already net of the acquirer's fee. */
  settlements: number;
  settlementCount: number;
  turnover: number;
  avgCheck: number | null;
  medianCheck: number | null;
  refunds: number;
  refundCount: number;
  commission: number;
  vatInFees: number;
  /** null when no statement states a tax — never estimated. */
  tax: number | null;
  afterCommission: number;
  afterTax: number;
  /** Confirmed credits on an account statement; null when no account statement covers the scope. */
  credited: number | null;
  /** Expected from Kaspi sales (sales − refunds − fees), not yet confirmed by an account statement. Cash is not included. */
  pending: number;
  /** Sales paid in cash (recorded in Kaspi Pay): part of the turnover, never credited by a bank. */
  cash: number;
  refundShare: number | null;
  commissionShare: number | null;
  byMethod: BankMethodRow[];
  byEntity: BankEntityRow[];
  installmentByEntity: BankEntityRow[];
}

/** Actual receipts from the operations that count (assigned to a project, or all assigned ones for a total). */
export function summarizeBank(ops: BankOperation[]): BankSummary {
  const sales = ops.filter(o => o.kind === "sale");
  const refundsOps = ops.filter(o => o.kind === "refund");
  const settlementOps = ops.filter(o => o.kind === "settlement");
  const grossSales = round2(sales.reduce((a, o) => a + o.amount, 0));
  const settlements = round2(settlementOps.reduce((a, o) => a + o.amount, 0));
  const turnover = round2(grossSales + settlements);
  const refunds = round2(refundsOps.reduce((a, o) => a + Math.abs(o.amount), 0));
  const commission = round2(ops.reduce((a, o) => a + (o.commission || 0), 0));
  const taxOps = ops.filter(o => o.kind === "tax" || (o.tax ?? 0) > 0);
  const tax = taxOps.length ? round2(taxOps.reduce((a, o) => a + (o.kind === "tax" ? Math.abs(o.amount) : o.tax ?? 0), 0)) : null;
  const afterCommission = round2(turnover - refunds - commission);
  // Kaspi pays out card and QR sales; cash recorded in Kaspi Pay stays in the till.
  const kaspi = ops.filter(o => o.bank === "kaspi" && o.paymentMethod !== CASH_METHOD);
  const pending = round2(kaspi.filter(o => o.kind === "sale").reduce((a, o) => a + o.amount, 0)
    - kaspi.filter(o => o.kind === "refund").reduce((a, o) => a + Math.abs(o.amount), 0)
    - kaspi.reduce((a, o) => a + (o.commission || 0), 0));

  const methods = new Map<string, { count: number; turnover: number; commission: number }>();
  for (const o of [...sales, ...settlementOps]) {
    const m = methods.get(o.paymentMethod) ?? { count: 0, turnover: 0, commission: 0 };
    m.count += 1; m.turnover += o.amount; m.commission += o.commission || 0;
    methods.set(o.paymentMethod, m);
  }
  const salesCommission = [...methods.values()].reduce((a, m) => a + m.commission, 0);
  const byMethod = [...methods.entries()].map(([method, m]) => ({
    method, count: m.count, turnover: round2(m.turnover), share: share(m.turnover, turnover), commission: round2(m.commission),
    commissionShare: share(m.commission, salesCommission), avg: m.count ? m.turnover / m.count : null,
    // A Halyk batch is already net of the acquirer's fee, so its rate is unknown rather than zero.
    rate: method === "Карта (Halyk POS)" ? null : share(m.commission, m.turnover),
  })).sort((a, b) => b.turnover - a.turnover);

  const entityRows = (filter: (o: BankOperation) => boolean) => {
    const map = new Map<string, { volume: number; commission: number; count: number; refunds: number }>();
    for (const o of ops) {
      if (!filter(o)) continue;
      const key = o.legalEntity || o.legalEntityBin || "Белгісіз";
      const e = map.get(key) ?? { volume: 0, commission: 0, count: 0, refunds: 0 };
      if (o.kind === "sale" || o.kind === "settlement") { e.volume += o.amount; e.commission += o.commission || 0; }
      if (o.kind === "refund") { e.count += 1; e.refunds += Math.abs(o.amount); }
      map.set(key, e);
    }
    return [...map.entries()].map(([entity, e]) => ({
      entity, volume: round2(e.volume), commission: round2(e.commission), rate: share(e.commission, e.volume),
      count: e.count, refunds: round2(e.refunds), refundShare: share(e.refunds, e.volume),
    })).sort((a, b) => b.volume - a.volume);
  };

  return {
    operations: ops.length,
    grossSales, salesCount: sales.length, settlements, settlementCount: settlementOps.length, turnover,
    avgCheck: sales.length ? grossSales / sales.length : null,
    medianCheck: median(sales.map(o => o.amount)),
    refunds, refundCount: refundsOps.length, commission,
    vatInFees: round2(ops.reduce((a, o) => a + (o.vat ?? 0), 0)),
    tax, afterCommission, afterTax: round2(afterCommission - (tax ?? 0)),
    credited: settlementOps.length ? settlements : null,
    pending: Math.max(0, pending),
    cash: round2(sales.filter(o => o.paymentMethod === CASH_METHOD).reduce((a, o) => a + o.amount, 0)),
    refundShare: share(refunds, turnover), commissionShare: share(commission, turnover),
    byMethod,
    byEntity: entityRows(() => true),
    installmentByEntity: entityRows(o => isInstallment(o.paymentMethod) && (o.kind === "sale" || o.kind === "refund")),
  };
}

export const bankPeriod = (date: string) => date.slice(0, 7);

/** Where a group of operations comes from, for the reports: cities, or Halyk POS contracts when there is no address. */
export function sourcesOf(ops: Pick<BankOperation, "address" | "channel">[]): string[] {
  return [...new Set(ops.map(o => detectCity(o.address) ?? (o.channel.match(/договор\s+(\S+)/)?.[1] ? "Halyk POS" : o.address ? "мекенжай" : "")).filter(Boolean))];
}

/** The figures the finance reports take from a project-month's statements. */
export function bankFacts(s: BankSummary, sources: string[] = []): { gross: number; refunds: number; commission: number; tax: number | null; net: number; sales: number; avgCheck: number | null; credited: number | null; sources: string[] } {
  return { gross: s.turnover, refunds: s.refunds, commission: s.commission, tax: s.tax, net: s.afterTax, sales: s.salesCount, avgCheck: s.avgCheck, credited: s.credited, sources };
}

/** Ledger costs grouped as in the owner's cash formula. */
export interface CashCosts { advertising: number; payroll: number; rent: number; teaching: number; opex: number; capital: number }
export interface CashResult extends CashCosts { gross: number; refunds: number; commission: number; tax: number | null; net: number; operatingProfit: number; margin: number | null }

/**
 * Валовой оборот − возвраты − комиссии − налоги (from the statements) = чистые поступления;
 * − реклама − ФОТ − аренда − себестоимость обучения − операционные расходы (from the ledger) = операционная прибыль.
 * Equipment and deposits are cash out but not operating, so they are shown apart.
 */
export function cashResult(bank: BankSummary, categories: { key: string; amount: number | null }[]): CashResult {
  const amount = (...keys: string[]) => round2(categories.filter(c => keys.includes(c.key)).reduce((a, c) => a + (c.amount ?? 0), 0));
  const costs: CashCosts = {
    advertising: amount("marketing", "promo"),
    payroll: amount("payroll"),
    rent: amount("rent"),
    teaching: amount("contractors", "variable"),
    opex: amount("services", "office", "travel", "events", "tax", "other"),
    capital: amount("equipment", "deposit"),
  };
  const net = bank.afterTax;
  const operatingProfit = round2(net - costs.advertising - costs.payroll - costs.rent - costs.teaching - costs.opex);
  return { gross: bank.turnover, refunds: bank.refunds, commission: bank.commission, tax: bank.tax, net, ...costs, operatingProfit, margin: net > 0 ? operatingProfit / net : null };
}

/** Where an operation comes from, for grouping the ones waiting for a project and remembering the decision as a rule. */
export function sourceOf(op: Pick<BankOperation, "bank" | "address" | "channel" | "counterparty" | "legalEntity" | "kind">): { key: string; label: string; rule: Pick<BankRule, "field" | "pattern"> | null } {
  if (op.address) {
    const city = detectCity(op.address);
    return { key: `address|${foldText(op.address)}`, label: city ? `${city} · ${op.address}` : `Қала анықталмады · ${op.address}`, rule: { field: "address", pattern: op.address } };
  }
  const contract = op.channel.match(/договор\s+(\S+)/)?.[1];
  if (contract) return { key: `contract|${contract}`, label: `Halyk эквайринг, шарт ${contract}`, rule: { field: "purpose", pattern: contract } };
  if (op.kind === "commission" || op.kind === "tax") return { key: `kind|${op.bank}|${op.kind}|${op.legalEntity}`, label: `${KIND_LABELS[op.kind]} · ${BANK_LABELS[op.bank]}`, rule: null };
  const counterparty = op.counterparty.replace(/\s*БИН\s*\d+.*$/i, "").trim();
  return counterparty
    ? { key: `counterparty|${foldText(counterparty)}`, label: counterparty, rule: { field: "counterparty", pattern: counterparty.slice(0, 80) } }
    : { key: `other|${op.bank}|${op.kind}`, label: `${KIND_LABELS[op.kind]} · ${BANK_LABELS[op.bank]}`, rule: null };
}
