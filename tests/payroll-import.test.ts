import assert from "node:assert/strict";
import test from "node:test";
import {
  extractPayrollImportRow,
  parseDelimitedGrid,
  parseMoneyValue,
  rowsFromGrid,
  selectImportSheets,
} from "../lib/payroll-import.ts";

test("money parser understands grouped tenge and decimal cells", () => {
  assert.equal(parseMoneyValue("1 200 000 ₸"), 1_200_000);
  assert.equal(parseMoneyValue("91\u00a0500 тг"), 91_500);
  assert.equal(parseMoneyValue("200 000,00"), 200_000);
  assert.equal(parseMoneyValue(55_500.4), 55_500);
  assert.equal(parseMoneyValue("(12 500)"), -12_500);
});

test("excel rows are found below title rows and all amount columns are captured", () => {
  const records = rowsFromGrid([
    ["Кураторлар айлығы"],
    [],
    ["№", "ФИО", "Мат 2.2", "Мат 4.2", "Итого", "Способ оплаты"],
    [1, "Абдулгаппаров Нодирбек", "36 000 ₸", 55_500, 91_500, "перевод"],
  ]);
  assert.equal(records.length, 1);

  const parsed = extractPayrollImportRow(records[0], {
    fallbackDepartment: "Кураторлар",
    fallbackPaymentMethod: "Аударым",
    selectedMonth: 7,
  });
  assert.deepEqual(parsed, {
    department: "Кураторлар",
    fullName: "Абдулгаппаров Нодирбек",
    position: "",
    baseSalary: 91_500,
    components: [],
    paymentMethod: "Аударым",
    isPaid: false,
  });
});

test("separate name columns, base salary, additions and deductions are recognized", () => {
  const [record] = rowsFromGrid([
    [
      "Фамилия",
      "Имя",
      "Отчество",
      "Оклад",
      "ПС",
      "Удержание",
      "Формат оплаты",
    ],
    [
      "Амангелді",
      "Нұрдәулет",
      "Серікұлы",
      "200 000",
      "55 500",
      "10 000",
      "официально + ИП",
    ],
  ]);
  const parsed = extractPayrollImportRow(record, {
    fallbackDepartment: "Кураторлар",
    fallbackPaymentMethod: "Аударым",
    selectedMonth: 7,
  });

  assert.equal(parsed.fullName, "Амангелді Нұрдәулет Серікұлы");
  assert.equal(parsed.baseSalary, 245_500);
  assert.deepEqual(parsed.components, []);
  assert.equal(parsed.paymentMethod, "Ресми + ЖК");
});

test("CSV and multi-sheet imports select the current department", () => {
  const csv = [
    "Айлық реестр",
    "ФИО;Сумма;Оплата",
    "Аман Ақнұр;115 152;перевод",
  ].join("\n");
  assert.equal(rowsFromGrid(parseDelimitedGrid(csv)).length, 1);

  const sheets = [
    {
      sheet: "Кураторлар",
      data: [["ФИО", "Сумма"], ["Аман Ақнұр", 115_152]],
    },
    {
      sheet: "Отдел продаж",
      data: [["ФИО", "Сумма"], ["Сату менеджері", 250_000]],
    },
  ];
  assert.deepEqual(
    selectImportSheets(sheets, "dept-sales", "Сату бөлімі").map(
      (sheet) => sheet.sheet,
    ),
    ["Отдел продаж"],
  );
});

test("non-standard role and salary headers are inferred from workbook contents", () => {
  const records = rowsFromGrid([
    ["№", "МЕНЕДЖЕРЫ", null, "ЗАРПЛАТА"],
    [100, "Амина", null, "182\u00a0614"],
    [101, "Ақниет", null, "178\u00a0411"],
    [102, null, null, null],
    [103, "Жарқын", null, "134\u00a0715"],
    [104, "Жұлдызай", null, "165\u00a0529"],
  ]);

  assert.equal(records.length, 4);
  assert.deepEqual(
    records.map((record) => {
      const parsed = extractPayrollImportRow(record, {
        fallbackDepartment: "Сату бөлімі",
        fallbackPaymentMethod: "Аударым",
        selectedMonth: 8,
      });
      return [parsed.fullName, parsed.baseSalary];
    }),
    [
      ["Амина", 182_614],
      ["Ақниет", 178_411],
      ["Жарқын", 134_715],
      ["Жұлдызай", 165_529],
    ],
  );
});

