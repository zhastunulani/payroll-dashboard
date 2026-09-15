import { paymentMethodOf, round2, type BankOpKind, type ParsedOperation, type ParsedStatement } from "./bank.ts";

/** "155,600.00", "3 320 150.00", "-1199193.03", 45990 → number. */
export function parseMoney(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string") return null;
  const text = value.replace(/[\s\u00a0]/g, "").replace(/,(?=\d{3}(\D|$))/g, "").replace(",", ".");
  if (!/^-?\d+(\.\d+)?$/.test(text)) return null;
  return Number(text);
}
const MONEY_PATTERN = /^-?\d{1,3}([,\s\u00a0]\d{3})*\.\d{2}$|^-?\d+\.\d{2}$/;

/** "15.09.2026" / "15-09-2026" / Date → "2026-09-15". */
export function parseDate(value: unknown): string | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().slice(0, 10);
  const match = typeof value === "string" ? value.trim().match(/^(\d{2})[.\-/](\d{2})[.\-/](\d{4})/) : null;
  return match ? `${match[3]}-${match[2]}-${match[1]}` : null;
}
const text = (value: unknown) => value === null || value === undefined ? "" : String(value).trim();
const check = (label: string, expected: number | null, actual: number) =>
  expected === null ? [] : [{ label, expected: round2(expected), actual: round2(actual), ok: Math.abs(expected - actual) < 0.015 }];

/* ---------------- Kaspi Pay: «Детальная информация по операциям» (.xlsx) ---------------- */

