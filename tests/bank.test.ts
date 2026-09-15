import assert from "node:assert/strict";
import test from "node:test";
import { assignOperation, builtinRules, dedupeKey, foldText, MANUAL_RULE, summarizeBank, type BankOperation, type BankRule, type ParsedOperation } from "../lib/bank.ts";
import { halykOperation, parseHalykPages, parseKaspiRows, parseMoney, type PdfTextItem } from "../lib/bank-parsers.ts";

const projects = [{ id: "ed", name: "EdUser" }, { id: "tl", name: "TamshyLab" }, { id: "tz", name: "Тараз Едусер" }, { id: "kz", name: "Қызылорда Едусер" }];
const rules = builtinRules(projects);
const _ = null;

function kaspiSheet(): unknown[][] {
  return [
    [_, _], [_, "Детальная информация по операциям"],
    [_, "Период:", "2026-08-01 00:00:00 - 2026-08-31 23:59:59"], [_, "ИИН/БИН", "111111111111"], [_, "Наименование", "ТОО \"TEST\""],
    [_, "Продажи с Kaspi.kz", 150000], [_, "Возвраты продаж", -20000], [_, "Услуги за продажи с Kaspi", -10950], [_, "Возврат услуг за продажи Kaspi", 2000],
    [_, _],
    [_, "Адрес торговой точки", "Дата", "Время", "Сумма", "Стоимость услуг Kaspi", "Тип операции", "Способ оплаты", "Канал оплаты", "Номер операции", "Детали покупки"],
    [_, "Астана, Туран, 34в", "02.08.2026", "10:00:00", 100000, -10000, "Покупка", "Кредит на Покупки", "Удаленная оплата", "1001", "Учеба"],
    [_, "Тараз, Төле би, 93б", "03.08.2026", "11:00:00", 50000, -950, "Покупка", "Kaspi Gold", "Kaspi QR", "1002", _],
    [_, "Астана, Туран, 34в", "04.08.2026", "12:00:00", -20000, 2000, "Возврат", "Кредит на Покупки", "Удаленная оплата", "1003", _],
  ];
}

test("Kaspi report: operations, fees and the file's own totals", () => {
  const s = parseKaspiRows(kaspiSheet());
  assert.equal(s.legalEntity, "ТОО TEST");
  assert.equal(s.legalEntityBin, "111111111111");
  assert.deepEqual([s.periodFrom, s.periodTo], ["2026-08-01", "2026-08-31"]);
  assert.equal(s.operations.length, 3);
  assert.ok(s.checks.length === 4 && s.checks.every(c => c.ok), JSON.stringify(s.checks));
  const [credit, gold, refund] = s.operations;
  assert.deepEqual([credit!.kind, credit!.amount, credit!.commission, credit!.paymentMethod, credit!.date], ["sale", 100000, 10000, "Кредит на покупки", "2026-08-02"]);
  assert.deepEqual([gold!.paymentMethod, gold!.channel, gold!.commission], ["Kaspi Gold", "Kaspi QR", 950]);
  assert.deepEqual([refund!.kind, refund!.amount, refund!.commission], ["refund", -20000, -2000]);
});

test("Kaspi report whose rows do not add up to the header is flagged", () => {
  const sheet = kaspiSheet();
  sheet[5] = [_, "Продажи с Kaspi.kz", 999999];
  const s = parseKaspiRows(sheet);
  assert.equal(s.checks.find(c => c.label === "Продажи с Kaspi.kz")?.ok, false);
});

