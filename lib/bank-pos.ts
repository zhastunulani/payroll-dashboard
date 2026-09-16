import { paymentMethodOf, round2, type BankOpKind, type ParsedOperation, type ParsedStatement } from "./bank.ts";
import { parseDate, parseMoney, type PdfTextItem } from "./bank-parsers.ts";

/**
 * Halyk «Выписка по Pos»: a landscape statement where every transaction is a column and every field a row.
 * It is the per-sale detail behind the daily «Расчеты по карточкам» batches of the account statement:
 * amount, bank fee, credited date, merchant point address, contract and terminal.
 */
const POS_LABELS = [
  "Дата зачисления", "Дата и время транзакции", "Юридическое наименование", "Торговое наименование",
  "Aдрес торговой точки", "№ терминала", "Номер контракта", "Тип операции", "Сумма операции",
  "Сумма к зачислению", "Комиссия банка", "Код авторизации", "RRN/SRN операции", "№ карты",
  "Платежная система", "Способ оплаты", "Наименование платежа",
] as const;
type PosLabel = (typeof POS_LABELS)[number];
export type PosRow = Partial<Record<PosLabel, string>>;
type Band = { label: PosLabel; from: number; to: number };

const norm = (value: string) => value.replace(/\s+/g, " ").trim().toLocaleLowerCase("ru-RU");
const DATE = /^\d{2}\.\d{2}\.\d{4}$/;

/** Groups items into visual lines (same y within a tolerance). */
function textLines(items: PdfTextItem[], tolerance = 4) {
  const out: { y: number; items: PdfTextItem[] }[] = [];
  for (const item of [...items].sort((a, b) => a.y - b.y)) {
    const last = out.at(-1);
    if (last && Math.abs(last.y - item.y) <= tolerance) { last.items.push(item); last.y = item.y; }
    else out.push({ y: item.y, items: [item] });
  }
  return out.map(line => ({ y: line.y, items: line.items, text: line.items.slice().sort((a, b) => a.x - b.x).map(i => i.str.trim()).join(" ") }));
}

/** Field labels are recognised by their text (one or two lines), never by a fixed position. */
function posLabels(items: PdfTextItem[]) {
  const candidates = items.filter(i => i.str.trim().length > 1 && POS_LABELS.some(label => norm(label).includes(norm(i.str))));
  const lines = textLines(candidates, 3);
  const found: { label: PosLabel; y: number; maxX: number }[] = [];
  for (let i = 0; i < lines.length; i += 1) {
    for (let take = Math.min(3, lines.length - i); take >= 1; take -= 1) {
      const chunk = lines.slice(i, i + take);
      const texts = chunk.map(c => c.text);
      const label = POS_LABELS.find(l => norm(l) === norm(texts.join(" ")) || norm(l) === norm([...texts].reverse().join(" ")));
      if (label && !found.some(f => f.label === label)) {
        found.push({ label, y: chunk.reduce((a, c) => a + c.y, 0) / chunk.length, maxX: Math.max(...chunk.flatMap(c => c.items.map(i => i.x))) });
        i += take - 1;
        break;
      }
    }
  }
  return found.sort((a, b) => a.y - b.y);
}

/** Splits a page into transaction columns: values are everything right of the label column. */
function posRows(items: PdfTextItem[], bands: Band[], labelX: number): PosRow[] {
  const values = items.filter(i => i.x > labelX);
  const dateBand = bands.find(b => b.label === "Дата зачисления");
  if (!dateBand) return [];
  const anchors = [...new Set(values
    .filter(i => i.y >= dateBand.from && i.y <= dateBand.to && (DATE.test(i.str.trim()) || i.str.trim() === "Итого"))
    .map(i => i.x))].sort((a, b) => a - b);
  if (!anchors.length) return [];
  const rows = anchors.map(x => ({ x, fields: {} as Partial<Record<PosLabel, PdfTextItem[]>> }));
  for (const item of values) {
    const band = bands.find(b => item.y >= b.from && item.y <= b.to);
    if (!band) continue;
    const row = rows.reduce((best, r) => Math.abs(r.x - item.x) < Math.abs(best.x - item.x) ? r : best, rows[0]!);
    (row.fields[band.label] ??= []).push(item);
  }
  return rows.map(r => Object.fromEntries(Object.entries(r.fields).map(([key, list]) => [
    key,
    list!.slice().sort((a, b) => a.x - b.x || b.y - a.y).map(i => i.str.trim()).join(" ").replace(/\s+/g, " ").trim(),
  ])) as PosRow);
}

const POS_METHODS: [RegExp, string][] = [
  [/hb_instfee|hb_inst|hbi/i, "Рассрочка (Halyk)"],
  [/rdmp|drdm/i, "Бонуспен төлем"],
  [/halykqr/i, "Halyk QR"],
  [/home credit/i, "Home Credit"],
  [/npk/i, "NPK QR"],
];

/**
 * One row → one operation. A row whose RRN ends with «FE» (card «HB_InstFee») is what the merchant pays the bank
 * for offering an installment — a cost, not a customer refund, so it is stored as a commission.
 */