/** Parses the rows of the Kaspi Pay operations report (first sheet, as read by read-excel-file). */
export function parseKaspiRows(rows: unknown[][]): ParsedStatement {
  const label = (row: unknown[]) => text(row.find(cell => text(cell)));
  const valueAfter = (name: RegExp) => {
    const row = rows.find(r => name.test(label(r)));
    if (!row) return null;
    const cells = row.filter(cell => text(cell));
    return cells[1] ?? null;
  };
  const headerIndex = rows.findIndex(row => row.some(cell => /адрес торговой точки/i.test(text(cell))));
  if (headerIndex < 0) throw new Error("Kaspi файлында «Адрес торговой точки» бағаны табылмады. Kaspi Pay → «Детальная информация по операциям» (.xlsx) файлын жүктеңіз.");
  const header = rows[headerIndex]!.map(cell => text(cell).toLocaleLowerCase("ru-RU"));
  const col = (name: string) => header.findIndex(h => h === name || h.startsWith(name));
  const c = {
    address: col("адрес торговой точки"), date: col("дата"), time: col("время"), amount: col("сумма"),
    fee: col("стоимость услуг"), type: col("тип операции"), method: col("способ оплаты"), channel: col("канал оплаты"),
    number: col("номер операции"), details: col("детали покупки"), source: col("источник оплаты"),
  };
  if (c.date < 0 || c.amount < 0) throw new Error("Kaspi файлында «Дата» немесе «Сумма» бағаны жоқ.");

  const legalEntity = text(valueAfter(/^наименование/i)).replace(/^ТОО\s*"(.+)"$/i, "ТОО $1");
  const legalEntityBin = text(valueAfter(/^иин\/бин/i));
  const period = text(valueAfter(/^период/i)).match(/(\d{4}-\d{2}-\d{2}).*?(\d{4}-\d{2}-\d{2})/);
  const operations: ParsedOperation[] = [];
  const warnings: string[] = [];
  for (const [offset, row] of rows.slice(headerIndex + 1).entries()) {
    if (!row.some(cell => text(cell))) continue;
    const date = parseDate(row[c.date]);
    const amount = parseMoney(row[c.amount]);
    if (!date || amount === null) {
      warnings.push(`${headerIndex + offset + 2}-жол оқылмады: күні немесе сомасы жоқ.`);
      continue;
    }
    const typeRaw = text(row[c.type]);
    const kind: BankOpKind = /возврат/i.test(typeRaw) ? "refund" : /покупк|оплат/i.test(typeRaw) ? "sale" : amount >= 0 ? "other_in" : "other_out";
    const methodRaw = c.method >= 0 ? text(row[c.method]) : "";
    operations.push({
      bank: "kaspi", legalEntity, legalEntityBin, account: "",
      date, time: c.time >= 0 ? text(row[c.time]) : "", creditedDate: null,
      amount, commission: round2(-(parseMoney(row[c.fee]) ?? 0)), tax: null, vat: null,
      kind, typeRaw, paymentMethod: paymentMethodOf(methodRaw, kind), channel: c.channel >= 0 ? text(row[c.channel]) : "",
      purpose: [c.details, c.source].filter(i => i >= 0).map(i => text(row[i])).filter((v, i, a) => v && a.indexOf(v) === i).join(" · "),
      counterparty: "", address: c.address >= 0 ? text(row[c.address]) : "",
      operationNo: c.number >= 0 ? text(row[c.number]) : "", transactionNo: "",
    });
  }
  // Kaspi reports cash and other-bank POS sales on their own header lines, apart from «Продажи с Kaspi.kz».
  const channelOf = (o: ParsedOperation) => isCashSale(o) ? "cash" : /pos другого банка/i.test(`${o.channel} ${o.typeRaw}`) ? "pos" : "kaspi";
  const sum = (kind: BankOpKind, pick: (o: ParsedOperation) => number, channel = "kaspi") => operations.filter(o => o.kind === kind && channelOf(o) === channel).reduce((a, o) => a + pick(o), 0);
  const has = (kind: BankOpKind, channel: string) => operations.some(o => o.kind === kind && channelOf(o) === channel);
  const total = (name: RegExp) => parseMoney(valueAfter(name));
  // A «-» in the header means zero; it only matters when such operations exist.
  const optional = (name: RegExp, kind: BankOpKind, channel: string) => total(name) ?? (has(kind, channel) ? 0 : null);
  const dates = operations.map(o => o.date).sort();
  return {
    bank: "kaspi", legalEntity, legalEntityBin, account: "",
    periodFrom: period?.[1] ?? dates[0] ?? null, periodTo: period?.[2] ?? dates.at(-1) ?? null,
    operations,
    checks: [
      ...check("Продажи с Kaspi.kz", total(/^продажи с kaspi/i), sum("sale", o => o.amount)),
      ...check("Возвраты продаж", total(/^возвраты продаж/i), sum("refund", o => o.amount)),
      ...check("Услуги за продажи с Kaspi", total(/^услуги за продажи/i), -sum("sale", o => o.commission)),
      ...check("Возврат услуг за продажи Kaspi", total(/^возврат услуг/i), -sum("refund", o => o.commission)),
      ...check("Продажи наличными", optional(/^продажи наличными/i, "sale", "cash"), sum("sale", o => o.amount, "cash")),
      ...check("Возврат наличными", optional(/^возврат наличными/i, "refund", "cash") === null ? null : -Math.abs(optional(/^возврат наличными/i, "refund", "cash")!), sum("refund", o => o.amount, "cash")),
      ...check("Продажи POS другого банка", optional(/^продажи pos/i, "sale", "pos"), sum("sale", o => o.amount, "pos")),
    ],
    warnings,
  };
}

/** A sale paid in cash and only recorded in Kaspi Pay: revenue, but never credited by Kaspi. */
export function isCashSale(o: Pick<ParsedOperation, "paymentMethod" | "channel">): boolean {
  return /налич|қолма-қол/i.test(`${o.paymentMethod} ${o.channel}`);
}

/* ---------------- Halyk: «Выписка по счету» (.pdf) ---------------- */

export interface PdfTextItem { str: string; x: number; y: number; w: number }