function halykPages(): PdfTextItem[][] {
  const t = (str: string, x: number, y: number, w = 40): PdfTextItem => ({ str, x, y, w });
  return [[
    t("ИИН/БИН", 30, 718), t("222222222222", 186, 718), t("Клиент", 30, 702), t("ТОО TEST", 186, 702),
    t("Счет", 30, 686), t("KZ00TEST (KZT)", 186, 686),
    t("Входящий остаток:", 25, 596), t("1 000 000.00", 254, 596), t("Дата остатка:", 306, 596),
    t("Дата", 41, 557, 17), t("Номер документа", 84, 557, 64), t("Дебет", 178, 557, 21), t("Кредит", 250, 557, 26),
    t("Контрагент", 332, 557, 42), t("Детали платежа", 436, 557, 58), t("НДС на", 536, 566, 28),
    t("15.09.2026", 31, 535), t("77294190", 100, 535), t("155,600.00", 260, 535, 36),
    t("НАРОДНЫЙ БАНК", 306, 535), t("Референс 4116638713 Расчеты", 410, 535), t("по карточкам за 14/09/26 Без", 410, 525),
    t("НДС согласно договора", 410, 516), t("687212-28/11/24", 410, 507), t("Внешний референс:", 410, 498), t("00UBS77294190", 410, 489),
    t("10.09.2026", 31, 470), t("ONBNK81BG", 100, 470), t("270,000.00", 198, 470, 42),
    t("Референс 4111097702", 410, 470), t("Onlinebank Пополнение", 410, 461), t("эквайрингового контракта", 410, 452), t("Возврат средств за", 410, 443),
    t("03.09.2026", 31, 420), t("004622104002", 100, 420), t("150.00", 216, 420, 24), t("Референс 4097598744 Комиссия", 410, 420), t("за операцию", 410, 411), t("20.69", 560, 420, 20),
    t("Обороты:", 30, 380), t("270 150.00", 190, 386, 50), t("155 600.00", 256, 386, 44),
    t("Исходящий остаток:", 25, 350), t("885 450.00", 254, 350), t("Дата остатка:", 306, 350),
  ]];
}

test("Halyk statement: settlements, refunds and fees with the statement's totals", () => {
  const s = parseHalykPages(halykPages());
  assert.equal(s.legalEntityBin, "222222222222");
  assert.equal(s.account, "KZ00TEST");
  assert.equal(s.operations.length, 3);
  const [settlement, refund, fee] = s.operations;
  assert.deepEqual([settlement!.kind, settlement!.amount, settlement!.date, settlement!.creditedDate, settlement!.channel], ["settlement", 155600, "2026-09-14", "2026-09-15", "Эквайринг, договор 687212-28/11/24"]);
  assert.equal(settlement!.transactionNo, "00UBS77294190");
  assert.deepEqual([refund!.kind, refund!.amount], ["refund", -270000]);
  assert.deepEqual([fee!.kind, fee!.amount, fee!.commission, fee!.vat], ["commission", -150, 150, 20.69]);
  assert.ok(s.checks.every(c => c.ok), JSON.stringify(s.checks));
});

test("an own-account transfer is never a sale", () => {
  const op = halykOperation({ rowDate: "2026-09-03", docNo: "X", debit: 3000000, credit: 0, counterparty: "ТОО TEST", details: "Перевод собственных средств", vat: null, legalEntity: "ТОО TEST", legalEntityBin: "1", account: "KZ" });
  assert.equal(op.kind, "transfer");
  assert.equal(assignOperation(op, rules).assignment, "excluded");
});

test("money and text helpers", () => {
  assert.equal(parseMoney("155,600.00"), 155600);
  assert.equal(parseMoney("3 320 150.00"), 3320150);
  assert.equal(parseMoney("-1199193.03"), -1199193.03);
  assert.equal(parseMoney("-"), null);
  assert.equal(foldText("Тұран"), foldText("Туран"));
  assert.equal(foldText("Қызылорда"), "кызылорда");
});

const base = (patch: Partial<ParsedOperation> = {}): ParsedOperation => ({
  bank: "kaspi", legalEntity: "ИП TEST", legalEntityBin: "1", account: "", date: "2026-08-02", time: "", creditedDate: null,
  amount: 1000, commission: 10, tax: null, vat: null, kind: "sale", typeRaw: "Покупка", paymentMethod: "Kaspi Gold", channel: "",
  purpose: "", counterparty: "", address: "Астана, Туран, 34в", operationNo: "1", transactionNo: "", ...patch,
});

