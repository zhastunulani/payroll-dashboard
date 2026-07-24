import type { SalaryComponentKind } from "./types";

export type PayrollImportComponent = {
  name: string;
  kind: SalaryComponentKind;
  amount: number;
};

export type PayrollImportDraft = {
  department: string;
  fullName: string;
  position: string;
  baseSalary: number;
  components: PayrollImportComponent[];
  paymentMethod: string;
  isPaid: boolean;
};

export type PayrollImportSheet = {
  sheet: string;
  data: unknown[][];
};

const FULL_NAME_HEADERS = [
  "Қызметкер",
  "ФИО",
  "Ф.И.О",
  "Аты-жөні",
  "Аты жөні",
  "Сотрудник",
  "Имя сотрудника",
  "Имя",
  "Аты",
  "Name",
  "Фамилия имя",
  "Қызметкердің аты-жөні",
];

const SURNAME_HEADERS = ["Тегі", "Фамилия", "Last name"];
const FIRST_NAME_HEADERS = ["Аты", "Имя", "First name"];
const PATRONYMIC_HEADERS = ["Әкесінің аты", "Отчество", "Middle name"];
const DEPARTMENT_HEADERS = ["Бөлім", "Отдел", "Департамент"];
const POSITION_HEADERS = ["Лауазым", "Должность", "Қызметі", "Позиция"];
const PAYMENT_HEADERS = [
  "Төлем түрі",
  "Төлем форматы",
  "Способ оплаты",
  "Оплата",
  "Формат оплаты",
];
const PAID_HEADERS = ["Төленді", "Төленген", "Оплачено", "Статус оплаты"];
const BASE_HEADERS = [
  "Негізгі айлық",
  "Негізгі жалақы",
  "Базалық айлық",
  "Оклад",
  "Базовый оклад",
  "Основная зарплата",
];
const TOTAL_HEADERS = [
  "Жалпы сома",
  "Жалпы айлық",
  "Айлық",
  "Сумма",
  "Итого",
  "Общий зп",
  "ЗП",
  "Зарплата",
  "К выплате",
  "Начислено",
];
const DEDUCTION_TOKENS = [
  "ұсталым",
  "удержание",
  "вычет",
  "штраф",
  "минус",
];
const MONEY_TOKENS = [
  "айлық",
  "жалақы",
  "зарплат",
  "оклад",
  "сумма",
  "төлем",
  "оплат",
  "бонус",
  "прем",
  "қосымша",
  "доп",
  "надбав",
  "пс",
  "мат",
  "физ",
  "англ",
  "қазақ",
  "рус",
  "био",
  "хим",
  "инф",
  "гео",
  "тарих",
];
const NON_MONEY_TOKENS = [
  "номер",
  "телефон",
  "phone",
  "иин",
  "жсн",
  "табель",
  "сағат",
  "час",
  "күн",
  "дни",
  "количество",
  "адам саны",
  "балл",
  "процент",
  "пайыз",
  "ставка",
  "коэффициент",
];

export const MONTH_IMPORT_HEADERS = [
  ["Қаңтар", "Январь"],
  ["Ақпан", "Февраль"],
  ["Наурыз", "Март"],
  ["Сәуір", "Апрель"],
  ["Мамыр", "Май"],
  ["Маусым", "Июнь"],
  ["Шілде", "Июль"],
  ["Тамыз", "Август"],
  ["Қыркүйек", "Сентябрь"],
  ["Қазан", "Октябрь"],
  ["Қараша", "Ноябрь"],
  ["Желтоқсан", "Декабрь"],
] as const;

export function normalizedHeader(value: string): string {
  return value
    .trim()
    .toLocaleLowerCase("kk-KZ")
    .replace(/ё/g, "е")
    .replace(/[()[\]{}:;,.+/_-]+/g, " ")
    .replace(/\s+/g, " ");
}