/** Parses the positioned text of a Halyk account statement (one array of items per page, y grows upwards). */
export function parseHalykPages(pages: PdfTextItem[][]): ParsedStatement {
  const all = pages.flat();
  const find = (pattern: RegExp) => all.find(i => pattern.test(i.str.trim()));
  const sameLine = (anchor: PdfTextItem | undefined, minX: number) => anchor
    ? pages.find(p => p.includes(anchor))!.filter(i => Math.abs(i.y - anchor.y) <= 2 && i.x >= minX && i !== anchor).sort((a, b) => a.x - b.x).map(i => i.str.trim()).join(" ")
    : "";
  const legalEntityBin = sameLine(find(/^ИИН\/БИН$/), 120).match(/\d{12}/)?.[0] ?? "";
  const legalEntity = sameLine(find(/^Клиент$/), 120);
  const account = sameLine(find(/^Счет$/), 120).replace(/\s*\(KZT\)\s*$/, "").trim();

  // Column positions from the table header on the first page; later pages reuse them.
  const head = (pattern: RegExp) => all.find(i => pattern.test(i.str.trim()));
  const h = {
    date: head(/^Дата$/), doc: head(/^Номер документа$/), debit: head(/^Дебет$/), credit: head(/^Кредит$/),
    counterparty: head(/^Контрагент$/), details: head(/^Детали платежа$/), vat: head(/^НДС на$/),
  };
  if (!h.date || !h.debit || !h.credit || !h.details) throw new Error("Halyk выпискасының кестесі табылмады. Halyk → «Выписка по счету» PDF файлын жүктеңіз.");
  const xDateMax = (h.date.x + (h.doc?.x ?? h.date.x + 45)) / 2;
  const xCounterparty = h.credit.x + 40;
  const xDetails = ((h.counterparty?.x ?? h.details.x - 100) + h.details.x) / 2 + 10;
  const xVat = (h.vat?.x ?? h.details.x + 100) - 12;

  const operations: ParsedOperation[] = [];
  const warnings: string[] = [];
  let debitTotal: number | null = null, creditTotal: number | null = null;
  const opening = parseMoney(sameLine(find(/^Входящий остаток:?$/), 150).split(" Дата")[0]!);
  const closing = parseMoney(sameLine(find(/^Исходящий остаток:?$/), 150).split(" Дата")[0]!);

  for (const page of pages) {
    const stop = page.find(i => /^Обороты:?$/.test(i.str.trim()));
    if (stop) {
      // Footer: «Обороты: Дебет … Кредит …» — two amounts near the footer line.
      const amounts = page.filter(i => i.y <= stop.y + 14 && i.y >= stop.y - 14 && MONEY_PATTERN.test(i.str.trim())).sort((a, b) => a.x - b.x);
      if (amounts.length >= 2) { debitTotal = parseMoney(amounts[0]!.str); creditTotal = parseMoney(amounts[1]!.str); }
    }
    const tableTop = page.includes(h.date) ? h.date.y - 4 : Infinity;
    const anchors = page
      .filter(i => i.x < xDateMax && /^\d{2}\.\d{2}\.\d{4}$/.test(i.str.trim()) && i.y < tableTop && (!stop || i.y > stop.y + 2))
      .sort((a, b) => b.y - a.y);
    anchors.forEach((anchor, index) => {
      const bottom = anchors[index + 1]?.y ?? (stop ? stop.y + 8 : -Infinity);
      const cells = page.filter(i => i.y <= anchor.y + 3 && i.y > bottom + 3 && i !== anchor && i.str.trim());
      const byY = (list: PdfTextItem[]) => list.sort((a, b) => b.y - a.y || a.x - b.x).map(i => i.str.trim()).join(" ").replace(/\s+/g, " ").trim();
      const money = cells.filter(i => i.x < xCounterparty - 5 && i.x >= xDateMax && MONEY_PATTERN.test(i.str.trim()));
      const debit = money.find(i => i.x + i.w < h.credit!.x - 2);
      const credit = money.find(i => i.x + i.w >= h.credit!.x - 2);
      const docNo = byY(cells.filter(i => i.x >= xDateMax && i.x < h.debit!.x - 10 && !MONEY_PATTERN.test(i.str.trim())));
      const counterparty = byY(cells.filter(i => i.x >= xCounterparty - 5 && i.x < xDetails));
      const details = byY(cells.filter(i => i.x >= xDetails && i.x < xVat));
      const vatItem = cells.find(i => i.x >= xVat && MONEY_PATTERN.test(i.str.trim()));
      const rowDate = parseDate(anchor.str)!;
      const debitAmount = debit ? parseMoney(debit.str) ?? 0 : 0;
      const creditAmount = credit ? parseMoney(credit.str) ?? 0 : 0;
      if (!debitAmount && !creditAmount) { warnings.push(`${anchor.str}: сомасы оқылмаған жол өткізілді.`); return; }
      operations.push(halykOperation({ rowDate, docNo, debit: debitAmount, credit: creditAmount, counterparty, details, vat: vatItem ? parseMoney(vatItem.str) : null, legalEntity, legalEntityBin, account }));
    });
  }

  const debits = operations.reduce((a, o) => a + (o.amount < 0 ? -o.amount : 0), 0);
  const credits = operations.reduce((a, o) => a + (o.amount > 0 ? o.amount : 0), 0);
  const dates = operations.map(o => o.creditedDate ?? o.date).sort();
  return {
    bank: "halyk", legalEntity, legalEntityBin, account,
    periodFrom: dates[0] ?? null, periodTo: dates.at(-1) ?? null,
    operations,
    checks: [
      ...check("Обороты: Дебет", debitTotal, debits),
      ...check("Обороты: Кредит", creditTotal, credits),
      ...(opening !== null && closing !== null ? check("Входящий остаток + кредит − дебет = исходящий", closing, opening + credits - debits) : []),
    ],
    warnings,
  };
}