test("project rules: addresses, TamshyLab waits for review, owner rules and manual decisions win", () => {
  assert.deepEqual(assignOperation(base(), rules), { projectId: "ed", suggestedProjectId: null, assignment: "auto", ruleId: "city-астана" });
  assert.equal(assignOperation(base({ address: "г. Астана, пр. Тұран зд. 34В" }), rules).projectId, "ed");
  assert.equal(assignOperation(base({ address: "Тараз, Төле би, 93б" }), rules).projectId, "tz");
  assert.equal(assignOperation(base({ address: "Қызылорда, Абай 1" }), rules).projectId, "kz");
  assert.equal(assignOperation(base({ address: "район Нұра, улица Керей" }), rules).assignment, "review");
  const tamshy = assignOperation(base({ address: "Астана, Туран, 34в", purpose: "TamshyLab курс" }), rules);
  assert.deepEqual([tamshy.assignment, tamshy.projectId, tamshy.suggestedProjectId], ["unknown", null, "tl"]);
  const owner: BankRule = { id: "r1", field: "address", pattern: "Нұра", projectId: "tl", approved: true, priority: 1, note: "" };
  assert.equal(assignOperation(base({ address: "район Нұра, улица Керей" }), [...rules, owner]).projectId, "tl");
  const notProject: BankRule = { ...owner, id: "r2", projectId: null };
  assert.equal(assignOperation(base({ address: "район Нұра" }), [...rules, notProject]).assignment, "excluded");
  assert.equal(assignOperation({ ...base(), assignment: "manual", projectId: "tz" }, rules).projectId, "tz");
  assert.equal(assignOperation({ ...base(), assignment: "excluded", projectId: null, ruleId: MANUAL_RULE }, rules).assignment, "excluded");
});

test("the same operation in overlapping statements has one identity", () => {
  assert.equal(dedupeKey(base()), dedupeKey(base({ purpose: "другая выгрузка" })));
  assert.notEqual(dedupeKey(base()), dedupeKey(base({ operationNo: "2" })));
});

const op = (patch: Partial<BankOperation>): BankOperation => ({
  ...base(), id: Math.random().toString(), statementId: "s", projectId: "ed", suggestedProjectId: null, assignment: "auto", ruleId: null,
  reconStatus: "bank_only", comment: "", updatedAt: "", ...patch,
});

test("actual receipts: turnover − refunds − fees; tax only when stated; payment methods and legal entities", () => {
  const s = summarizeBank([
    op({ amount: 100000, commission: 10000, paymentMethod: "Кредит на покупки", legalEntity: "ТОО A" }),
    op({ amount: 50000, commission: 475, paymentMethod: "Kaspi Gold", legalEntity: "ТОО A" }),
    op({ amount: 30000, commission: 285, paymentMethod: "Kaspi Gold", legalEntity: "ИП B" }),
    op({ kind: "refund", amount: -20000, commission: -2000, paymentMethod: "Кредит на покупки", legalEntity: "ТОО A" }),
  ]);
  assert.equal(s.turnover, 180000);
  assert.equal(s.salesCount, 3);
  assert.equal(s.medianCheck, 50000);
  assert.equal(s.refunds, 20000);
  assert.equal(s.commission, 8760);
  assert.equal(s.tax, null);
  assert.equal(s.afterCommission, 180000 - 20000 - 8760);
  assert.equal(s.afterTax, s.afterCommission);
  assert.equal(s.credited, null);
  assert.equal(s.pending, s.afterCommission);
  const credit = s.byMethod.find(m => m.method === "Кредит на покупки")!;
  assert.equal(credit.rate, 0.1);
  assert.equal(s.byMethod.find(m => m.method === "Kaspi Gold")!.rate, 760 / 80000);
  const installment = s.installmentByEntity.find(e => e.entity === "ТОО A")!;
  // The installment rate is the tariff: fee on installment sales over their volume (returned fees are in the totals).
  assert.deepEqual([installment.volume, installment.commission, installment.rate], [100000, 10000, 0.1]);
  const refunds = s.byEntity.find(e => e.entity === "ТОО A")!;
  assert.deepEqual([refunds.count, refunds.refunds, refunds.refundShare], [1, 20000, 20000 / 150000]);

  const withTax = summarizeBank([op({ amount: 1000, commission: 0 }), op({ kind: "tax", amount: -100, commission: 0 })]);
  assert.equal(withTax.tax, 100);
  assert.equal(withTax.afterTax, 900);
  const halyk = summarizeBank([op({ bank: "halyk", kind: "settlement", amount: 5000, commission: 0, paymentMethod: "Карта (Halyk POS)" })]);
  assert.equal(halyk.credited, 5000);
  assert.equal(halyk.byMethod[0]!.rate, null);
});