function matchesHeader(header: string, aliases: readonly string[]): boolean {
  const normalized = normalizedHeader(header);
  const exactOnly = new Set([
    "аты",
    "имя",
    "name",
    "оплата",
    "сумма",
    "айлық",
    "зп",
    "пс",
  ]);
  return aliases.some((alias) => {
    const candidate = normalizedHeader(alias);
    return (
      normalized === candidate ||
      (!exactOnly.has(candidate) &&
        candidate.length >= 4 &&
        normalized.includes(candidate))
    );
  });
}

export function columnValue(
  row: Record<string, unknown>,
  aliases: readonly string[],
): unknown {
  for (const [header, value] of Object.entries(row)) {
    if (
      matchesHeader(header, aliases) &&
      value !== undefined &&
      value !== null &&
      String(value).trim() !== ""
    ) {
      return value;
    }
  }
  return "";
}

function hasNameHeader(row: unknown[]): boolean {
  const headers = row.map((cell) => String(cell ?? ""));
  return (
    headers.some((header) => matchesHeader(header, FULL_NAME_HEADERS)) ||
    (headers.some((header) => matchesHeader(header, SURNAME_HEADERS)) &&
      headers.some((header) => matchesHeader(header, FIRST_NAME_HEADERS)))
  );
}

function headerScore(row: unknown[]): number {
  if (!hasNameHeader(row)) return -1;
  const headers = row.map((cell) => String(cell ?? ""));
  let score = 10;
  for (const aliases of [
    DEPARTMENT_HEADERS,
    POSITION_HEADERS,
    PAYMENT_HEADERS,
    BASE_HEADERS,
    TOTAL_HEADERS,
  ]) {
    if (headers.some((header) => matchesHeader(header, aliases))) score += 2;
  }
  return score;
}

export function rowsFromGrid(grid: unknown[][]): Record<string, unknown>[] {
  let headerIndex = -1;
  let bestScore = -1;
  for (let index = 0; index < Math.min(grid.length, 30); index += 1) {
    const score = headerScore(grid[index] ?? []);
    if (score > bestScore) {
      bestScore = score;
      headerIndex = index;
    }
  }
  if (headerIndex < 0) return [];

  const usedHeaders = new Map<string, number>();
  const headers = (grid[headerIndex] ?? []).map((cell, index) => {
    const label = String(cell ?? "").trim() || `Баған ${index + 1}`;
    const normalized = normalizedHeader(label);
    const occurrence = (usedHeaders.get(normalized) ?? 0) + 1;
    usedHeaders.set(normalized, occurrence);
    return occurrence === 1 ? label : `${label} (${occurrence})`;
  });

  return grid
    .slice(headerIndex + 1)
    .filter((row) => row.some((cell) => String(cell ?? "").trim() !== ""))
    .map((row) =>
      Object.fromEntries(
        headers.map((header, index) => [header, row[index] ?? ""]),
      ),
    );
}