test("unknown column labels are inferred when they contain names and salaries", () => {
  const records = rowsFromGrid([
    ["Реттік нөмір", "Тізім", "Жауапты сома"],
    [1, "Айдана Серік", "250 000 ₸"],
    [2, "Нұржан Аман", "310 000 ₸"],
  ]);
  assert.equal(records.length, 2);

  const first = extractPayrollImportRow(records[0], {
    fallbackDepartment: "Сату бөлімі",
    fallbackPaymentMethod: "Аударым",
    selectedMonth: 8,
  });
  assert.equal(first.fullName, "Айдана Серік");
  assert.equal(first.baseSalary, 250_000);
});

test("scattered curator rows are grouped by employee and summed from the final total", () => {
  const empty = null;
  const grid = [
    [
      empty,
      empty,
      empty,
      empty,
      "Бірінші апта",
      empty,
      empty,
      "Екінші апта",
      empty,
      empty,
      "Үшінші апта",
      empty,
      empty,
      "Төртінші апта",
      empty,
      empty,
      empty,
      empty,
      "Барлығы",
    ],
    [
      "№",
      "Аты-жөні",
      "Ағым",
      "Телефон",
      "Оқушы саны",
      "Extra",
      "Сумма",
      "Оқушы саны",
      "Extra",
      "Сумма",
      "Оқушы саны",
      "Extra",
      "Сумма",
      "Оқушы саны",
      "Extra",
      "Сумма",
      "Бонус",
      "Штраф",
      empty,
    ],
    [1, "Аман Ақнұр", "Англ 1", "8705", empty, 0, 0, empty, empty, 0, empty, empty, 0, empty, 0, 0, "20 000 ₸", "1 000 ₸", "19 000 ₸"],
    [empty, empty, "Англ 4", empty, empty, 0, 0, empty, empty, 0, empty, empty, 0, empty, 0, 0, empty, empty, 0],
    [empty, empty, "Англ 1,2,3,4", empty, 49, 2371, "18 968 ₸", 49, 0, "16 597 ₸", 49, 0, "16 597 ₸", 49, 4742, "21 339 ₸", empty, empty, "73 500 ₸"],
    [empty, empty, "Англ 9", empty, 8, 774, "6 194 ₸", 8, 0, "5 419 ₸", 7, 200, "4 942 ₸", 7, 1355, "6 097 ₸", empty, empty, "22 652 ₸"],
    [20, empty, "ДжТ 4", "8775", 45, 2177, "32 661 ₸", 45, empty, "15 242 ₸", 43, empty, "14 565 ₸", 43, 4161, "18 726 ₸", empty, 664, "80 530 ₸"],
    [empty, empty, "ДжТ 10", empty, 18, 1742, "13 935 ₸", 18, empty, "12 194 ₸", 18, empty, "12 194 ₸", 18, 3484, "15 677 ₸", empty, empty, "53 336 ₸"],
    [empty, "Дүйсенова Ақерке", "ДЖТ 1-3", empty, empty, empty, empty, empty, empty, 0, 45, empty, "15 242 ₸", 45, empty, "15 242 ₸", empty, empty, "30 484 ₸"],
  ];

  const records = rowsFromGrid(grid);
  assert.equal(records.length, 2);
  const parsed = records.map((record) =>
    extractPayrollImportRow(record, {
      fallbackDepartment: "Кураторлар",
      fallbackPaymentMethod: "Аударым",
      selectedMonth: 8,
    }),
  );
  assert.deepEqual(
    parsed.map(({ fullName, baseSalary }) => ({ fullName, baseSalary })),
    [
      { fullName: "Аман Ақнұр", baseSalary: 115_152 },
      { fullName: "Дүйсенова Ақерке", baseSalary: 164_350 },
    ],
  );
});