test("cash result: net receipts from the statement minus ledger costs; capital apart", async () => {
  const { cashResult } = await import("../lib/bank.ts");
  const receipts = summarizeBank([op({ amount: 1000000, commission: 50000 }), op({ kind: "refund", amount: -100000, commission: -5000 })]);
  const r = cashResult(receipts, [
    { key: "payroll", amount: 300000 }, { key: "marketing", amount: 100000 }, { key: "promo", amount: 20000 }, { key: "rent", amount: 150000 },
    { key: "contractors", amount: 50000 }, { key: "services", amount: 30000 }, { key: "equipment", amount: 400000 }, { key: "deposit", amount: null },
  ]);
  assert.equal(r.net, 1000000 - 100000 - 45000);
  assert.deepEqual([r.advertising, r.payroll, r.rent, r.teaching, r.opex, r.capital], [120000, 300000, 150000, 50000, 30000, 400000]);
  assert.equal(r.operatingProfit, 855000 - 650000);
  assert.equal(r.margin, 205000 / 855000);
});

test("waiting operations group by address or acquiring contract, with the rule that remembers them", async () => {
  const { sourceOf } = await import("../lib/bank.ts");
  const a = sourceOf(base({ address: "район Нұра, улица Керей, Жәнібек хандар, 5" }));
  assert.deepEqual(a.rule, { field: "address", pattern: "район Нұра, улица Керей, Жәнібек хандар, 5" });
  assert.equal(sourceOf(base({ address: "район Нура, улица Керей, Жанибек хандар, 5" })).key, a.key);
  const h = sourceOf(base({ bank: "halyk", address: "", channel: "Эквайринг, договор 687212-28/11/24", kind: "settlement" }));
  assert.deepEqual([h.label, h.rule], ["Halyk эквайринг, шарт 687212-28/11/24", { field: "purpose", pattern: "687212-28/11/24" }]);
  assert.equal(sourceOf(base({ bank: "halyk", address: "", kind: "commission", counterparty: "Филиал" })).rule, null);
});