export function parseDelimitedGrid(content: string): string[][] {
  const source = content.replace(/^\uFEFF/, "");
  const sampleLines = source.split(/\r?\n/).slice(0, 10);
  const delimiter = [",", ";", "\t"].sort(
    (left, right) =>
      sampleLines.reduce(
        (total, line) => total + line.split(right).length - 1,
        0,
      ) -
      sampleLines.reduce(
        (total, line) => total + line.split(left).length - 1,
        0,
      ),
  )[0];
  const rows: string[][] = [];
  let row: string[] = [];
  let value = "";
  let quoted = false;

  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    if (character === '"') {
      if (quoted && source[index + 1] === '"') {
        value += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (character === delimiter && !quoted) {
      row.push(value);
      value = "";
    } else if ((character === "\n" || character === "\r") && !quoted) {
      if (character === "\r" && source[index + 1] === "\n") index += 1;
      row.push(value);
      if (row.some((cell) => cell.trim() !== "")) rows.push(row);
      row = [];
      value = "";
    } else {
      value += character;
    }
  }
  row.push(value);
  if (row.some((cell) => cell.trim() !== "")) rows.push(row);
  return rows;
}

export function parseMoneyValue(value: unknown): number {
  if (typeof value === "number") {
    return Number.isFinite(value) ? Math.round(value) : Number.NaN;
  }
  const source = String(value ?? "").trim();
  if (!source) return 0;
  const negative = /^-/.test(source) || /^\(.*\)$/.test(source);
  const numeric = source
    .replace(/\u00a0|\u202f|\s|'/g, "")
    .replace(/[^\d.,]/g, "");
  if (!numeric) return Number.NaN;

  const lastSeparator = Math.max(
    numeric.lastIndexOf(","),
    numeric.lastIndexOf("."),
  );
  const decimalDigits =
    lastSeparator >= 0 ? numeric.length - lastSeparator - 1 : 0;
  const hasDecimal = decimalDigits > 0 && decimalDigits <= 2;
  const integerPart = hasDecimal
    ? numeric.slice(0, lastSeparator).replace(/[.,]/g, "")
    : numeric.replace(/[.,]/g, "");
  const decimalPart = hasDecimal
    ? numeric.slice(lastSeparator + 1).replace(/[.,]/g, "")
    : "";
  const amount = Number(`${integerPart || "0"}${decimalPart ? `.${decimalPart}` : ""}`);
  if (!Number.isFinite(amount)) return Number.NaN;
  return Math.round(negative ? -amount : amount);
}

export function parsePaidValue(value: unknown): boolean {
  if (value === true || value === 1) return true;
  return ["true", "иә", "да", "төленді", "оплачено", "+"].includes(
    String(value ?? "").trim().toLocaleLowerCase("kk-KZ"),
  );
}

export function normalizePaymentMethod(
  value: unknown,
  fallback: string,
): string {
  const method = String(value ?? "").trim();
  const normalized = method.toLocaleLowerCase("kk-KZ").replace(/\s+/g, " ");
  if (!normalized || normalized === "/+пс") return fallback;
  if (
    (normalized.includes("официально") ||
      normalized.includes("ресми")) &&
    (normalized.includes("ип") || normalized.includes("жк"))
  ) {
    return "Ресми + ЖК";
  }
  if (normalized === "официально" || normalized === "ресми") return "Ресми";
  if (normalized === "ип" || normalized === "жк") return "ЖК";
  if (
    normalized.includes("самозанят") ||
    normalized.includes("өзін өзі") ||
    normalized.includes("өзін-өзі")
  ) {
    return "Өзін-өзі жұмыспен қамтыған";
  }
  if (normalized.includes("перевод") || normalized.includes("аударым")) {
    return "Аударым";
  }
  return method;
}

function personName(row: Record<string, unknown>): string {
  const surname = String(columnValue(row, SURNAME_HEADERS)).trim();
  const firstName = String(columnValue(row, FIRST_NAME_HEADERS)).trim();
  const patronymic = String(columnValue(row, PATRONYMIC_HEADERS)).trim();
  if (surname && firstName) {
    return [surname, firstName, patronymic].filter(Boolean).join(" ");
  }
  return String(columnValue(row, FULL_NAME_HEADERS)).trim();
}

function headerIsMetadata(header: string): boolean {
  return [
    FULL_NAME_HEADERS,
    SURNAME_HEADERS,
    FIRST_NAME_HEADERS,
    PATRONYMIC_HEADERS,
    DEPARTMENT_HEADERS,
    POSITION_HEADERS,
    PAYMENT_HEADERS,
    PAID_HEADERS,
  ].some((aliases) => matchesHeader(header, aliases));
}

function isPossibleMoneyColumn(header: string, value: unknown): boolean {
  const normalized = normalizedHeader(header);
  if (
    normalized === "n" ||
    normalized === "no" ||
    normalized === "id" ||
    normalized === "№" ||
    NON_MONEY_TOKENS.some((token) => normalized.includes(token))
  ) {
    return false;
  }
  if (MONEY_TOKENS.some((token) => normalized.includes(token))) return true;
  if (/[₸₽$€]|тг|тенге/i.test(String(value ?? ""))) return true;
  const amount = parseMoneyValue(value);
  return Number.isFinite(amount) && Math.abs(amount) >= 1_000;
}

function componentKind(header: string, amount: number): SalaryComponentKind {
  const normalized = normalizedHeader(header);
  return amount < 0 ||
    header.trim().startsWith("-") ||
    DEDUCTION_TOKENS.some((token) => normalized.includes(token))
    ? "deduction"
    : "addition";
}

function componentLabel(header: string): string {
  return header
    .replace(/\s+\(\d+\)$/, "")
    .replace(/^[+-]\s*/, "")
    .trim()
    .slice(0, 80);
}

export function extractPayrollImportRow(
  row: Record<string, unknown>,
  options: {
    fallbackDepartment: string;
    fallbackPaymentMethod: string;
    selectedMonth: number;
  },
): PayrollImportDraft {
  const selectedMonthHeaders =
    MONTH_IMPORT_HEADERS[options.selectedMonth - 1] ?? [];
  const baseEntry = Object.entries(row).find(([header, value]) =>
    matchesHeader(header, BASE_HEADERS) &&
    String(value ?? "").trim() !== "",
  );
  const totalAliases = [...TOTAL_HEADERS, ...selectedMonthHeaders];
  const totalEntry = Object.entries(row).find(([header, value]) =>
    matchesHeader(header, totalAliases) &&
    String(value ?? "").trim() !== "",
  );
  const components: PayrollImportComponent[] = [];

  for (const [header, value] of Object.entries(row)) {
    if (
      headerIsMetadata(header) ||
      header === baseEntry?.[0] ||
      header === totalEntry?.[0] ||
      !isPossibleMoneyColumn(header, value)
    ) {
      continue;
    }
    const parsed = parseMoneyValue(value);
    if (!Number.isFinite(parsed) || parsed === 0) continue;
    const name = componentLabel(header);
    if (!name) continue;
    components.push({
      name,
      kind: componentKind(header, parsed),
      amount: Math.abs(parsed),
    });
  }

  const componentTotal = components.reduce(
    (sum, component) =>
      sum +
      (component.kind === "deduction" ? -component.amount : component.amount),
    0,
  );
  const explicitBase = baseEntry ? parseMoneyValue(baseEntry[1]) : Number.NaN;
  const explicitTotal = totalEntry ? parseMoneyValue(totalEntry[1]) : Number.NaN;
  const baseSalary = Number.isFinite(explicitTotal)
    ? explicitTotal
    : (Number.isFinite(explicitBase) ? explicitBase : 0) + componentTotal;

  return {
    department:
      String(columnValue(row, DEPARTMENT_HEADERS)).trim() ||
      options.fallbackDepartment,
    fullName: personName(row),
    position: String(columnValue(row, POSITION_HEADERS)).trim(),
    baseSalary,
    components: [],
    paymentMethod: normalizePaymentMethod(
      columnValue(row, PAYMENT_HEADERS),
      options.fallbackPaymentMethod,
    ),
    isPaid: parsePaidValue(columnValue(row, PAID_HEADERS)),
  };
}

function departmentSheetTokens(departmentId: string, name: string): string[] {
  const systemTokens: Record<string, string[]> = {
    "dept-academ": ["академ"],
    "dept-teachers": ["мұғалім", "мугалим", "учител"],
    "dept-marketing": ["маркетинг", "eduser"],
    "dept-ustaz-media": ["ustaz", "media"],
    "dept-curators": ["куратор", "curator"],
    "dept-sales": ["сату", "продаж", "sales"],
  };
  return [
    normalizedHeader(name),
    ...(systemTokens[departmentId] ?? []),
  ].filter(Boolean);
}

export function selectImportSheets(
  sheets: PayrollImportSheet[],
  departmentId: string,
  departmentName: string,
): PayrollImportSheet[] {
  const usable = sheets.filter((sheet) => rowsFromGrid(sheet.data).length > 0);
  if (usable.length <= 1) return usable;
  const tokens = departmentSheetTokens(departmentId, departmentName);
  const matches = usable.filter((sheet) => {
    const sheetName = normalizedHeader(sheet.sheet);
    return tokens.some(
      (token) => sheetName.includes(token) || token.includes(sheetName),
    );
  });
  return matches.length ? matches : usable;
}