export function posOperation(row: PosRow, legalEntityBin: string): ParsedOperation | null {
  const stamp = row["Дата и время транзакции"] ?? "";
  const date = parseDate(stamp.match(/\d{2}\.\d{2}\.\d{4}/)?.[0]);
  const gross = parseMoney(row["Сумма операции"]);
  if (!date || gross === null) return null;
  const fee = parseMoney(row["Комиссия банка"]) ?? 0;
  const typeRaw = row["Тип операции"] ?? "";
  const rrn = (row["RRN/SRN операции"] ?? "").replace(/\s+E$/i, "").trim();
  const card = row["№ карты"] ?? "";
  const time = stamp.match(/\d{2}:\d{2}:\d{2}/)?.[0] ?? "";
  const installmentFee = /FE$/.test(rrn.split(" ")[0] ?? "") || /instfee/i.test(card);
  const kind: BankOpKind = /комисси/i.test(typeRaw) || (gross < 0 && installmentFee) ? "commission"
    : gross < 0 || /возврат|отмена/i.test(typeRaw) ? "refund"
      : "sale";
  const method = `${row["Способ оплаты"] ?? ""} ${row["Платежная система"] ?? ""} ${card}`;
  const contract = row["Номер контракта"] ?? "";
  const terminal = row["№ терминала"] ?? "";
  return {
    bank: "halyk",
    legalEntity: row["Юридическое наименование"] ?? "",
    legalEntityBin,
    account: "",
    date,
    time,
    creditedDate: parseDate(row["Дата зачисления"]),
    amount: kind === "commission" ? round2(gross + fee) : round2(gross),
    // The statement prints fees as negative numbers; a cost is stored positive.
    commission: kind === "commission" ? round2(Math.abs(gross + fee)) : round2(-fee),
    tax: null,
    vat: null,
    kind,
    typeRaw,
    paymentMethod: POS_METHODS.find(([test]) => test.test(method))?.[1] ?? paymentMethodOf(method, kind),
    channel: [contract && `Эквайринг, договор ${contract}`, terminal && `терминал ${terminal}`].filter(Boolean).join(" · "),
    purpose: row["Наименование платежа"] ?? "",
    counterparty: row["Торговое наименование"] ?? "",
    address: row["Aдрес торговой точки"] ?? "",
    // RRN repeats for the paired installment-fee row, so the time keeps the two apart.
    operationNo: [rrn, time].filter(Boolean).join(" "),
    transactionNo: row["Код авторизации"] ?? "",
  };
}

/** True when a Halyk PDF is the POS statement rather than the account statement. */
export function isPosStatement(text: string): boolean {
  return /выписка по pos|pos-договор/i.test(text);
}

/** Parses the rotated POS statement; the printed «Итого» row is the self-check. */
export function parseHalykPosPages(pages: PdfTextItem[][]): ParsedStatement {
  const legalEntityBin = pages.flat().map(i => i.str).join(" ").match(/\b\d{12}\b/)?.[0] ?? "";
  const rows: PosRow[] = [];
  let bands: Band[] | null = null;
  let labelX = 0;
  for (const page of pages) {
    const found = posLabels(page);
    // Continuation pages repeat no labels: the bands measured on the first page are reused.
    if (found.some(f => f.label === "Дата зачисления") && found.length >= 12) {
      bands = found.map((f, i) => ({
        label: f.label,
        from: i === 0 ? -Infinity : (found[i - 1]!.y + f.y) / 2,
        to: i === found.length - 1 ? Infinity : (f.y + found[i + 1]!.y) / 2,
      }));
      labelX = Math.max(...found.map(f => f.maxX)) + 4;
    }
    if (bands) rows.push(...posRows(page, bands, labelX));
  }
  if (!bands) throw new Error("POS выпискасының кестесі табылмады. Halyk → «Выписка по Pos» файлын жүктеңіз.");

  const warnings: string[] = [];
  const operations: ParsedOperation[] = [];
  for (const row of rows) {
    if (!DATE.test(row["Дата зачисления"] ?? "")) continue;
    const op = posOperation(row, legalEntityBin);
    if (op) operations.push(op);
    else warnings.push(`${row["Дата и время транзакции"] ?? "?"}: жол оқылмады.`);
  }
  const totals = rows.find(r => (r["Дата зачисления"] ?? "").includes("Итого"));
  const printed = rows.filter(r => DATE.test(r["Дата зачисления"] ?? ""));
  const column = (label: PosLabel) => printed.reduce((a, r) => a + (parseMoney(r[label]) ?? 0), 0);
  const dates = operations.map(o => o.date).sort();
  const check = (label: string, expected: number | null, actual: number) =>
    expected === null ? [] : [{ label, expected: round2(expected), actual: round2(actual), ok: Math.abs(expected - actual) < 0.02 }];
  return {
    bank: "halyk",
    legalEntity: operations[0]?.legalEntity ?? "",
    legalEntityBin,
    account: "",
    periodFrom: dates[0] ?? null,
    periodTo: dates.at(-1) ?? null,
    operations,
    checks: [
      ...check("Итого: сумма операции", parseMoney(totals?.["Сумма операции"]), column("Сумма операции")),
      ...check("Итого: сумма к зачислению", parseMoney(totals?.["Сумма к зачислению"]), column("Сумма к зачислению")),
      ...check("Итого: комиссия банка", parseMoney(totals?.["Комиссия банка"]), column("Комиссия банка")),
    ],
    warnings,
  };
}