/** One Halyk row → operation, with its kind recognised from the payment details. */
export function halykOperation(row: { rowDate: string; docNo: string; debit: number; credit: number; counterparty: string; details: string; vat: number | null; legalEntity: string; legalEntityBin: string; account: string }): ParsedOperation {
  const details = row.details;
  let kind: BankOpKind;
  if (/перевод собственных средств|между своими счетами/i.test(details)) kind = "transfer";
  else if (row.credit && /расчеты по карточкам/i.test(details)) kind = "settlement";
  else if (row.debit && /возврат средств|пополнение эквайрингового контракта/i.test(details)) kind = "refund";
  else if (row.debit && /комисси/i.test(details)) kind = "commission";
  else if (row.debit && /налог|кпн|ипн|социальн|пенсионн/i.test(details)) kind = "tax";
  else kind = row.credit ? "other_in" : "other_out";
  const amount = row.credit ? row.credit : -row.debit;
  // «Расчеты по карточкам за 14/09/26» — the card payments were made on that day and credited on the row's date.
  const salesDay = details.match(/за (\d{2})\/(\d{2})\/(\d{2})/);
  const contract = details.match(/договора\s+(\S+)/i)?.[1] ?? "";
  return {
    bank: "halyk", legalEntity: row.legalEntity, legalEntityBin: row.legalEntityBin, account: row.account,
    date: kind === "settlement" && salesDay ? `20${salesDay[3]}-${salesDay[2]}-${salesDay[1]}` : row.rowDate,
    time: "", creditedDate: kind === "settlement" || row.credit ? row.rowDate : null,
    amount: round2(amount),
    commission: kind === "commission" ? round2(row.debit) : 0,
    tax: kind === "tax" ? round2(row.debit) : null,
    vat: row.vat,
    kind, typeRaw: row.credit ? "Кредит" : "Дебет",
    paymentMethod: paymentMethodOf("", kind),
    channel: contract ? `Эквайринг, договор ${contract}` : "",
    purpose: details, counterparty: row.counterparty, address: "",
    operationNo: details.match(/Референс\s+(\d+)/)?.[1] ?? row.docNo,
    transactionNo: details.match(/Внешний референс:\s*(\S+)/)?.[1] ?? row.docNo,
  };
}