test("the city of the merchant point finds the project by default, in any spelling", async () => {
  const { detectCity, defaultCityProject, cityRuleId } = await import("../lib/bank.ts");
  const cases: [string, string | null][] = [
    ["г. Астана, пр. Тұран зд. 34В", "Астана"], ["Астана, Туран, 34в", "Астана"], ["Нур-Султан, Кабанбай батыра 11", "Астана"],
    ["г. Тараз, пр. Толе би ст-е 93Б", "Тараз"], ["Тараз, Төле би, 93б", "Тараз"],
    ["г. Кызылорда, ул. Желтоксан зд. 11Б", "Қызылорда"], ["Қызылорда, Желтоқсан, 11б", "Қызылорда"],
    ["г. Караганда, Бухар жырау 1", "Қарағанды"], ["Уральск, Достык 2", "Орал"], ["Семейный центр, Абая 5", null],
    ["район Нұра, улица Керей, Жәнібек хандар, 5", null],
  ];
  for (const [address, city] of cases) assert.equal(detectCity(address), city, address);
  assert.equal(defaultCityProject("Тараз", projects), "tz");
  assert.equal(defaultCityProject("Қызылорда", projects), "kz");
  assert.equal(defaultCityProject("Астана", projects), "ed");
  assert.equal(defaultCityProject("Шымкент", projects), null);
  const kyzylorda = assignOperation(base({ address: "г. Кызылорда, ул. Желтоксан зд. 11Б" }), rules);
  assert.deepEqual([kyzylorda.projectId, kyzylorda.assignment, kyzylorda.ruleId], ["kz", "auto", cityRuleId("Қызылорда")]);
  assert.equal(assignOperation(base({ address: "Шымкент, Тауке хана 1" }), rules).assignment, "review");
});

test("owner decisions: a city can be reassigned, a specific address beats the city, TamshyLab still waits", () => {
  const reassigned: BankRule = { id: "city-шымкент", field: "city", pattern: "Шымкент", projectId: "tz", approved: true, priority: 50, note: "" };
  assert.equal(assignOperation(base({ address: "г. Шымкент, Тауке хана 1" }), [...rules, reassigned]).projectId, "tz");
  const astanaToOther: BankRule = { id: "city-астана", field: "city", pattern: "Астана", projectId: "kz", approved: true, priority: 50, note: "" };
  assert.equal(assignOperation(base({ address: "Астана, Туран, 34в" }), [...rules, astanaToOther]).projectId, "kz");
  const address: BankRule = { id: "a1", field: "address", pattern: "Туран, 34в", projectId: "tz", approved: true, priority: 1, note: "" };
  assert.equal(assignOperation(base({ address: "Астана, Туран, 34в" }), [...rules, address]).projectId, "tz");
  const tamshy = assignOperation(base({ address: "Тараз, Төле би, 93б", purpose: "Тамшы курс" }), rules);
  assert.deepEqual([tamshy.assignment, tamshy.suggestedProjectId], ["unknown", "tl"]);
});

test("Kaspi cash sales are checked against «Продажи наличными» and are not expected from Kaspi", () => {
  const sheet = kaspiSheet();
  sheet.splice(9, 0, [_, "Продажи наличными", 46000], [_, "Возврат наличными", "-"]);
  sheet.push([_, "Қызылорда, Желтоқсан, 11б", "05.08.2026", "13:00:00", 46000, 0, "Покупка", "Наличные", "Наличные", "1004", _]);
  const s = parseKaspiRows(sheet);
  assert.ok(s.checks.every(c => c.ok), JSON.stringify(s.checks));
  assert.ok(s.checks.some(c => c.label === "Продажи наличными" && c.expected === 46000));
  const cash = s.operations.at(-1)!;
  assert.equal(cash.paymentMethod, "Қолма-қол ақша");
  const summary = summarizeBank(s.operations.map((o, i) => ({ ...o, id: String(i), statementId: "s", projectId: "kz", suggestedProjectId: null, assignment: "auto", ruleId: null, reconStatus: "bank_only", comment: "", updatedAt: "" })));
  assert.equal(summary.cash, 46000);
  assert.equal(summary.turnover, 150000 + 46000);
  assert.equal(summary.pending, 150000 - 20000 - (10950 - 2000));
});

test("a cash sale missing from the header totals is flagged", () => {
  const sheet = kaspiSheet();
  sheet.push([_, "Тараз, Төле би, 93б", "05.08.2026", "13:00:00", 46000, 0, "Покупка", "Наличные", "Наличные", "1004", _]);
  const s = parseKaspiRows(sheet);
  assert.equal(s.checks.find(c => c.label === "Продажи наличными")?.ok, false);
  assert.equal(s.checks.find(c => c.label === "Продажи с Kaspi.kz")?.ok, true);
});
